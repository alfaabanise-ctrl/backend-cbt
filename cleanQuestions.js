import mongoose from "mongoose";
import Question from "./model/Question.js";
import dotenv from "dotenv";
import dns from "node:dns";

dns.setServers([
  "8.8.8.8",
  "8.8.4.4",
]);

dotenv.config();

const MONGO_URI = process.env.DATA_BASE;

// ==========================================
// RESUME SETTINGS
// ==========================================

// You stopped after:
// 2875/8678
//
// Therefore start from:
// 2876

const START_FROM = 2876;

// Process 10 questions at the same time
const BATCH_SIZE = 10;

// ==========================================
// CLEAN ONE QUESTION
// ==========================================

async function cleanOneQuestion(oldQuestion) {
  const raw = oldQuestion.rawData;

  if (!raw || typeof raw !== "object") {
    return {
      status: "skipped",
      id: oldQuestion._id,
    };
  }

  // ==========================================
  // QUESTION
  // ==========================================

  const question =
    oldQuestion.question?.trim() ||
    raw.text?.trim() ||
    raw.question?.trim() ||
    oldQuestion.questionText?.trim() ||
    oldQuestion.text?.trim() ||
    null;

  // ==========================================
  // OPTIONS
  // ==========================================

  const rawOptions = raw.options || {};
  const oldOptions = oldQuestion.options || {};

  const options = {
    a:
      oldOptions.a ??
      rawOptions.a ??
      rawOptions.A ??
      null,

    b:
      oldOptions.b ??
      rawOptions.b ??
      rawOptions.B ??
      null,

    c:
      oldOptions.c ??
      rawOptions.c ??
      rawOptions.C ??
      null,

    d:
      oldOptions.d ??
      rawOptions.d ??
      rawOptions.D ??
      null,

    e:
      oldOptions.e ??
      rawOptions.e ??
      rawOptions.E ??
      null,
  };

  // ==========================================
  // CORRECT ANSWER
  // ==========================================

  const rawCorrectAnswer =
    raw.correctAnswer ??
    raw.answer ??
    oldQuestion.correctAnswer ??
    oldQuestion.answer ??
    null;

  const correctAnswer = rawCorrectAnswer
    ? String(rawCorrectAnswer)
        .trim()
        .toLowerCase()
    : null;

  // ==========================================
  // ANSWER
  // ==========================================

  const answer =
    oldQuestion.answer
      ?.trim()
      .toLowerCase() ||
    correctAnswer ||
    null;

  // ==========================================
  // SUBJECT
  // ==========================================

  const subject =
    oldQuestion.subject
      ?.trim()
      .toLowerCase() ||
    raw.subject
      ?.trim()
      .toLowerCase() ||
    null;

  // ==========================================
  // EXAM TYPE
  // ==========================================

  const examType =
    oldQuestion.examType
      ?.trim()
      .toLowerCase() ||
    raw.examType
      ?.trim()
      .toLowerCase() ||
    null;

  // ==========================================
  // YEAR
  // ==========================================

  const year =
    oldQuestion.year ??
    raw.year ??
    null;

  // ==========================================
  // QUESTION NUMBER
  // ==========================================

  const questionNumber =
    oldQuestion.questionNumber ??
    oldQuestion.number ??
    raw.questionNumber ??
    null;

  // ==========================================
  // SECTION
  // ==========================================

  const section =
    oldQuestion.section?.trim() ||
    raw.section?.trim() ||
    "";

  // ==========================================
  // IMAGE
  // ==========================================

  const imageUrl =
    oldQuestion.imageUrl ||
    raw.imageUrl ||
    null;

  const image =
    oldQuestion.image ||
    raw.imageUrl ||
    raw.image ||
    null;

  // ==========================================
  // CATEGORY
  // ==========================================

  const category =
    oldQuestion.category?.trim() ||
    raw.category?.trim() ||
    "";

  // ==========================================
  // TOPIC
  // ==========================================

  const topic =
    oldQuestion.topic?.trim() ||
    raw.topic?.trim() ||
    null;

  // ==========================================
  // UPDATE
  // ==========================================

  const updateData = {
    question,
    options,

    answer,
    correctAnswer,

    subject,
    examType,
    year,

    questionNumber,

    section,

    image,
    imageUrl,

    topic,

    category,

    country:
      oldQuestion.country ||
      raw.country ||
      "NG",

    metadata:
      oldQuestion.metadata ??
      raw.metadata ??
      null,

    // IMPORTANT:
    // rawData remains untouched.
  };

  // Remove undefined/null
  Object.keys(updateData).forEach((key) => {
    if (
      updateData[key] === undefined ||
      updateData[key] === null
    ) {
      delete updateData[key];
    }
  });

  await Question.updateOne(
    {
      _id: oldQuestion._id,
    },
    {
      $set: updateData,
    }
  );

  return {
    status: "updated",
    id: oldQuestion._id,
    subject,
    year,
  };
}

// ==========================================
// MAIN
// ==========================================

async function cleanQuestions() {
  try {
    console.log("");
    console.log("==========================================");
    console.log("QUESTION CLEANUP MIGRATION");
    console.log("==========================================");

    console.log(
      `Starting from question ${START_FROM}`
    );

    console.log(
      `Processing ${BATCH_SIZE} questions concurrently`
    );

    console.log("");

    if (!MONGO_URI) {
      throw new Error(
        "DATA_BASE is missing from .env"
      );
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("✅ Connected to MongoDB");
    console.log("");

    // ==========================================
    // TOTAL
    // ==========================================

    const totalQuestions =
      await Question.countDocuments({
        rawData: { $ne: null },
      });

    console.log(
      `Total questions: ${totalQuestions}`
    );

    console.log(
      `Resuming at: ${START_FROM}`
    );

    console.log("");

    // ==========================================
    // COUNTERS
    // ==========================================

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    // ==========================================
    // PROCESS 10 AT A TIME
    // ==========================================

    for (
      let position = START_FROM;
      position <= totalQuestions;
      position += BATCH_SIZE
    ) {
      const batchEnd = Math.min(
        position + BATCH_SIZE - 1,
        totalQuestions
      );

      console.log(
        `\n📦 Processing ${position}-${batchEnd}/${totalQuestions}`
      );

      // ==========================================
      // LOAD 10
      // ==========================================

      const questions = await Question.find({
        rawData: { $ne: null },
      })
        .sort({ _id: 1 })
        .skip(position - 1)
        .limit(BATCH_SIZE)
        .lean();

      // ==========================================
      // UPDATE 10 AT SAME TIME
      // ==========================================

      const results = await Promise.allSettled(
        questions.map((question) =>
          cleanOneQuestion(question)
        )
      );

      // ==========================================
      // RESULTS
      // ==========================================

      results.forEach((result, index) => {
        const currentPosition =
          position + index;

        if (result.status === "fulfilled") {
          const data = result.value;

          if (data.status === "updated") {
            updated++;

            console.log(
              `✓ ${currentPosition}/${totalQuestions} | ${data.id} | ${data.subject || "unknown"} | ${data.year || "unknown"}`
            );
          } else {
            skipped++;

            console.log(
              `⚠ ${currentPosition}/${totalQuestions} | ${data.id} | SKIPPED`
            );
          }
        } else {
          failed++;

          console.error(
            `✗ ${currentPosition}/${totalQuestions} | FAILED`
          );

          console.error(
            result.reason?.message ||
              result.reason
          );
        }
      });

      console.log(
        `📊 Progress: ${batchEnd}/${totalQuestions} | Updated: ${updated} | Failed: ${failed}`
      );
    }

    // ==========================================
    // COMPLETE
    // ==========================================

    console.log("");
    console.log("==========================================");
    console.log("🎉 MIGRATION COMPLETE");
    console.log("==========================================");

    console.log(
      `Started from : ${START_FROM}`
    );

    console.log(
      `Total        : ${totalQuestions}`
    );

    console.log(
      `Updated      : ${updated}`
    );

    console.log(
      `Skipped      : ${skipped}`
    );

    console.log(
      `Failed       : ${failed}`
    );

    console.log("==========================================");

    await mongoose.disconnect();

    console.log("MongoDB disconnected.");

    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("==========================================");
    console.error("❌ MIGRATION FAILED");
    console.error("==========================================");
    console.error(error);

    await mongoose.disconnect().catch(() => {});

    process.exit(1);
  }
}

cleanQuestions();