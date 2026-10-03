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

// =====================================================
// API LIMIT
// =====================================================
//
// ALOC API maximum:
//
// limit <= 15
//
// DO NOT change this to 16, 20, 50, etc.
//
// =====================================================

const LIMIT = 15;

// =====================================================
// DELAY
// =====================================================

// Delay between API requests.
const REQUEST_DELAY = 500;

// =====================================================
// RETRIES
// =====================================================

const MAX_RETRIES = 5;

// =====================================================
// TIMEOUT
// =====================================================

const REQUEST_TIMEOUT = 30000;

// =====================================================
// VALIDATE ENV
// =====================================================

if (!MONGO_URI) {
  console.error(
    "❌ DATA_BASE is missing from .env"
  );

  process.exit(1);
}

if (!API_KEY) {
  console.error(
    "❌ ALOC_API_KEY is missing from .env"
  );

  process.exit(1);
}

// =====================================================
// SUBJECTS
// =====================================================
//
// IMPORTANT:
//
// Use the exact subject names expected by the API.
//
// =====================================================

const SUBJECTS = [
  // "physics",
  // "computer-studies",
  // "marketing",
  // "history",
  // "insurance",
  // "civic-education",
  // "commerce",
  // "economics",
  // "english",
  // "geography",
  // "government",
  // "history",
  // "insurance",
   "literature-in-english",
  // "physics",
  // "marketing",
  // "computer-studies"
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

const aloc = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "X-API-Key": API_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
  },

  timeout: REQUEST_TIMEOUT
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
// NORMALIZE SUBJECT
// =====================================================

function normalizeSubject(subject) {
  return String(subject || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

// =====================================================
// CONNECT MONGODB
// =====================================================

async function connectDB() {

  console.log(
    "\n🔌 Connecting to MongoDB..."
  );

  await mongoose.connect(
    MONGO_URI
  );

  console.log(
    "✅ MongoDB connected"
  );
}

// =====================================================
// PRINT API ERROR
// =====================================================

function printApiError(error) {

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

    const remaining =
      error.response.headers?.[
        "x-ratelimit-remaining"
      ];

    if (
      remaining !== undefined
    ) {

      console.error(
        "Rate limit remaining:",
        remaining
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
// GET AVAILABLE YEARS
// =====================================================
//
// We first ask ALOC which years are available for
// the subject.
//
// This prevents blindly requesting every possible year.
//
// =====================================================

async function getAvailableYears(
  subject
) {

  try {

    console.log(
      `\n🔎 Getting available years for ${subject}`
    );

    const response =
      await requestWithRetry(
        "GET",
        `/subjects/${encodeURIComponent(
          subject
        )}/years`
      );

    const data =
      response.data?.data || [];

    const years =
      data
        .map(item => {

          if (
            typeof item === "number"
          ) {
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
    ].sort(
      (a, b) => a - b
    );

    console.log(
      `📅 ${subject}:`,
      uniqueYears
    );

    return uniqueYears;

  } catch (error) {

    console.error(
      `❌ Failed to get years for ${subject}`
    );

    printApiError(
      error
    );

    return [];
  }
}

// =====================================================
// FETCH QUESTIONS
// =====================================================
//
// Questions are downloaded page by page.
//
// Each request:
//
// limit = 15
//
// Then cursor is used for the next page.
//
// =====================================================

async function fetchQuestions({
  subject,
  examType,
  year
}) {

  let cursor = null;

  const allQuestions = [];

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

        // IMPORTANT:
        // ALOC maximum is 15.
        limit: LIMIT
      };

      // -------------------------------------------------
      // CURSOR
      // -------------------------------------------------
      //
      // First request has no cursor.
      //
      // Second request gets nextCursor.
      //
      // -------------------------------------------------

      if (cursor) {

        params.cursor =
          cursor;
      }

      const response =
        await requestWithRetry(
          "GET",
          "/questions",
          {
            params
          }
        );

      const data =
        response.data?.data || [];

      const pagination =
        response.data?.pagination || {};

      console.log(
        `   📦 Received: ${data.length} questions`
      );

      allQuestions.push(
        ...data
      );

      // -------------------------------------------------
      // CHECK PAGINATION
      // -------------------------------------------------

      console.log(
        `   🔄 Has more: ${
          pagination.hasMore
        }`
      );

      if (
        pagination.nextCursor
      ) {

        console.log(
          `   ➡️ Next cursor available`
        );
      }

      // -------------------------------------------------
      // NO MORE QUESTIONS
      // -------------------------------------------------

      if (
        !pagination.hasMore ||
        !pagination.nextCursor
      ) {

        console.log(
          `   ✅ Finished ${subject} | ${examType} | ${year}`
        );

        break;
      }

      // -------------------------------------------------
      // NEXT PAGE
      // -------------------------------------------------

      cursor =
        pagination.nextCursor;

      page++;

      await sleep(
        REQUEST_DELAY
      );

    } catch (error) {

      // -------------------------------------------------
      // 404
      // -------------------------------------------------

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

      // -------------------------------------------------
      // 400
      // -------------------------------------------------

      if (
        error.response?.status === 400
      ) {

        console.error(
          `❌ API rejected request`
        );

        console.error(
          `${subject} | ${examType} | ${year}`
        );

        printApiError(
          error
        );

        break;
      }

      // -------------------------------------------------
      // OTHER
      // -------------------------------------------------

      console.error(
        `❌ Failed to fetch`
      );

      console.error(
        `${subject} | ${examType} | ${year}`
      );

      printApiError(
        error
      );

      break;
    }
  }

  console.log(
    `\n📊 Total fetched for ${subject} | ${examType} | ${year}: ${allQuestions.length}`
  );

  return allQuestions;
}

// =====================================================
// REQUEST WITH RETRY
// =====================================================

async function requestWithRetry(
  method,
  url,
  config = {},
  attempt = 1
) {

  try {

    return await aloc.request({
      method,
      url,
      ...config
    });

  } catch (error) {

    const status =
      error.response?.status;

    // =================================================
    // 429 RATE LIMIT
    // =================================================

    if (
      status === 429
    ) {

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
        method,
        url,
        config,
        attempt + 1
      );
    }

    // =================================================
    // SERVER ERRORS
    // =================================================

    if (
      (
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) &&
      attempt <= MAX_RETRIES
    ) {

      const waitTime =
        attempt * 3000;

      console.log(
        `⚠️ Server error ${status}.`
      );

      console.log(
        `⏳ Retrying in ${waitTime}ms...`
      );

      await sleep(
        waitTime
      );

      return requestWithRetry(
        method,
        url,
        config,
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

    // -------------------------------------------------
    // SOURCE ID
    // -------------------------------------------------

    sourceId:
      String(
        item.id
      ),

    // -------------------------------------------------
    // SUBJECT
    // -------------------------------------------------

    subject:
      normalizeSubject(
        item.subject || ""
      ),

    // -------------------------------------------------
    // EXAM TYPE
    // -------------------------------------------------

    examType:
      String(
        item.examType || ""
      ).toLowerCase(),

    // -------------------------------------------------
    // YEAR
    // -------------------------------------------------

    year:
      Number(
        item.year
      ),

    // -------------------------------------------------
    // QUESTION
    // -------------------------------------------------

    question:
      item.text ||
      item.question ||
      "",

    // -------------------------------------------------
    // OPTIONS
    // -------------------------------------------------

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

    // -------------------------------------------------
    // ANSWER
    // -------------------------------------------------

    answer:
      item.correctAnswer
        ? String(
            item.correctAnswer
          ).toLowerCase()
        : null,

    // -------------------------------------------------
    // COUNTRY
    // -------------------------------------------------

    country:
      item.country ||
      "NG",

    // -------------------------------------------------
    // METADATA
    // -------------------------------------------------

    metadata:
      item.metadata ||
      null,

    // -------------------------------------------------
    // RAW DATA
    // -------------------------------------------------

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
    !Array.isArray(
      questions
    ) ||
    questions.length === 0
  ) {

    return {
      inserted: 0,
      modified: 0,
      upserted: 0
    };
  }

  // ---------------------------------------------------
  // BUILD BULK OPERATIONS
  // ---------------------------------------------------

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

  // ---------------------------------------------------
  // BULK WRITE
  // ---------------------------------------------------

  let result;

  try {

    result =
      await Question.bulkWrite(
        operations,
        {
          ordered: false
        }
      );

  } catch (error) {

    console.error(
      "\n❌ MongoDB bulkWrite error"
    );

    console.error(
      error
    );

    if (
      error.writeErrors
    ) {

      console.log(
        error.writeErrors
      );
    }

    throw error;
  }

  return {

    inserted:
      result.insertedCount ||
      0,

    modified:
      result.modifiedCount ||
      0,

    upserted:
      result.upsertedCount ||
      0
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
    `\n💾 Saved ${subject} | ${examType} | ${year}`
  );

  console.log(
    `   Questions fetched: ${questions.length}`
  );

  console.log(
    `   Inserted: ${result.inserted}`
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
// IMPORT ONE SUBJECT
// =====================================================

async function importSubject(
  subject
) {

  console.log(
    "\n\n========================================"
  );

  console.log(
    `📚 SUBJECT: ${subject}`
  );

  console.log(
    "========================================"
  );

  // ---------------------------------------------------
  // GET YEARS
  // ---------------------------------------------------

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

    return 0;
  }

  let subjectTotal = 0;

  // ---------------------------------------------------
  // EXAM TYPES
  // ---------------------------------------------------

  for (
    const examType of EXAM_TYPES
  ) {

    console.log(
      `\n📚 Exam Type: ${examType}`
    );

    // -------------------------------------------------
    // YEARS
    // -------------------------------------------------

    for (
      const year of years
    ) {

      const count =
        await importCombination(
          subject,
          examType,
          year
        );

      subjectTotal +=
        count;

      await sleep(
        REQUEST_DELAY
      );
    }
  }

  console.log(
    "\n========================================"
  );

  console.log(
    `✅ FINISHED SUBJECT: ${subject}`
  );

  console.log(
    `📦 Total questions processed: ${subjectTotal}`
  );

  console.log(
    "========================================"
  );

  return subjectTotal;
}

// =====================================================
// IMPORT EVERYTHING
// =====================================================

async function importAll() {

  let totalFetched = 0;

  try {

    await connectDB();

    console.log(
      "\n🚀 Starting ALOC import..."
    );

    console.log(
      `📦 API limit per request: ${LIMIT}`
    );

    console.log(
      `⏱️ Request delay: ${REQUEST_DELAY}ms`
    );

    console.log(
      `🔁 Max retries: ${MAX_RETRIES}`
    );

    // =================================================
    // PROCESS SUBJECTS
    // =================================================

    for (
      const subject of SUBJECTS
    ) {

      try {

        const subjectTotal =
          await importSubject(
            subject
          );

        totalFetched +=
          subjectTotal;

      } catch (error) {

        console.error(
          `\n❌ Subject failed: ${subject}`
        );

        printApiError(
          error
        );

        console.error(
          "⏭️ Moving to next subject..."
        );
      }
    }

    // =================================================
    // FINAL
    // =================================================

    console.log(
      "\n\n========================================"
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

    console.log(
      "========================================"
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
        "\n🔌 MongoDB disconnected"
      );
    }
  }
}

// =====================================================
// RUN
// =====================================================

importAll();