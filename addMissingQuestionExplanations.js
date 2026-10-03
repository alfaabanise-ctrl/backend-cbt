import axios from "axios";
import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";

import Question from "./model/Question.js";

dotenv.config();

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const MONGO_URI = process.env.DATA_BASE;
const API_KEY = process.env.ALOC_API_KEY;
const API_BASE_URL = "https://dev.aloc.com.ng/api/v1";
const REQUEST_DELAY = 2500;
const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 5;
const MAX_EXPLANATIONS = 8656;

if (!MONGO_URI) {
  throw new Error("DATA_BASE is missing from .env");
}

if (!API_KEY) {
  throw new Error("ALOC_API_KEY is missing from .env");
}

const aloc = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "X-API-Key": API_KEY,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: REQUEST_TIMEOUT,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hasExplanation(question) {
  const explanation = question?.explanation;

  if (typeof explanation === "string") {
    return explanation.trim().length > 0;
  }

  return Boolean(
    explanation &&
      (String(explanation.explanation || "").trim() ||
        String(explanation.simplifiedExplanation || "").trim()),
  );
}

function toHtml(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return value
    .trim()
    .split(/\r\n?|\n/)
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function normalizeExplanation(explanation, questionId) {
  const mistakes = Array.isArray(explanation.commonMistakes)
    ? explanation.commonMistakes.map((item) => ({
        mistake: toHtml(item?.mistake),
        whyWrong: toHtml(item?.whyWrong),
      }))
    : [];

  return {
    questionId: String(explanation.questionId || questionId),
    explanation: toHtml(explanation.explanation),
    simplifiedExplanation: toHtml(explanation.simplifiedExplanation),
    commonMistakes: mistakes,
    solutionImageUrl: explanation.solutionImageUrl || null,
    sourceType: explanation.sourceType || "ALOC",
    confidence: explanation.confidence ?? null,
    needsReview: explanation.needsReview ?? false,
  };
}

function hasExplanationContent(explanation) {
  return Boolean(
    explanation &&
      (toHtml(explanation.explanation) ||
        toHtml(explanation.simplifiedExplanation)),
  );
}

async function requestExplanation(questionId) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await aloc.post(
        `/questions/${encodeURIComponent(questionId)}/explain`,
      );
      return response.data?.data;
    } catch (error) {
      const status = error.response?.status;
      const apiCode = error.response?.data?.code;
      const apiError = error.response?.data?.error;
      const canRetry =
        status === 429 ||
        (status >= 500 && status <= 599) ||
        !error.response;

      if (
        status === 403 &&
        (apiCode === "ERR_TIER_UPGRADE_REQUIRED" ||
          apiError === "tier_upgrade_required")
      ) {
        const accessError = new Error(
          "ALOC explanation access is exhausted; stopping before more requests.",
        );
        accessError.name = "ExplanationAccessError";
        throw accessError;
      }

      if (status === 401 || status === 403) {
        const authorizationError = new Error(
          `ALOC rejected the request (HTTP ${status}).`,
        );
        authorizationError.name = "ApiAuthorizationError";
        throw authorizationError;
      }

      if (!canRetry || attempt === MAX_RETRIES) {
        const requestError = new Error(
          `ALOC explanation request failed${status ? ` (HTTP ${status})` : ""}: ${error.message}`,
        );
        if (!error.response || (status >= 500 && status <= 599)) {
          requestError.name = "TransientServiceError";
        }
        throw requestError;
      }

      const retryAfter = Number(error.response?.headers?.["retry-after"]);
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(30000, attempt * 5000);
      console.warn(
        `Temporary ALOC request failure; retry ${attempt}/${MAX_RETRIES} in ${waitMs}ms.`,
      );
      await sleep(waitMs);
    }
  }
}

async function main() {
  const stats = {
    total: 0,
    alreadyExplained: 0,
    explained: 0,
    unavailable: 0,
    failed: 0,
  };

  try {
    await mongoose.connect(MONGO_URI);

    const questions = await Question.find({
      source: "ALOC",
      sourceId: { $exists: true, $ne: "" },
    })
      .select("_id sourceId explanation")
      .lean();

    const missing = questions.filter((question) => !hasExplanation(question));
    if (missing.length > MAX_EXPLANATIONS) {
      throw new Error(
        `Found ${missing.length} missing explanations, exceeding the approved limit of ${MAX_EXPLANATIONS}. No API requests were made.`,
      );
    }

    stats.total = questions.length;
    stats.alreadyExplained = questions.length - missing.length;

    console.log(
      `Found ${stats.total} ALOC questions; ${missing.length} need explanations.`,
    );

    for (let index = 0; index < missing.length; index++) {
      const question = missing[index];

      try {
        const response = await requestExplanation(question.sourceId);
        if (!hasExplanationContent(response)) {
          stats.unavailable++;
          console.error(
            `No explanation returned for question ${question.sourceId}.`,
          );
        } else {
          const explanation = normalizeExplanation(
            response,
            question.sourceId,
          );
          const result = await Question.updateOne(
            {
              _id: question._id,
              source: "ALOC",
              sourceId: question.sourceId,
              $or: [
                { explanation: null },
                { explanation: { $exists: false } },
                {
                  "explanation.explanation": { $in: [null, ""] },
                  "explanation.simplifiedExplanation": { $in: [null, ""] },
                },
              ],
            },
            { $set: { explanation } },
            { runValidators: true },
          );

          if (result.modifiedCount === 1) {
            stats.explained++;
          } else {
            stats.alreadyExplained++;
            console.log(
              `Skipped ${question.sourceId}; its explanation changed during processing.`,
            );
          }
        }
      } catch (error) {
        if (error.name === "ExplanationAccessError") {
          stats.unavailable += missing.length - index;
          console.error(error.message);
          break;
        }

        if (error.name === "TransientServiceError") {
          stats.unavailable += missing.length - index;
          console.error(
            `${error.message} Stopping the batch to avoid repeating a service/network failure.`,
          );
          break;
        }

        if (error.name === "ApiAuthorizationError") {
          stats.failed++;
          console.error(error.message);
          throw error;
        }

        stats.failed++;
        console.error(
          `Failed question ${question.sourceId}: ${error.message}`,
        );
      }

      if (index < missing.length - 1) {
        await sleep(REQUEST_DELAY);
      }

      if ((index + 1) % 25 === 0 || index === missing.length - 1) {
        console.log(
          `Progress ${index + 1}/${missing.length}: added ${stats.explained}, unavailable ${stats.unavailable}, failed ${stats.failed}.`,
        );
      }
    }

    console.log("Explanation update summary:", JSON.stringify(stats));

    if (stats.failed > 0 || stats.unavailable > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

main().catch((error) => {
  console.error("Question explanation update failed:", error.message);
  process.exitCode = 1;
});
