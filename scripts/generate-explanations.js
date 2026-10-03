import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Question from "../model/Question.js";
import {
  ExplanationServiceError,
  generateExplanation,
} from "../services/ai/explanationService.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIRECTORY, "../.env") });

const DEFAULT_TEST_LIMIT = 5;
const MAX_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

const missingExplanationFilter = {
  "explanation.explanation": { $in: [null, ""] },
  $or: [
    { explanation: { $exists: false } },
    { explanation: null },
    { explanation: { $type: "object" } },
  ],
};

export function parseTestLimit(value = process.env.TEST_LIMIT) {
  if (value === undefined || value === "") {
    return DEFAULT_TEST_LIMIT;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("TEST_LIMIT must be a non-negative integer.");
  }

  const limit = Number(value);
  if (!Number.isSafeInteger(limit)) {
    throw new Error("TEST_LIMIT must be a non-negative safe integer.");
  }

  return limit;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasExplanation(question) {
  return (
    typeof question?.explanation?.explanation === "string" &&
    question.explanation.explanation.trim().length > 0
  );
}

async function generateWithRetry(question) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await generateExplanation(question);
    } catch (error) {
      if (
        !(error instanceof ExplanationServiceError) ||
        !error.retryable ||
        attempt === MAX_ATTEMPTS
      ) {
        throw error;
      }

      const waitMs = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Temporary AI failure; retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs}ms.`,
      );
      await delay(waitMs);
    }
  }

  throw new Error("AI generation ended without a result.");
}

function toAIQuestion(question) {
  return {
    question: question.question || question.questionText || question.text || "",
    options: question.options ?? null,
    correctAnswer: question.correctAnswer || question.answer || null,
    subject: question.subject ?? null,
    examType: question.examType ?? null,
    year: question.year ?? null,
    topic: question.topic ?? null,
    questionNumber: question.questionNumber ?? question.number ?? null,
  };
}

function isProviderUnavailable(error) {
  const status = error?.cause?.status ?? error?.cause?.response?.status;
  return status === 429 || status === 503;
}

async function saveExplanation(question, result) {
  question.explanation = {
    questionId: question.sourceId,
    explanation: result.explanation,
    simplifiedExplanation: result.simplifiedExplanation,
    commonMistakes: result.commonMistakes || [],
    solutionImageUrl: null,
    sourceType: "ai-generated",
    confidence: result.confidence,
    needsReview: result.needsReview,
  };

  question.$where = {
    "explanation.explanation": { $in: [null, ""] },
    $or: [
      { explanation: { $exists: false } },
      { explanation: null },
      { explanation: { $type: "object" } },
    ],
  };

  await question.save();
}

async function processQuestion(question, number) {
  console.log(`\n[${number}] Processing sourceId: ${question.sourceId}`);

  try {
    const result = await generateWithRetry(toAIQuestion(question));
    await saveExplanation(question, result);
    console.log("[SAVED] Explanation successfully saved");
    return "successful";
  } catch (error) {
    if (error?.name === "DocumentNotFoundError") {
      const current = await Question.findById(question._id)
        .select("explanation.explanation")
        .lean();
      if (hasExplanation(current)) {
        console.log(
          `[SKIPPED] Explanation was added by another process: ${question.sourceId}`,
        );
        return "skipped";
      }
    }

    console.error(
      `[FAILED] sourceId ${question.sourceId}: ${error.message}`,
    );
    return isProviderUnavailable(error) ? "provider-unavailable" : "failed";
  }
}

async function main() {
  const mongoUri = process.env.DATA_BASE;
  if (!mongoUri) {
    throw new Error("DATA_BASE is missing from .env");
  }

  const testLimit = parseTestLimit();
  let connected = false;

  const stats = {
    processed: 0,
    successful: 0,
    failed: 0,
  };

  try {
    await mongoose.connect(mongoUri);
    connected = true;

    const remaining = await Question.countDocuments(missingExplanationFilter);
    const planned = testLimit === 0 ? remaining : Math.min(remaining, testLimit);

    console.log("==================================================");
    console.log("AI EXPLANATION GENERATOR");
    console.log(`Remaining questions: ${remaining}`);
    console.log("Processed: 0");
    console.log("Successful: 0");
    console.log("Failed: 0");
    console.log("==================================================");

    const cursor = Question.find(missingExplanationFilter)
      .sort({ _id: 1 })
      .select(
        "_id sourceId explanation question questionText text options answer correctAnswer subject examType year topic questionNumber number",
      )
      .limit(testLimit)
      .cursor();

    for await (const question of cursor) {
      stats.processed++;
      const outcome = await processQuestion(question, stats.processed);
      if (outcome === "successful") {
        stats.successful++;
      } else if (outcome === "provider-unavailable") {
        stats.failed++;
        console.error(
          "Stopping the batch because Gemini is rate limiting requests or temporarily unavailable.",
        );
        break;
      } else if (outcome === "failed") {
        stats.failed++;
      }
    }

    const remainingAfterRun = await Question.countDocuments(
      missingExplanationFilter,
    );

    console.log("\n==================================================");
    console.log("COMPLETE");
    console.log(`Processed: ${stats.processed} (limit: ${planned})`);
    console.log(`Successful: ${stats.successful}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Remaining: ${remainingAfterRun}`);
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
  console.error(`Explanation worker stopped: ${error.message}`);
  process.exitCode = 1;
});
