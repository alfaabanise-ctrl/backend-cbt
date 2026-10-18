import cluster from "node:cluster";
import { randomUUID } from "node:crypto";

const WORKER_ID = process.env.WORKER_ID || "1";

const stats = {
  workerId: WORKER_ID,
  pid: process.pid,
  startedAt: Date.now(),
  requests: 0,
  errors: 0, // responses with status 500 and above
  active: 0, // requests being processed right now
  totalMs: 0,
  maxMs: 0,
  slowest: null,
  recent: [], // last 20 requests
};

function snapshot() {
  return {
    ...stats,
    avgMs: stats.requests ? +(stats.totalMs / stats.requests).toFixed(1) : 0,
    maxMs: +stats.maxMs.toFixed(1),
    totalMs: +stats.totalMs.toFixed(1),
    uptimeSec: Math.round((Date.now() - stats.startedAt) / 1000),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };
}

// ------------------------------------------------------------
// Middleware: time each request and log it
// ------------------------------------------------------------
export function requestTimer(req, res, next) {
  const start = process.hrtime.bigint();
  const path = req.originalUrl.split("?")[0]; // never log the query (it holds tokens)
  let finished = false;

  stats.active++;

  // Add timing headers just before the response headers are sent
  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    if (!res.headersSent) {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      res.setHeader("X-Worker-Id", WORKER_ID);
      res.setHeader("X-Response-Time", `${ms.toFixed(1)}ms`);
    }
    return originalWriteHead.apply(this, args);
  };

  const finish = (aborted) => {
    if (finished) return;
    finished = true;

    const ms = Number(process.hrtime.bigint() - start) / 1e6;

    stats.active--;
    stats.requests++;
    stats.totalMs += ms;
    if (res.statusCode >= 500) stats.errors++;

    if (ms > stats.maxMs) {
      stats.maxMs = ms;
      stats.slowest = `${req.method} ${path} (${ms.toFixed(1)}ms)`;
    }

    stats.recent.unshift({
      time: new Date().toISOString(),
      method: req.method,
      path,
      status: aborted ? "aborted" : res.statusCode,
      ms: +ms.toFixed(1),
    });
    if (stats.recent.length > 20) stats.recent.pop();

    console.log(
      `[worker ${WORKER_ID} | pid ${process.pid}] ${req.method} ${path} -> ` +
        `${aborted ? "aborted" : res.statusCode} in ${ms.toFixed(1)}ms`
    );
  };

  res.on("finish", () => finish(false));
  res.on("close", () => finish(true));

  next();
}

// ------------------------------------------------------------
// Workers report their numbers to the primary every 2 seconds
// ------------------------------------------------------------
export function startStatsReporting() {
  if (!cluster.isWorker || !process.send) return;

  setInterval(() => {
    process.send({ type: "worker-stats", stats: snapshot() });
  }, 2000).unref();
}

// Ask the primary for ALL workers' numbers
export function getAllStats() {
  return new Promise((resolve) => {
    if (!cluster.isWorker || !process.send) return resolve([snapshot()]);

    const id = randomUUID();

    const timeout = setTimeout(() => {
      process.off("message", handler);
      resolve([snapshot()]);
    }, 1500);

    function handler(msg) {
      if (msg?.type === "all-stats" && msg.id === id) {
        clearTimeout(timeout);
        process.off("message", handler);
        const others = msg.workers.filter((w) => w.pid !== process.pid);
        resolve([...others, snapshot()].sort((a, b) =>
          String(a.workerId).localeCompare(String(b.workerId), undefined, { numeric: true })
        ));
      }
    }

    process.on("message", handler);
    process.send({ type: "get-all-stats", id });
  });
}

// ------------------------------------------------------------
// Stats routes (JSON and a simple page)
// ------------------------------------------------------------
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

function allowed(req) {
  const key = process.env.STATS_KEY;
  return !key || req.query.key === key;
}

export async function statsJson(req, res) {
  if (!allowed(req)) return res.status(401).json({ success: false, message: "Unauthorized" });
  res.json({ servedBy: WORKER_ID, workers: await getAllStats() });
}

export async function statsPage(req, res) {
  if (!allowed(req)) return res.status(401).send("Unauthorized");

  const workers = await getAllStats();

  const rows = workers
    .map(
      (w) => `<tr>
        <td>${esc(w.workerId)}</td><td>${esc(w.pid)}</td><td>${esc(w.requests)}</td>
        <td>${esc(w.active)}</td><td>${esc(w.avgMs)} ms</td><td>${esc(w.maxMs)} ms</td>
        <td>${esc(w.errors)}</td><td>${esc(w.memoryMB)} MB</td><td>${esc(w.uptimeSec)} s</td>
        <td>${esc(w.slowest || "-")}</td></tr>`
    )
    .join("");

  const recent = workers
    .flatMap((w) => w.recent.map((r) => ({ ...r, worker: w.workerId })))
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 30)
    .map(
      (r) => `<tr><td>${esc(r.time)}</td><td>${esc(r.worker)}</td><td>${esc(r.method)}</td>
        <td>${esc(r.path)}</td><td>${esc(r.status)}</td><td>${esc(r.ms)} ms</td></tr>`
    )
    .join("");

  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2">
<title>Server stats</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;background:#f6f7f9;color:#1c1e21}
  table{border-collapse:collapse;width:100%;margin-bottom:28px;background:#fff}
  th,td{border:1px solid #dde0e4;padding:6px 10px;text-align:left;font-size:14px}
  th{background:#eef1f5}
</style></head><body>
<h2>Workers (page refreshes every 2 seconds)</h2>
<table><tr><th>Worker</th><th>PID</th><th>Requests</th><th>Active now</th><th>Average</th>
<th>Slowest</th><th>Errors</th><th>Memory</th><th>Uptime</th><th>Slowest request</th></tr>${rows}</table>
<h2>Latest requests</h2>
<table><tr><th>Time</th><th>Worker</th><th>Method</th><th>Path</th><th>Status</th><th>Time taken</th></tr>${recent}</table>
</body></html>`);
}