// ============================================================
// ALOC EXPLANATION UPDATER
// ============================================================
// IMPORTANT:
// - Questions come ONLY from your MongoDB.
// - ALOC is used ONLY to get explanations.
// - Only sourceId is sent to ALOC.
// - Existing questions are updated; they are NOT replaced.
// - MongoDB is filtered to find questions WITHOUT explanations.
// - Explained questions are never sent to ALOC.
// - Subjects are processed one-by-one in SUBJECTS order.
// ============================================================

import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";

import Question from "./model/Question.js";

// ============================================================
// ENVIRONMENT
// ============================================================

dotenv.config();

// Use Google DNS to help with MongoDB / network resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const MONGO_URI = process.env.DATA_BASE;
const API_KEY = process.env.ALOC_API_KEY;

const API_BASE_URL = "https://dev.aloc.com.ng/api/v1";

// ============================================================
// CONFIGURATION
// ============================================================

// Wait between ALOC explanation requests
const QUESTION_DELAY = 3000;

// Wait between subjects
const SUBJECT_DELAY = 3000;

// Number of retry attempts for temporary errors
const MAX_RETRIES = 3;

// ALOC request timeout
const REQUEST_TIMEOUT = 30000;

// MongoDB cursor batch size
const DB_CURSOR_BATCH_SIZE = 100;

// ============================================================
// SUBJECTS TO PROCESS
// ============================================================
// IMPORTANT:
// The order here is the order the program will process them.
// ============================================================

const SUBJECTS = [
  // "chemistry",
  // "biology",
  // "accounting",
  // "christian-religious-studies",
  
  // " not complete commerce",
  // "economics",
  // "geography",
  // "literature-in-english",
  "mathematics",

  // "physics",
  // "government",

  // "computer-studies",
  // "marketing",
  // "history",
  // "insurance",
];

// ============================================================
// AXIOS CLIENT
// ============================================================

const aloc = axios.create({
  baseURL: API_BASE_URL,

  headers: {
    "X-API-Key": API_KEY,
    Accept: "application/json",
    "Content-Type": "application/json",
  },

  timeout: REQUEST_TIMEOUT,
});

// ============================================================
// GLOBAL CONTROL
// ============================================================

let explanationAccessExhausted = false;

// ============================================================
// SLEEP
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// NORMALIZE SUBJECT
// ============================================================

function normalizeSubject(subject) {
  return String(subject || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

// ============================================================
// VALIDATE ENVIRONMENT
// ============================================================

function validateEnvironment() {
  console.log("\n🔐 Checking environment variables...");

  if (!MONGO_URI) {
    throw new Error(
      "DATA_BASE is missing from your .env file."
    );
  }

  if (!API_KEY) {
    throw new Error(
      "ALOC_API_KEY is missing from your .env file."
    );
  }

  console.log("   ✅ DATA_BASE found");
  console.log("   ✅ ALOC_API_KEY found");
}

// ============================================================
// CONNECT DATABASE
// ============================================================

async function connectDB() {
  console.log("\n🔌 Connecting to MongoDB...");

  await mongoose.connect(MONGO_URI);

  console.log("✅ MongoDB connected");

  // ----------------------------------------------------------
  // Inspect explanation schema
  // ----------------------------------------------------------

  console.log("\n🔎 Explanation schema:");

  const explanationPath = Question.schema.path("explanation");

  if (!explanationPath) {
    console.log("   ⚠️ explanation field was not found in schema.");
    return;
  }

  console.log(
    `   Type: ${explanationPath.instance || "Unknown"}`
  );

  console.log(
    `   SchemaType: ${explanationPath.constructor?.name || "Unknown"}`
  );

  if (
    explanationPath.instance === "Embedded" ||
    explanationPath.constructor?.name === "SchemaSubdocument"
  ) {
    console.log(
      "   ✅ Nested explanation object detected."
    );
  } else {
    console.log(
      "   ℹ️ explanation does not appear to be an embedded document."
    );
  }
}

// ============================================================
// GET DATABASE SUBJECTS
// ============================================================
// Gets subjects from YOUR MongoDB.
//
// We do NOT ask ALOC for questions or subjects.
// ============================================================

async function getDatabaseSubjects() {
  console.log("\n📚 Reading subjects from YOUR MongoDB...");

  const subjects = await Question.distinct(
    "subject",
    {
      source: "ALOC",
    }
  );

  const normalizedSubjects = [
    ...new Set(
      subjects
        .map(normalizeSubject)
        .filter(Boolean)
    ),
  ];

  console.log(
    `   📦 MongoDB subjects found: ${normalizedSubjects.length}`
  );

  if (normalizedSubjects.length > 0) {
    normalizedSubjects.forEach((subject, index) => {
      console.log(
        `   ${String(index + 1).padStart(2, "0")}. ${subject}`
      );
    });
  }

  return normalizedSubjects;
}

// ============================================================
// COMPARE CONFIGURED SUBJECTS WITH DATABASE SUBJECTS
// ============================================================
// Keeps the EXACT order from SUBJECTS.
// ============================================================

function getCompatibleSubjects(databaseSubjects) {
  const databaseSet = new Set(
    databaseSubjects.map(normalizeSubject)
  );

  const configuredSubjects = [
    ...new Set(
      SUBJECTS
        .map(normalizeSubject)
        .filter(Boolean)
    ),
  ];

  const compatible = [];
  const missingFromDatabase = [];

  for (const subject of configuredSubjects) {
    if (databaseSet.has(subject)) {
      compatible.push(subject);
    } else {
      missingFromDatabase.push(subject);
    }
  }

  console.log("\n🔍 SUBJECT COMPATIBILITY CHECK");
  console.log("========================================");

  console.log("\n✅ Compatible subjects:");

  if (compatible.length === 0) {
    console.log("   None");
  } else {
    compatible.forEach((subject, index) => {
      console.log(
        `   ${index + 1}. ${subject}`
      );
    });
  }

  console.log("\n❌ Configured subjects missing from MongoDB:");

  if (missingFromDatabase.length === 0) {
    console.log("   None");
  } else {
    missingFromDatabase.forEach((subject) => {
      console.log(`   - ${subject}`);
    });
  }

  return compatible;
}

// ============================================================
// BUILD QUERY FOR QUESTIONS WITHOUT EXPLANATIONS
// ============================================================
//
// IMPORTANT:
//
// DO NOT DO THIS:
//
//   { explanation: "" }
//
// because explanation is an Embedded/Subdocument field.
//
// That causes:
//
//   Cast to Embedded failed for value ""
//
// Instead, we query the nested text fields:
//
//   explanation.explanation
//   explanation.simplifiedExplanation
//
// ============================================================

function buildMissingExplanationQuery(subject) {
  const normalizedSubject = normalizeSubject(subject);

  return {
    source: "ALOC",

    subject: normalizedSubject,

    $or: [
      // ------------------------------------------------------
      // No explanation object at all
      // ------------------------------------------------------

      {
        explanation: {
          $exists: false,
        },
      },

      // ------------------------------------------------------
      // Explanation object exists but main explanation
      // does not exist
      // ------------------------------------------------------

      {
        "explanation.explanation": {
          $exists: false,
        },
      },

      // ------------------------------------------------------
      // Main explanation is null
      // ------------------------------------------------------

      {
        "explanation.explanation": null,
      },

      // ------------------------------------------------------
      // Main explanation is empty
      // ------------------------------------------------------

      {
        "explanation.explanation": "",
      },

      // ------------------------------------------------------
      // Main explanation AND simplified explanation are
      // both empty/missing
      // ------------------------------------------------------

      {
        $and: [
          {
            $or: [
              {
                "explanation.explanation": {
                  $exists: false,
                },
              },
              {
                "explanation.explanation": null,
              },
              {
                "explanation.explanation": "",
              },
            ],
          },

          {
            $or: [
              {
                "explanation.simplifiedExplanation": {
                  $exists: false,
                },
              },
              {
                "explanation.simplifiedExplanation": null,
              },
              {
                "explanation.simplifiedExplanation": "",
              },
            ],
          },
        ],
      },
    ],
  };
}

// ============================================================
// GET QUESTIONS WITHOUT EXPLANATIONS
// ============================================================
//
// This is the BIG optimization.
//
// MongoDB filters out already-explained questions BEFORE they
// enter our processing loop.
//
// Therefore we don't waste:
//
//   3 seconds
//
// on questions that already have explanations.
// ============================================================

async function getLocalQuestions(subject) {
  const normalizedSubject = normalizeSubject(subject);

  console.log(
    "\n📚 Searching MongoDB for QUESTIONS WITHOUT EXPLANATIONS..."
  );

  console.log(
    `   Subject: ${normalizedSubject}`
  );

  const query = buildMissingExplanationQuery(
    normalizedSubject
  );

  console.log(
    "   🔎 MongoDB explanation filter enabled."
  );

  // ----------------------------------------------------------
  // Count only questions requiring explanations
  // ----------------------------------------------------------

  const total = await Question.countDocuments(query);

  console.log(
    `   📦 Questions WITHOUT explanation: ${total}`
  );

  // ----------------------------------------------------------
  // Nothing missing
  // ----------------------------------------------------------

  if (total === 0) {
    console.log(
      `   ✅ All ${normalizedSubject} questions already have explanations.`
    );

    console.log(
      `   ⏭️ Skipping ${normalizedSubject} immediately.`
    );

    return {
      total: 0,
      cursor: null,
    };
  }

  console.log(
    `   🚀 ${total} questions require explanations.`
  );

  // ----------------------------------------------------------
  // Cursor
  // ----------------------------------------------------------
  // Sequential processing.
  //
  // sort by createdAt and _id to keep processing stable.
  // ----------------------------------------------------------

  const cursor = Question.find(query)
    .sort({
      createdAt: 1,
      _id: 1,
    })
    .lean()
    .cursor({
      batchSize: DB_CURSOR_BATCH_SIZE,
    });

  return {
    total,
    cursor,
  };
}

// ============================================================
// CHECK IF QUESTION ALREADY HAS EXPLANATION
// ============================================================
//
// This remains as a SECOND safety check.
//
// MongoDB already filters these questions out, but this prevents
// accidental ALOC requests if something changes between the
// query and processing.
// ============================================================

function hasExplanation(question) {
  if (!question) {
    return false;
  }

  const explanation = question.explanation;

  if (!explanation) {
    return false;
  }

  // ----------------------------------------------------------
  // If old data contains a string
  // ----------------------------------------------------------

  if (typeof explanation === "string") {
    return explanation.trim().length > 0;
  }

  // ----------------------------------------------------------
  // Embedded explanation object
  // ----------------------------------------------------------

  if (
    typeof explanation === "object" &&
    !Array.isArray(explanation)
  ) {
    const mainExplanation =
      typeof explanation.explanation === "string"
        ? explanation.explanation.trim()
        : "";

    const simplifiedExplanation =
      typeof explanation.simplifiedExplanation === "string"
        ? explanation.simplifiedExplanation.trim()
        : "";

    return (
      mainExplanation.length > 0 ||
      simplifiedExplanation.length > 0
    );
  }

  return false;
}

// ============================================================
// PRINT API ERROR
// ============================================================

function printApiError(error) {
  console.log("\n❌ ALOC API ERROR");

  if (error?.response) {
    console.log(
      `   HTTP Status: ${error.response.status}`
    );

    console.log(
      "   Response:",
      JSON.stringify(
        error.response.data,
        null,
        2
      )
    );

    const remaining =
      error.response.headers?.["x-ratelimit-remaining"];

    if (remaining !== undefined) {
      console.log(
        `   X-RateLimit-Remaining: ${remaining}`
      );
    }
  } else if (error?.request) {
    console.log(
      "   ❌ No response received from ALOC."
    );
  } else {
    console.log(
      `   ❌ ${error?.message || error}`
    );
  }
}

// ============================================================
// REQUEST WITH RETRY
// ============================================================

async function requestWithRetry(
  method,
  url,
  config = {}
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `   🌐 ALOC request attempt ${attempt}/${MAX_RETRIES}`
      );

      const response = await aloc.request({
        method,
        url,
        ...config,
      });

      return response;
    } catch (error) {
      lastError = error;

      const status =
        error?.response?.status;

      // ------------------------------------------------------
      // 401
      // ------------------------------------------------------

      if (status === 401) {
        console.log(
          "   🔐 ALOC API key unauthorized."
        );

        throw error;
      }

      // ------------------------------------------------------
      // 403
      // ------------------------------------------------------

      if (status === 403) {
        console.log(
          "   🚫 ALOC returned 403."
        );

        throw error;
      }

      // ------------------------------------------------------
      // 503
      // ------------------------------------------------------
      // Do not waste retries on service unavailable.
      // ------------------------------------------------------

      if (status === 503) {
        console.log(
          "   ⚠️ ALOC returned 503."
        );

        throw error;
      }

      // ------------------------------------------------------
      // 429 RATE LIMIT
      // ------------------------------------------------------

      if (status === 429) {
        const retryAfter =
          Number(
            error.response?.headers?.[
              "retry-after"
            ]
          ) || attempt * 5000;

        console.log(
          `   ⏳ Rate limited. Waiting ${retryAfter}ms...`
        );

        if (attempt < MAX_RETRIES) {
          await sleep(retryAfter);
          continue;
        }

        throw error;
      }

      // ------------------------------------------------------
      // TEMPORARY SERVER ERRORS
      // ------------------------------------------------------

      if (
        status === 500 ||
        status === 502 ||
        status === 504
      ) {
        const delay =
          Math.min(
            attempt * 5000,
            20000
          );

        console.log(
          `   ⏳ Temporary server error. Waiting ${delay}ms...`
        );

        if (attempt < MAX_RETRIES) {
          await sleep(delay);
          continue;
        }

        throw error;
      }

      // ------------------------------------------------------
      // NETWORK ERROR
      // ------------------------------------------------------

      if (!error?.response) {
        const delay =
          Math.min(
            attempt * 5000,
            10000
          );

        console.log(
          `   🌐 Network error. Waiting ${delay}ms...`
        );

        if (attempt < MAX_RETRIES) {
          await sleep(delay);
          continue;
        }

        throw error;
      }

      // ------------------------------------------------------
      // Other errors
      // ------------------------------------------------------

      throw error;
    }
  }

  throw lastError;
}

// ============================================================
// REQUEST EXPLANATION FROM ALOC
// ============================================================
//
// ONLY sourceId is used.
//
// Example:
//
// POST /questions/abc-123/explain
//
// No question text is downloaded from ALOC.
// ============================================================

async function requestExplanation(sourceId) {
  if (!sourceId) {
    throw new Error(
      "sourceId is missing."
    );
  }

  if (explanationAccessExhausted) {
    return null;
  }

  const response =
    await requestWithRetry(
      "POST",
      `/questions/${encodeURIComponent(
        sourceId
      )}/explain`
    );

  const explanation =
    response.data?.data;

  if (!explanation) {
    throw new Error(
      "ALOC returned no explanation data."
    );
  }

  return explanation;
}

// ============================================================
// NORMALIZE ALOC EXPLANATION
// ============================================================

function normalizeExplanation(
  explanation,
  sourceId
) {
  return {
    questionId:
      explanation.questionId ||
      sourceId ||
      null,

    explanation:
      explanation.explanation ||
      null,

    simplifiedExplanation:
      explanation.simplifiedExplanation ||
      null,

    commonMistakes:
      Array.isArray(
        explanation.commonMistakes
      )
        ? explanation.commonMistakes.map(
            (item) => ({
              mistake:
                item?.mistake ||
                null,

              whyWrong:
                item?.whyWrong ||
                null,
            })
          )
        : [],

    solutionImageUrl:
      explanation.solutionImageUrl ||
      null,

    sourceType:
      explanation.sourceType ||
      null,

    confidence:
      explanation.confidence ??
      null,

    needsReview:
      explanation.needsReview ??
      false,
  };
}

// ============================================================
// SAVE EXPLANATION
// ============================================================
//
// IMPORTANT:
//
// We update ONLY:
//
//   explanation
//
// We do NOT replace the whole question.
// ============================================================

async function saveExplanationToExistingQuestion(
  existingQuestion,
  explanation
) {
  const explanationData =
    normalizeExplanation(
      explanation,
      existingQuestion.sourceId
    );

  const result =
    await Question.updateOne(
      {
        _id: existingQuestion._id,
      },

      {
        $set: {
          explanation:
            explanationData,
        },
      }
    );

  if (
    result.matchedCount === 0
  ) {
    throw new Error(
      "Question was not found during update."
    );
  }

  return result;
}

// ============================================================
// PROCESS ONE QUESTION
// ============================================================

async function processQuestion(
  question,
  stats,
  position,
  total
) {
  console.log("\n----------------------------------------");

  console.log(
    `📝 Question ${position}/${total}`
  );

  console.log(
    `   Mongo ID: ${question._id}`
  );

  console.log(
    `   Subject: ${question.subject}`
  );

  console.log(
    `   Source: ${question.source}`
  );

  console.log(
    `   Source ID: ${question.sourceId || "MISSING"}`
  );

  // ----------------------------------------------------------
  // Check MongoDB ID
  // ----------------------------------------------------------

  if (!question._id) {
    console.log(
      "   ❌ Question has no MongoDB _id."
    );

    stats.failed++;

    return;
  }

  // ----------------------------------------------------------
  // Check sourceId
  // ----------------------------------------------------------

  const sourceId =
    String(
      question.sourceId || ""
    ).trim();

  if (!sourceId) {
    console.log(
      "   ⚠️ sourceId missing."
    );

    stats.noSourceId++;

    return;
  }

  // ----------------------------------------------------------
  // SAFETY CHECK
  // ----------------------------------------------------------

  if (
    hasExplanation(question)
  ) {
    console.log(
      "   ✅ Explanation already exists."
    );

    console.log(
      "   ⏭️ Skipping without calling ALOC."
    );

    stats.skipped++;

    return;
  }

  // ----------------------------------------------------------
  // ACCESS CHECK
  // ----------------------------------------------------------

  if (
    explanationAccessExhausted
  ) {
    console.log(
      "   🛑 Explanation access exhausted."
    );

    stats.explanationUnavailable++;

    return;
  }

  // ----------------------------------------------------------
  // GET EXPLANATION
  // ----------------------------------------------------------

  console.log(
    `   📤 Sending ONLY sourceId to ALOC...`
  );

  console.log(
    `   🔑 sourceId: ${sourceId}`
  );

  let explanation;

  try {
    explanation =
      await requestExplanation(
        sourceId
      );
  } catch (error) {
    // --------------------------------------------------------
    // 403 TIER LIMIT
    // --------------------------------------------------------

    if (
      error?.response?.status === 403
    ) {
      const errorCode =
        error.response?.data?.error?.code ||
        error.response?.data?.code ||
        error.response?.data?.errorCode;

      console.log(
        "\n🚫 ALOC ACCESS DENIED"
      );

      console.log(
        `   Code: ${errorCode || "unknown"}`
      );

      if (
        errorCode ===
          "tier_upgrade_required" ||
        errorCode ===
          "ERR_TIER_UPGRADE_REQUIRED"
      ) {
        console.log(
          "   ⚠️ Explanation tier/plan is required."
        );

        console.log(
          "   🛑 Stopping all remaining explanation requests."
        );

        explanationAccessExhausted =
          true;

        stats.explanationUnavailable++;

        return;
      }
    }

    // --------------------------------------------------------
    // 401
    // --------------------------------------------------------

    if (
      error?.response?.status === 401
    ) {
      console.log(
        "\n🔐 ALOC API KEY IS UNAUTHORIZED."
      );

      console.log(
        "   🛑 Stopping explanation processing."
      );

      explanationAccessExhausted =
        true;

      stats.explanationUnavailable++;

      return;
    }

    // --------------------------------------------------------
    // Other errors
    // --------------------------------------------------------

    console.log(
      "   ❌ Failed to get explanation."
    );

    printApiError(error);

    stats.explanationFailed++;

    return;
  }

  // ----------------------------------------------------------
  // Validate response
  // ----------------------------------------------------------

  if (!explanation) {
    console.log(
      "   ⚠️ ALOC returned empty explanation."
    );

    stats.explanationFailed++;

    return;
  }

  // ----------------------------------------------------------
  // SAVE ONLY EXPLANATION
  // ----------------------------------------------------------

  try {
    console.log(
      "   💾 Saving explanation to existing MongoDB question..."
    );

    await saveExplanationToExistingQuestion(
      question,
      explanation
    );

    console.log(
      "   ✅ Explanation saved successfully."
    );

    stats.explained++;
  } catch (error) {
    console.log(
      "   ❌ Failed to save explanation."
    );

    console.log(
      `   Error: ${error.message}`
    );

    stats.failed++;
  }
}

// ============================================================
// PROCESS ONE SUBJECT
// ============================================================

async function importSubject(
  subject,
  stats
) {
  const normalizedSubject =
    normalizeSubject(subject);

  console.log("\n\n");
  console.log(
    "============================================================"
  );

  console.log(
    `📚 PROCESSING SUBJECT: ${normalizedSubject}`
  );

  console.log(
    "============================================================"
  );

  let cursor = null;

  try {
    // --------------------------------------------------------
    // Get ONLY questions without explanations
    // --------------------------------------------------------

    const result =
      await getLocalQuestions(
        normalizedSubject
      );

    const total =
      result.total;

    cursor =
      result.cursor;

    // --------------------------------------------------------
    // Subject already complete
    // --------------------------------------------------------

    if (
      total === 0 ||
      !cursor
    ) {
      console.log(
        `\n🎉 ${normalizedSubject} is already complete.`
      );

      return;
    }

    stats.totalQuestions +=
      total;

    // --------------------------------------------------------
    // Process sequentially
    // --------------------------------------------------------

    let position = 0;

    for await (
      const question of cursor
    ) {
      position++;

      await processQuestion(
        question,
        stats,
        position,
        total
      );

      // ------------------------------------------------------
      // Stop if ALOC explanation access is exhausted
      // ------------------------------------------------------

      if (
        explanationAccessExhausted
      ) {
        console.log(
          "\n🛑 Stopping current subject because ALOC explanation access is exhausted."
        );

        break;
      }

      // ------------------------------------------------------
      // Wait before next ALOC request
      // ------------------------------------------------------

      if (
        position < total
      ) {
        console.log(
          `   ⏳ Waiting ${QUESTION_DELAY}ms before next question...`
        );

        await sleep(
          QUESTION_DELAY
        );
      }
    }

    // --------------------------------------------------------
    // Subject summary
    // --------------------------------------------------------

    console.log("\n");
    console.log(
      `📊 SUBJECT SUMMARY: ${normalizedSubject}`
    );

    console.log(
      "----------------------------------------"
    );

    console.log(
      `   Questions found: ${total}`
    );

    console.log(
      `   Explained: ${stats.explained}`
    );

    console.log(
      `   Skipped: ${stats.skipped}`
    );

    console.log(
      `   Explanation failed: ${stats.explanationFailed}`
    );

    console.log(
      `   No sourceId: ${stats.noSourceId}`
    );

    console.log(
      `   Failed: ${stats.failed}`
    );
  } catch (error) {
    console.log(
      `\n🚨 Subject failed: ${normalizedSubject}`
    );

    console.log(
      `   Error: ${error.message}`
    );

    stats.failed++;

    console.log(
      "⏭️ Moving to next subject..."
    );
  } finally {
    // --------------------------------------------------------
    // Always close cursor
    // --------------------------------------------------------

    if (cursor) {
      try {
        await cursor.close();
      } catch (error) {
        console.log(
          "   ⚠️ Could not close MongoDB cursor:",
          error.message
        );
      }
    }
  }
}

// ============================================================
// PROCESS ALL COMPATIBLE SUBJECTS
// ============================================================

async function processCompatibleSubjects(
  compatibleSubjects,
  stats
) {
  console.log("\n\n");
  console.log(
    "============================================================"
  );

  console.log(
    "🚀 STARTING EXPLANATION PROCESSING"
  );

  console.log(
    "============================================================"
  );

  for (
    let i = 0;
    i < compatibleSubjects.length;
    i++
  ) {
    const subject =
      compatibleSubjects[i];

    console.log("\n");
    console.log(
      `📍 Subject ${i + 1}/${compatibleSubjects.length}: ${subject}`
    );

    // --------------------------------------------------------
    // Process ONE subject completely before moving to next
    // --------------------------------------------------------

    await importSubject(
      subject,
      stats
    );

    stats.subjectsProcessed++;

    // --------------------------------------------------------
    // Stop everything if ALOC access is exhausted
    // --------------------------------------------------------

    if (
      explanationAccessExhausted
    ) {
      console.log("\n");
      console.log(
        "🛑 ALOC explanation access is exhausted."
      );

      console.log(
        "🛑 No more explanation requests will be made."
      );

      break;
    }

    // --------------------------------------------------------
    // Wait between subjects
    // --------------------------------------------------------

    if (
      i <
      compatibleSubjects.length - 1
    ) {
      console.log(
        `\n⏳ Waiting ${SUBJECT_DELAY}ms before next subject...`
      );

      await sleep(
        SUBJECT_DELAY
      );
    }
  }
}

// ============================================================
// MAIN IMPORT FUNCTION
// ============================================================

async function importAll() {
  const stats = {
    subjectsProcessed: 0,

    totalQuestions: 0,

    explained: 0,

    skipped: 0,

    explanationFailed: 0,

    explanationUnavailable: 0,

    noSourceId: 0,

    failed: 0,
  };

  try {
    // --------------------------------------------------------
    // Header
    // --------------------------------------------------------

    console.log("\n");
    console.log(
      "============================================================"
    );

    console.log(
      "🚀 MONGODB → ALOC EXPLANATION UPDATER"
    );

    console.log(
      "============================================================"
    );

    console.log(
      "\n📌 IMPORTANT:"
    );

    console.log(
      "   Questions come from YOUR MongoDB."
    );

    console.log(
      "   ALOC is used ONLY for explanations."
    );

    console.log(
      "   Only sourceId is sent to ALOC."
    );

    console.log(
      "   Existing questions are NOT replaced."
    );

    console.log(
      "   Already-explained questions are filtered out by MongoDB."
    );

    console.log(
      "============================================================"
    );

    // --------------------------------------------------------
    // Environment
    // --------------------------------------------------------

    validateEnvironment();

    // --------------------------------------------------------
    // MongoDB
    // --------------------------------------------------------

    await connectDB();

    // --------------------------------------------------------
    // Get subjects from YOUR MongoDB
    // --------------------------------------------------------

    const databaseSubjects =
      await getDatabaseSubjects();

    // --------------------------------------------------------
    // Compare with configured SUBJECTS
    // --------------------------------------------------------

    const compatibleSubjects =
      getCompatibleSubjects(
        databaseSubjects
      );

    // --------------------------------------------------------
    // No compatible subjects
    // --------------------------------------------------------

    if (
      compatibleSubjects.length === 0
    ) {
      console.log("\n");
      console.log(
        "⚠️ No compatible subjects found."
      );

      return;
    }

    // --------------------------------------------------------
    // FINAL PROCESSING ORDER
    // --------------------------------------------------------

    console.log("\n");
    console.log(
      "============================================================"
    );

    console.log(
      "📋 FINAL PROCESSING ORDER"
    );

    console.log(
      "============================================================"
    );

    compatibleSubjects.forEach(
      (subject, index) => {
        console.log(
          `   ${index + 1}. ${subject}`
        );
      }
    );

    console.log(
      "\n⏱️ Subjects will be processed sequentially."
    );

    console.log(
      "🔎 Each subject checks MongoDB for missing explanations first."
    );

    console.log(
      "⏭️ Subjects with zero missing explanations are skipped immediately."
    );

    // --------------------------------------------------------
    // Process
    // --------------------------------------------------------

    await processCompatibleSubjects(
      compatibleSubjects,
      stats
    );

    // --------------------------------------------------------
    // FINAL REPORT
    // --------------------------------------------------------

    console.log("\n\n");
    console.log(
      "============================================================"
    );

    console.log(
      "🏁 FINAL REPORT"
    );

    console.log(
      "============================================================"
    );

    console.log(
      `   Subjects processed: ${stats.subjectsProcessed}`
    );

    console.log(
      `   Questions requiring explanation: ${stats.totalQuestions}`
    );

    console.log(
      `   Explanations saved: ${stats.explained}`
    );

    console.log(
      `   Already explained / skipped: ${stats.skipped}`
    );

    console.log(
      `   Explanation failures: ${stats.explanationFailed}`
    );

    console.log(
      `   Explanation access unavailable: ${stats.explanationUnavailable}`
    );

    console.log(
      `   Missing sourceId: ${stats.noSourceId}`
    );

    console.log(
      `   Other failures: ${stats.failed}`
    );

    console.log(
      "============================================================"
    );

    if (
      explanationAccessExhausted
    ) {
      console.log(
        "\n⚠️ PROCESS STOPPED BECAUSE ALOC EXPLANATION ACCESS WAS EXHAUSTED."
      );
    } else {
      console.log(
        "\n🎉 EXPLANATION UPDATE COMPLETED."
      );
    }
  } catch (error) {
    console.log("\n");
    console.log(
      "============================================================"
    );

    console.log(
      "💥 FATAL ERROR"
    );

    console.log(
      "============================================================"
    );

    console.log(
      `Error: ${error.message}`
    );

    if (
      error.stack
    ) {
      console.log(
        "\nStack:"
      );

      console.log(
        error.stack
      );
    }
  } finally {
    // --------------------------------------------------------
    // Disconnect MongoDB
    // --------------------------------------------------------

    try {
      if (
        mongoose.connection.readyState !== 0
      ) {
        await mongoose.disconnect();

        console.log(
          "\n🔌 MongoDB disconnected."
        );
      }
    } catch (error) {
      console.log(
        "⚠️ MongoDB disconnect error:",
        error.message
      );
    }
  }
}

// ============================================================
// START
// ============================================================

importAll();