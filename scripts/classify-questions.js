import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Question from "../model/Question.js";
import {
  classifyQuestionBatch,
  ExplanationServiceError,
} from "../services/ai/explanationService.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIRECTORY, "../.env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const DEFAULT_RUN_LIMIT = 100;
const MAX_BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

const missingValue = (field) => ({
  $or: [
    { [field]: { $exists: false } },
    { [field]: null },
    { [field]: "" },
    { [field]: /^\s*$/ },
  ],
});

const missingClassificationFilter = {
  $or: [missingValue("topic"), missingValue("difficulty")],
};

function getLimit() {
  if (process.argv.includes("--all")) {
    return 0;
  }

  const limitArgument = process.argv.find((argument) =>
    argument.startsWith("--limit="),
  );
  const value =
    limitArgument?.slice("--limit=".length) ??
    process.env.CLASSIFICATION_TEST_LIMIT ??
    String(DEFAULT_RUN_LIMIT);

  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("--limit must be a positive safe integer.");
  }

  return Number(value);
}

function getBatchSize() {
  const batchArgument = process.argv.find((argument) =>
    argument.startsWith("--batch-size="),
  );
  const value =
    batchArgument?.slice("--batch-size=".length) ??
    process.env.CLASSIFICATION_BATCH_SIZE ??
    String(MAX_BATCH_SIZE);

  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("--batch-size must be a positive safe integer.");
  }
  if (Number(value) > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size cannot exceed ${MAX_BATCH_SIZE}.`);
  }

  return Number(value);
}

function getFilter() {
  const filter = { ...missingClassificationFilter };
  const subjectArgument = process.argv.find((argument) =>
    argument.startsWith("--subject="),
  );
  const examTypeArgument = process.argv.find((argument) =>
    argument.startsWith("--exam-type="),
  );

  if (subjectArgument) {
    filter.subject = subjectArgument.slice("--subject=".length).trim().toLowerCase();
  }
  if (examTypeArgument) {
    filter.examType = examTypeArgument
      .slice("--exam-type=".length)
      .trim()
      .toLowerCase();
  }

  return filter;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getProviderStatus(error) {
  return error?.cause?.status ?? error?.cause?.response?.status;
}

function isFatalProviderError(error) {
  const status = getProviderStatus(error);
  return status === 401 || status === 403 || status === 429 || status === 503;
}

async function classifyBatchWithRetry(questions) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await classifyQuestionBatch(questions);
    } catch (error) {
      if (getProviderStatus(error) === 429) {
        throw error;
      }
      if (
        !(error instanceof ExplanationServiceError) ||
        !error.retryable ||
        attempt === MAX_ATTEMPTS
      ) {
        throw error;
      }

      const waitMs = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Temporary Gemini failure; retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs}ms.`,
      );
      await delay(waitMs);
    }
  }

  throw new Error("Question batch classification ended without a result.");
}

function toAIQuestion(question) {
  return {
    sourceId: question.sourceId,
    question: question.question || question.questionText || question.text || "",
    options: question.options ?? null,
    correctAnswer: question.correctAnswer || question.answer || null,
    subject: question.subject ?? null,
    examType: question.examType ?? null,
    year: question.year ?? null,
    questionNumber: question.questionNumber ?? question.number ?? null,
  };
}

function isMissing(value) {
  return typeof value !== "string" || value.trim() === "";
}

async function saveClassifications(questions, classifications) {
  const questionsBySourceId = new Map(
    questions.map((question) => [question.sourceId, question]),
  );
  const writes = [];
  let skipped = 0;

  for (const [sourceId, result] of classifications) {
    const question = questionsBySourceId.get(sourceId);
    if (!question) {
      throw new Error(`No database question found for sourceId ${sourceId}.`);
    }

    const set = {};
    const filter = {
      _id: question._id,
      sourceId,
      $and: [],
    };

    if (isMissing(question.topic)) {
      filter.$and.push(missingValue("topic"));
      set.topic = result.topic;
    }
    if (isMissing(question.difficulty)) {
      filter.$and.push(missingValue("difficulty"));
      set.difficulty = result.difficulty;
    }

    if (Object.keys(set).length === 0) {
      skipped++;
      continue;
    }

    set.classification = {
      sourceType: "gemini-ai",
      confidence: result.confidence,
      needsReview: result.needsReview,
    };
    writes.push({
      updateOne: {
        filter,
        update: { $set: set },
      },
    });
  }

  if (writes.length === 0) {
    return { saved: 0, skipped };
  }

  const result = await Question.bulkWrite(writes, {
    ordered: false,
  });
  return {
    saved: result.modifiedCount,
    skipped: skipped + (writes.length - result.modifiedCount),
  };
}

async function classifyBatch(questions, batchNumber) {
  console.log(
    `\n[Batch ${batchNumber}] Sending ${questions.length} questions to Gemini.`,
  );

  const sourceIds = new Set();
  for (const question of questions) {
    if (!question.sourceId || sourceIds.has(question.sourceId)) {
      throw new Error(
        `Classification batch contains a missing or duplicate sourceId: ${question.sourceId || "(empty)"}. No classifications from this batch were saved.`,
      );
    }
    sourceIds.add(question.sourceId);
  }

  try {
    const classifications = await classifyBatchWithRetry(
      questions.map(toAIQuestion),
    );
    const result = await saveClassifications(questions, classifications);
    console.log(
      `[SAVED] ${result.saved} classifications; ${result.skipped} skipped.`,
    );
    return result;
  } catch (error) {
    console.error(`[FAILED] Batch ${batchNumber}: ${error.message}`);
    return {
      saved: 0,
      skipped: 0,
      failed: questions.length,
      providerUnavailable: isFatalProviderError(error),
    };
  }
}

async function main() {
  const mongoUri = process.env.DATA_BASE;
  if (!mongoUri) {
    throw new Error("DATA_BASE is missing from .env");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from .env");
  }

  const limit = getLimit();
  const batchSize = getBatchSize();
  const filter = getFilter();
  let connected = false;
  const stats = { processed: 0, successful: 0, skipped: 0, failed: 0, batches: 0 };

  try {
    await mongoose.connect(mongoUri);
    connected = true;

    const remaining = await Question.countDocuments(filter);
    const planned = limit === 0 ? remaining : Math.min(remaining, limit);

    console.log("==================================================");
    console.log("QUESTION TOPIC AND DIFFICULTY CLASSIFIER");
    console.log(`Questions needing classification: ${remaining}`);
    console.log(`Questions in this run: up to ${planned}`);
    console.log(`Questions per Gemini request: ${batchSize}`);
    console.log(`Gemini model: ${process.env.GEMINI_MODEL || "gemini-3.8-flash"}`);
    console.log("Difficulty scale: easy / medium / hard");
    console.log("Each batch is validated and matched by sourceId before saving.");
    console.log("==================================================");

    const cursor = Question.find(filter)
      .sort({ _id: 1 })
      .select(
        "_id sourceId topic difficulty question questionText text options answer correctAnswer subject examType year questionNumber number",
      )
      .limit(limit)
      .cursor();

    let batch = [];
    const processCurrentBatch = async () => {
      if (batch.length === 0) {
        return false;
      }
      stats.batches++;
      stats.processed += batch.length;
      const result = await classifyBatch(batch, stats.batches);
      stats.successful += result.saved;
      stats.skipped += result.skipped;
      stats.failed += result.failed || 0;
      batch = [];
      return Boolean(result.providerUnavailable || result.failed);
    };

    for await (const question of cursor) {
      batch.push(question);
      if (batch.length >= batchSize) {
        if (await processCurrentBatch()) {
          console.error("Stopping after a failed batch; rerun to resume safely.");
          break;
        }
      }
    }

    if (batch.length > 0) {
      await processCurrentBatch();
    }

    const remainingAfterRun = await Question.countDocuments(filter);
    console.log("\n==================================================");
    console.log("COMPLETE");
    console.log(`Processed: ${stats.processed} of up to ${planned}`);
    console.log(`Batches sent: ${stats.batches}`);
    console.log(`Classified: ${stats.successful}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Still needing classification: ${remainingAfterRun}`);
    console.log("==================================================");

    if (stats.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (connected) {
      await mongoose.disconnect();
    }
  }
}

main().catch((error) => {
  console.error(`Question classifier stopped: ${error.message}`);
  process.exitCode = 1;
});
