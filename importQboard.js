import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";

import Question from "./model/Question.js";

// =====================================================
// LOAD ENV
// =====================================================

dotenv.config();

// =====================================================
// DNS
// =====================================================
// Keep this only if you still have the DNS issue.
// You can remove it if your normal DNS works.

dns.setServers([
  "8.8.8.8",
  "8.8.4.4"
]);

// =====================================================
// CONFIG
// =====================================================

const MONGO_URI = process.env.DATA_BASE;

const API_KEY = process.env.ALOC_API_KEY;

const API_BASE_URL =
  "https://dev.aloc.com.ng/api/v1";

// Number of questions per API request
const LIMIT = 50;

// Delay between requests
const REQUEST_DELAY = 500;

// Retry count for temporary errors
const MAX_RETRIES = 5;

// =====================================================
// VALIDATE ENV
// =====================================================

if (!MONGO_URI) {
  console.error("❌ DATA_BASE is missing from .env");
  process.exit(1);
}

if (!API_KEY) {
  console.error("❌ QBOARD_API_KEY is missing from .env");
  process.exit(1);
}

// =====================================================
// SUBJECTS
// =====================================================
// These are the exact names returned by the new ALOC API.

const SUBJECTS = [
  "accounting",
  "biology",
  "chemistry",
  "christian-religious-studies",
  "civic-education",
  "commerce",
  "economics",
  "english",
  "geography",
  "government",
  "history",
  "insurance",
  "literature-in-english",
  "mathematics",
  "physics",
  "maketing",
  "Computer study",
  "History"
];

// =====================================================
// EXAM TYPES
// =====================================================

const EXAM_TYPES = [
  "waec",
  "neco",
  "jamb",
  "post_utme",
  "state"
];

// =====================================================
// AXIOS CLIENT
// =====================================================

const qboard = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "X-API-Key": API_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
  },

  timeout: 30000
});

// =====================================================
// SLEEP
// =====================================================

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// =====================================================
// CONNECT MONGODB
// =====================================================

async function connectDB() {

  console.log("\n🔌 Connecting to MongoDB...");

  await mongoose.connect(MONGO_URI);

  console.log("✅ MongoDB connected");
}

// =====================================================
// GET AVAILABLE YEARS
// =====================================================

async function getAvailableYears(subject) {

  try {

    console.log(
      `\n🔎 Getting available years for ${subject}`
    );

    const response = await qboard.get(
      `/subjects/${encodeURIComponent(subject)}/years`
    );

    const data = response.data?.data || [];

    const years = data
      .map(item => {

        if (typeof item === "number") {
          return item;
        }

        return Number(
          item.year ??
          item.examYear ??
          item.examyear
        );
      })
      .filter(year =>
        Number.isInteger(year)
      );

    const uniqueYears = [
      ...new Set(years)
    ].sort((a, b) => a - b);

    console.log(
      `📅 ${subject}:`,
      uniqueYears
    );

    return uniqueYears;

  } catch (error) {

    console.error(
      `❌ Failed to get years for ${subject}`
    );

    printApiError(error);

    return [];
  }
}

// =====================================================
// FETCH QUESTIONS
// =====================================================

async function fetchQuestions({
  subject,
  examType,
  year
}) {

  let cursor = null;

  let allQuestions = [];

  let page = 1;

  while (true) {

    console.log(
      `\n📥 Fetching ${subject} | ${examType} | ${year} | page ${page}`
    );

    try {

      const params = {

        subject,

        examType,

        year,

        limit: LIMIT
      };

      // Cursor is only sent after first page
      if (cursor) {
        params.cursor = cursor;
      }

      const response =
        await requestWithRetry(
          "/questions",
          params
        );

      const data =
        response.data?.data || [];

      const pagination =
        response.data?.pagination || {};

      console.log(
        `   Received: ${data.length} questions`
      );

      allQuestions.push(
        ...data
      );

      // Stop if API says there are no more questions
      if (
        !pagination.hasMore ||
        !pagination.nextCursor
      ) {

        break;
      }

      cursor =
        pagination.nextCursor;

      page++;

      await sleep(
        REQUEST_DELAY
      );

    } catch (error) {

      // 404 means this combination
      // has no questions.
      if (
        error.response?.status === 404
      ) {

        console.log(
          `⚠️ No questions found for`
        );

        console.log(
          `   ${subject} | ${examType} | ${year}`
        );

        return [];
      }

      console.error(
        `❌ Failed to fetch`
      );

      console.error(
        `${subject} | ${examType} | ${year}`
      );

      printApiError(error);

      break;
    }
  }

  return allQuestions;
}

// =====================================================
// REQUEST WITH RETRY
// =====================================================

async function requestWithRetry(
  url,
  params,
  attempt = 1
) {

  try {

    return await qboard.get(
      url,
      {
        params
      }
    );

  } catch (error) {

    const status =
      error.response?.status;

    // =================================================
    // RATE LIMIT
    // =================================================

    if (status === 429) {

      if (
        attempt > MAX_RETRIES
      ) {

        throw error;
      }

      const retryAfter =
        Number(
          error.response?.headers?.[
            "retry-after"
          ]
        );

      const waitTime =
        Number.isFinite(
          retryAfter
        )
          ? retryAfter * 1000
          : attempt * 5000;

      console.log(
        `⏳ Rate limited. Waiting ${waitTime}ms...`
      );

      await sleep(
        waitTime
      );

      return requestWithRetry(
        url,
        params,
        attempt + 1
      );
    }

    // =================================================
    // SERVER ERRORS
    // =================================================

    if (
      status >= 500 &&
      attempt <= MAX_RETRIES
    ) {

      const waitTime =
        attempt * 3000;

      console.log(
        `⚠️ Server error ${status}.`
      );

      console.log(
        `Retrying in ${waitTime}ms...`
      );

      await sleep(
        waitTime
      );

      return requestWithRetry(
        url,
        params,
        attempt + 1
      );
    }

    throw error;
  }
}

// =====================================================
// NORMALIZE QUESTION
// =====================================================

function normalizeQuestion(
  item
) {

  return {

    source: "ALOC",

    // New API ID may be UUID
    sourceId:
      String(
        item.id
      ),

    subject:
      String(
        item.subject || ""
      ).toLowerCase(),

    examType:
      String(
        item.examType || ""
      ).toLowerCase(),

    year:
      Number(
        item.year
      ),

    question:
      item.text ||
      item.question ||
      "",

    options: {

      a:
        item.options?.a ??
        null,

      b:
        item.options?.b ??
        null,

      c:
        item.options?.c ??
        null,

      d:
        item.options?.d ??
        null,

      e:
        item.options?.e ??
        null
    },

    answer:
      item.correctAnswer
        ? String(
            item.correctAnswer
          ).toLowerCase()
        : null,

    country:
      item.country ||
      "NG",

    // New API may provide metadata
    metadata:
      item.metadata ||
      null,

    // Keep original API response
    rawData:
      item
  };
}

// =====================================================
// SAVE QUESTIONS
// =====================================================

async function saveQuestions(
  questions
) {

  if (
    !Array.isArray(questions) ||
    questions.length === 0
  ) {

    return {
      inserted: 0,
      modified: 0,
      upserted: 0
    };
  }

  const operations =
    questions
      .filter(item =>
        item?.id &&
        (
          item.text ||
          item.question
        )
      )
      .map(item => {

        const question =
          normalizeQuestion(
            item
          );

        return {

          updateOne: {

            filter: {

              source:
                question.source,

              sourceId:
                question.sourceId
            },

            update: {

              $set:
                question
            },

            upsert:
              true
          }
        };
      });

  if (
    operations.length === 0
  ) {

    return {
      inserted: 0,
      modified: 0,
      upserted: 0
    };
  }

let result;

try {
    result = await Question.bulkWrite(operations, {
        ordered: false
    });

    console.log("Bulk Write Result");
    console.log(result);

} catch (err) {

    console.error(err);

    if (err.writeErrors) {
        console.log(err.writeErrors);
    }

    throw err;
}

  return {

    inserted:
      result.insertedCount || 0,

    modified:
      result.modifiedCount || 0,

    upserted:
      result.upsertedCount || 0
  };
}

// =====================================================
// IMPORT ONE COMBINATION
// =====================================================

async function importCombination(
  subject,
  examType,
  year
) {

  const questions =
    await fetchQuestions({
      subject,
      examType,
      year
    });

  if (
    questions.length === 0
  ) {

    return 0;
  }

  const result =
    await saveQuestions(
      questions
    );

  console.log(
    `💾 Saved ${subject} | ${examType} | ${year}`
  );

  console.log(
    `   Questions fetched: ${questions.length}`
  );

  console.log(
    `   Modified: ${result.modified}`
  );

  console.log(
    `   Upserted: ${result.upserted}`
  );

  return questions.length;
}

// =====================================================
// IMPORT SUBJECT
// =====================================================

async function importSubject(
  subject
) {

  console.log(
    "\n========================================"
  );

  console.log(
    `SUBJECT: ${subject}`
  );

  console.log(
    "========================================"
  );

  // First get only years that actually exist
  const years =
    await getAvailableYears(
      subject
    );

  if (
    years.length === 0
  ) {

    console.log(
      `⚠️ No available years for ${subject}`
    );

    return;
  }

  for (
    const examType of EXAM_TYPES
  ) {

    console.log(
      `\n📚 Exam Type: ${examType}`
    );

    for (
      const year of years
    ) {

      await importCombination(
        subject,
        examType,
        year
      );

      await sleep(
        REQUEST_DELAY
      );
    }
  }
}

// =====================================================
// PRINT API ERROR
// =====================================================

function printApiError(
  error
) {

  if (
    error.response
  ) {

    console.error(
      "Status:",
      error.response.status
    );

    console.error(
      "Response:",
      error.response.data
    );

    if (
      error.response.headers?.[
        "x-ratelimit-remaining"
      ]
    ) {

      console.error(
        "Rate limit remaining:",
        error.response.headers[
          "x-ratelimit-remaining"
        ]
      );
    }

    return;
  }

  console.error(
    "Message:",
    error.message
  );
}

// =====================================================
// IMPORT EVERYTHING
// =====================================================

async function importAll() {

  try {

    await connectDB();

    console.log(
      "\n🚀 Starting ALOC import..."
    );

    let totalFetched = 0;

    for (
      const subject of SUBJECTS
    ) {

      await importSubject(
        subject
      );
    }

    console.log(
      "\n========================================"
    );

    console.log(
      "🎉 IMPORT COMPLETED"
    );

    console.log(
      "========================================"
    );

    console.log(
      `📊 Total questions processed: ${totalFetched}`
    );

  } catch (error) {

    console.error(
      "\n❌ IMPORT ERROR"
    );

    printApiError(
      error
    );

    process.exitCode = 1;

  } finally {

    if (
      mongoose.connection.readyState !== 0
    ) {

      await mongoose.disconnect();

      console.log(
        "🔌 MongoDB disconnected"
      );
    }
  }
}

// =====================================================
// RUN
// =====================================================

importAll();