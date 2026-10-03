import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAuthToken, init } from "@heyputer/puter.js/src/init.cjs";

import Question from "../model/Question.js";
import {
  createExplanationPrompt,
  ExplanationServiceError,
  validateExplanationResult,
} from "../services/ai/explanationService.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIRECTORY, "../.env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const DEFAULT_TEST_LIMIT = 5;
const MAX_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const DEFAULT_MODEL = "gpt-5-nano";

const missingExplanationFilter = {
  $and: [
    {
      $expr: {
        $or: [
          {
            $in: [{ $type: "$explanation" }, ["missing", "null", "object"]],
          },
          {
            $and: [
              { $eq: [{ $type: "$explanation" }, "string"] },
              { $eq: [{ $trim: { input: "$explanation" } }, ""] },
            ],
          },
        ],
      },
    },
    {
      $or: [
        { "explanation.explanation": { $exists: false } },
        { "explanation.explanation": null },
        { "explanation.explanation": "" },
        { "explanation.explanation": /^\s*$/ },
      ],
    },
    {
      $or: [
        { "explanation.simplifiedExplanation": { $exists: false } },
        { "explanation.simplifiedExplanation": null },
        { "explanation.simplifiedExplanation": "" },
        { "explanation.simplifiedExplanation": /^\s*$/ },
      ],
    },
  ],
};

function getLimit() {
  if (process.argv.includes("--all")) {
    return 0;
  }

  const limitArgument = process.argv.find((argument) =>
    argument.startsWith("--limit="),
  );
  const value = limitArgument?.slice("--limit=".length) ??
    process.env.PUTER_TEST_LIMIT ??
    String(DEFAULT_TEST_LIMIT);

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("--limit must be a positive safe integer.");
  }
  if (Number(value) === 0) {
    throw new Error("Use --all to process all remaining questions.");
  }

  return Number(value);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryable(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }

  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ENOTFOUND",
  ].includes(error?.code);
}

function isFatalBatchError(error) {
  const status = error?.status ?? error?.response?.status;
  return status === 401 || status === 402 || status === 403 || status === 429;
}

function getResponseText(response) {
  const content = response?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }

  throw new ExplanationServiceError(
    "Puter returned a response without readable message text.",
  );
}

async function generateWithRetry(puter, question) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await puter.ai.chat(
        createExplanationPrompt(question),
        {
          model: process.env.PUTER_MODEL || DEFAULT_MODEL,
          normalize: true,
        },
      );

      let result;
      try {
        result = JSON.parse(getResponseText(response));
      } catch (error) {
        if (error instanceof ExplanationServiceError) {
          throw error;
        }
        throw new ExplanationServiceError(
          "Puter returned malformed explanation JSON.",
          { cause: error },
        );
      }

      return validateExplanationResult(result);
    } catch (error) {
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      const waitMs = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Temporary Puter failure; retry ${attempt}/${MAX_ATTEMPTS - 1} in ${waitMs}ms.`,
      );
      await delay(waitMs);
    }
  }

  throw new Error("Puter generation ended without a result.");
}

async function saveExplanation(question, result) {
  const update = await Question.updateOne(
    {
      _id: question._id,
      sourceId: question.sourceId,
      ...missingExplanationFilter,
    },
    {
      $set: {
        "explanation.questionId": question.sourceId,
        "explanation.explanation": result.explanation,
        "explanation.simplifiedExplanation": result.simplifiedExplanation,
        "explanation.commonMistakes": result.commonMistakes,
        "explanation.sourceType": "puter-ai",
        "explanation.confidence": result.confidence,
        "explanation.needsReview": result.needsReview,
      },
    },
    { runValidators: true },
  );

  return update.modifiedCount === 1;
}

async function processQuestion(puter, question, number) {
  console.log(
    `\n[${number}] Processing ${question.subject} ${question.examType} ${question.year}, sourceId: ${question.sourceId}`,
  );

  const aiQuestion = {
    question: question.question || question.questionText || question.text || "",
    options: question.options ?? null,
    correctAnswer: question.correctAnswer || question.answer || null,
    subject: question.subject ?? null,
    examType: question.examType ?? null,
    year: question.year ?? null,
    topic: question.topic ?? null,
    questionNumber: question.questionNumber ?? question.number ?? null,
  };

  try {
    const result = await generateWithRetry(puter, aiQuestion);
    const saved = await saveExplanation(question, result);
    if (!saved) {
      console.log(
        `[SKIPPED] Explanation already exists or question changed: ${question.sourceId}`,
      );
      return "skipped";
    }

    console.log(`[SAVED] Explanation saved: ${question.sourceId}`);
    return "successful";
  } catch (error) {
    console.error(`[FAILED] ${question.sourceId}: ${error.message}`);
    return isFatalBatchError(error) ? "fatal" : "failed";
  }
}

async function main() {
  const mongoUri = process.env.DATA_BASE;
  if (!mongoUri) {
    throw new Error("DATA_BASE is missing from .env");
  }

  let authToken = process.env.PUTER_AUTH_TOKEN;
  if (!authToken) {
    console.log("Opening Puter sign-in in your browser...");
    authToken = await getAuthToken();
  }
  if (typeof authToken !== "string" || !authToken.trim()) {
    throw new Error("Puter sign-in did not return an auth token.");
  }

  const limit = getLimit();
  const puter = init(authToken);
  let connected = false;
  const stats = { processed: 0, successful: 0, skipped: 0, failed: 0 };

  try {
    await mongoose.connect(mongoUri);
    connected = true;

    const remaining = await Question.countDocuments(missingExplanationFilter);
    const planned = limit === 0 ? remaining : Math.min(remaining, limit);

    console.log("==================================================");
    console.log("PUTER QUESTION EXPLANATION GENERATOR");
    console.log(`Remaining questions: ${remaining}`);
    console.log(`This run will process up to: ${planned}`);
    console.log(`Model: ${process.env.PUTER_MODEL || DEFAULT_MODEL}`);
    console.log("Questions are sent one at a time and saved individually.");
    console.log("==================================================");

    const cursor = Question.find(missingExplanationFilter)
      .sort({ _id: 1 })
      .select(
        "_id sourceId explanation question questionText text options answer correctAnswer subject examType year topic questionNumber number",
      )
      .limit(limit)
      .cursor();

    for await (const question of cursor) {
      stats.processed++;
      const outcome = await processQuestion(puter, question, stats.processed);
      if (outcome === "successful") {
        stats.successful++;
      } else if (outcome === "skipped") {
        stats.skipped++;
      } else if (outcome === "fatal") {
        stats.failed++;
        console.error(
          "Stopping the batch because Puter rejected the request or its usage limit was reached.",
        );
        break;
      } else {
        stats.failed++;
      }
    }

    const remainingAfterRun = await Question.countDocuments(
      missingExplanationFilter,
    );

    console.log("\n==================================================");
    console.log("COMPLETE");
    console.log(`Processed: ${stats.processed} (limit: ${planned})`);
    console.log(`Saved: ${stats.successful}`);
    console.log(`Skipped: ${stats.skipped}`);
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
  console.error(`Puter explanation worker stopped: ${error.message}`);
  process.exitCode = 1;
});
