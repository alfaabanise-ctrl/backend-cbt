// bigTextToHtml.js
// Usage:
//   node bigTextToHtml.js            -> AI corrects words, then converts to HTML
//   node bigTextToHtml.js --no-ai    -> converts to HTML only (instant, no Gemini)
// Input:  input.txt
// Output: output.html (use with v-html), plus corrected.txt when AI is used

import "dotenv/config";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

/* =========================================================
   CONFIG
========================================================= */

const USE_AI = !process.argv.includes("--no-ai");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";

const MAX_WORDS = 1500;
const CONCURRENCY = 2;
const RETRIES = 6;

const ai = USE_AI ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const countWords = (s) => s.split(/\s+/).filter(Boolean).length;
const countLines = (s) => s.split("\n").filter((l) => l.trim()).length;

/* =========================================================
   PLAIN TEXT -> SAFE HTML (no AI)
========================================================= */

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inline = (s) => esc(s).replace(/\*(.+?)\*/g, "<strong>$1</strong>");

export function textToHtml(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  let html = "";
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html += "</ol>";
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }

    // ═══ separator
    if (/^[═=─-]{5,}$/.test(line)) {
      closeList();
      html += "<hr>";
      continue;
    }

    // *WHOLE LINE BOLD*  -> main title
    let m = line.match(/^\*(.+)\*$/);
    if (m) {
      closeList();
      html += `<h2>${esc(m[1].replace(/\*/g, ""))}</h2>`;
      continue;
    }

    // SECTION A / SECTION I: ... / PART II: ...  -> section heading
    if (/^(SECTION|PART)\s+[A-Z0-9]+\b/i.test(line)) {
      closeList();
      html += `<h2>${inline(line)}</h2>`;
      continue;
    }

    // =SEDIMENTARY ROCKS=  -> heading
    m = line.match(/^=(.+)=$/);
    if (m) {
      closeList();
      html += `<h3>${inline(m[1])}</h3>`;
      continue;
    }

    // (2a) (4bi) (5aii) alone -> question heading
    m = line.match(/^\((\d+[a-z]*)\)$/i);
    if (m) {
      closeList();
      html += `<h3>Question ${m[1]}</h3>`;
      continue;
    }

    // (i) (ii) (iii) item -> list
    m = line.match(/^\((i{1,3}|iv|v|vi{0,3}|ix|x)\)\s*(.*)$/i);
    if (m) {
      if (!listOpen) {
        html += '<ol type="i">';
        listOpen = true;
      }
      const body = m[2];
      const lab = body.match(/^([^:]{2,40}):\s*(.+)$/); // "Label: text"
      html += lab
        ? `<li><strong>${inline(lab[1])}:</strong> ${inline(lab[2])}</li>`
        : `<li>${inline(body)}</li>`;
      continue;
    }

    // normal line
    closeList();
    html += `<p>${inline(line)}</p>`;
  }

  closeList();
  return html;
}

/* =========================================================
   AI: CORRECT WORDS ONLY
========================================================= */

async function correctText(text, model = MODEL) {
  const prompt = `
You are a careful proofreader.
Correct spelling, grammar and punctuation in the text below.

RULES:
- Do NOT add, remove, or reorder lines.
- Do NOT change meaning, numbers, units, names or answers.
- Keep markers exactly as they are: *bold*, =HEADING=, (i), (2a), (4bi), ═══ lines.
- Do NOT use Markdown or HTML.
- Return ONLY JSON: {"text": "..."}

TEXT:
${text}`;

  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  });

  return JSON.parse(res.text).text;
}

const isOverloaded = (err) => {
  const m = String(err?.message || err).toLowerCase();
  return (
    m.includes("503") ||
    m.includes("unavailable") ||
    m.includes("high demand") ||
    m.includes("429") ||
    m.includes("quota") ||
    m.includes("rate limit")
  );
};

function splitIntoChunks(text) {
  const blocks = text.split(/\n(?=[═=─-]{5,}\n?)|\n{2,}/);
  const chunks = [];
  let current = "";

  for (const block of blocks) {
    if (countWords(current + block) > MAX_WORDS && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += block + "\n\n";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function safeCorrect(chunk, index) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const model = attempt > 3 ? FALLBACK_MODEL : MODEL;

    try {
      const fixed = await correctText(chunk, model);

      const before = countLines(chunk);
      const after = countLines(fixed);
      const wordRatio = countWords(fixed) / countWords(chunk);

      if (after !== before || wordRatio < 0.85 || wordRatio > 1.15) {
        throw new Error(
          `Chunk ${index + 1}: lines ${before}->${after}, words ratio ${wordRatio.toFixed(2)}`
        );
      }
      return fixed;
    } catch (err) {
      const overloaded = isOverloaded(err);
      console.error(
        `⚠️ Chunk ${index + 1} attempt ${attempt} (${model}): ${
          overloaded ? "Gemini is busy (503/429)" : err.message
        }`
      );

      if (attempt < RETRIES) {
        const wait = overloaded
          ? Math.min(60000, 10000 * 2 ** (attempt - 1)) + Math.random() * 2000
          : 3000 * attempt;
        console.log(`⏳ Waiting ${Math.round(wait / 1000)}s...`);
        await sleep(wait);
      }
    }
  }

  console.error(`❌ Chunk ${index + 1} failed, keeping original text`);
  return chunk;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      done++;
      console.log(`✅ ${done}/${items.length}`);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  const input = fs.readFileSync("input.txt", "utf8");
  console.log(`📄 ${countWords(input)} words`);

  let finalText = input;

  if (USE_AI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing from .env");
    }
    const chunks = splitIntoChunks(input);
    console.log(`📦 ${chunks.length} chunks`);
    const fixed = await mapLimit(chunks, CONCURRENCY, safeCorrect);
    finalText = fixed.join("\n\n");
    fs.writeFileSync("corrected.txt", finalText);
  } else {
    console.log("⚡ --no-ai: skipping Gemini");
  }

  fs.writeFileSync("output.html", textToHtml(finalText));
  console.log("🏁 Done -> output.html");
}

main().catch((err) => {
  console.error("❌ FATAL:", err.message);
  process.exit(1);
});