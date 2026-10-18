import cluster from "node:cluster";
import os from "node:os";

const cores = os.availableParallelism();
const workers = Number(process.env.WORKERS) || 6;

if (cluster.isPrimary) {
  cluster.schedulingPolicy = cluster.SCHED_RR;

  console.log(`Primary ${process.pid}: starting ${workers} workers on ${cores} cores`);

  const latest = new Map(); // cluster worker.id -> last stats
  const numberOf = new Map(); // cluster worker.id -> our worker number (1..6)

  const start = (number) => {
    const worker = cluster.fork({ WORKER_ID: String(number) });
    numberOf.set(worker.id, number);
  };

  for (let i = 1; i <= workers; i++) start(i);

  cluster.on("message", (worker, msg) => {
    if (msg?.type === "worker-stats") {
      latest.set(worker.id, msg.stats);
    } else if (msg?.type === "get-all-stats") {
      worker.send({ type: "all-stats", id: msg.id, workers: [...latest.values()] });
    }
  });

  cluster.on("exit", (worker, code) => {
    console.warn(`Worker ${numberOf.get(worker.id)} (pid ${worker.process.pid}) exited (${code}), restarting...`);
    const number = numberOf.get(worker.id);
    latest.delete(worker.id);
    numberOf.delete(worker.id);
    start(number);
  });
} else {
  await import("./server.js");
}