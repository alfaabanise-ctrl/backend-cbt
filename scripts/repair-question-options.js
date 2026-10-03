import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Question from "../model/Question.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIRECTORY, "../.env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const OPTION_KEYS = ["a", "b", "c", "d", "e"];
const BATCH_SIZE = 200;
const applyChanges = process.argv.includes("--apply");

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getRawOption(rawOptions, key) {
  const value = hasOwn(rawOptions, key)
    ? rawOptions[key]
    : rawOptions[key.toUpperCase()];

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function isBlankOption(value) {
  return value === null || value === undefined ||
    (typeof value === "string" && value.trim() === "");
}

function createCondition(question, updates) {
  const conditions = Object.keys(updates).map((key) => ({
    $or: [
      { [`options.${key}`]: { $exists: false } },
      { [`options.${key}`]: null },
      { [`options.${key}`]: "" },
      { [`options.${key}`]: /^\s*$/ },
    ],
  }));

  return {
    _id: question._id,
    $and: conditions,
  };
}

async function main() {
  const mongoUri = process.env.DATA_BASE;
  if (!mongoUri) {
    throw new Error("DATA_BASE is missing from .env");
  }

  let connected = false;
  const bySubject = new Map();
  let questionsScanned = 0;
  let questionsRepairable = 0;
  let optionsRepairable = 0;
  let questionsUpdated = 0;
  let pendingWrites = [];

  try {
    await mongoose.connect(mongoUri);
    connected = true;

    const cursor = Question.find({ "rawData.options": { $exists: true } })
      .select("_id subject options rawData.options")
      .lean()
      .cursor();

    const flushWrites = async () => {
      if (!pendingWrites.length) {
        return;
      }

      const result = await Question.bulkWrite(pendingWrites, {
        ordered: false,
      });
      questionsUpdated += result.modifiedCount;
      pendingWrites = [];
    };

    for await (const question of cursor) {
      questionsScanned++;
      const rawOptions = question.rawData?.options;
      if (
        !rawOptions ||
        typeof rawOptions !== "object" ||
        Array.isArray(rawOptions)
      ) {
        continue;
      }

      const updates = {};
      for (const key of OPTION_KEYS) {
        if (!isBlankOption(question.options?.[key])) {
          continue;
        }

        const value = getRawOption(rawOptions, key);
        if (value !== null) {
          updates[key] = value;
        }
      }

      const optionCount = Object.keys(updates).length;
      if (optionCount === 0) {
        continue;
      }

      questionsRepairable++;
      optionsRepairable += optionCount;
      const subject = question.subject || "(unspecified)";
      const subjectStats = bySubject.get(subject) || {
        questions: 0,
        options: 0,
      };
      subjectStats.questions++;
      subjectStats.options += optionCount;
      bySubject.set(subject, subjectStats);

      if (applyChanges) {
        pendingWrites.push({
          updateOne: {
            filter: createCondition(question, updates),
            update: {
              $set: Object.fromEntries(
                Object.entries(updates).map(([key, value]) => [
                  `options.${key}`,
                  value,
                ]),
              ),
            },
          },
        });

        if (pendingWrites.length >= BATCH_SIZE) {
          await flushWrites();
        }
      }
    }

    if (applyChanges) {
      await flushWrites();
    }

    console.log(applyChanges ? "OPTION REPAIR COMPLETE" : "OPTION REPAIR DRY RUN");
    console.log(`Questions scanned: ${questionsScanned}`);
    console.log(`Questions with recoverable options: ${questionsRepairable}`);
    console.log(`Option values recoverable from raw data: ${optionsRepairable}`);
    if (applyChanges) {
      console.log(`Questions updated: ${questionsUpdated}`);
    } else {
      console.log("No database changes made. Run with --apply to fill these values.");
    }
    console.table(
      [...bySubject.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([subject, stats]) => ({
          subject,
          questions: stats.questions,
          optionValues: stats.options,
        })),
    );
  } finally {
    if (connected) {
      await mongoose.disconnect();
    }
  }
}

main().catch((error) => {
  console.error(`Question option repair failed: ${error.message}`);
  process.exitCode = 1;
});
