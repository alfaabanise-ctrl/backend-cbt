
// =========================================================
// LOCAL AI QUESTION EXPLANATION IMPORTER
// =========================================================
//
// Uses Ollama running on your own computer.
//
// MongoDB
//    ↓
// Question without explanation
//    ↓
// Ollama local AI
//    ↓
// Validate JSON
//    ↓
// Save explanation to MongoDB
//
// No ALOC explanation credits are used.
// =========================================================

import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios";

import Question from "./model/Question.js";

dotenv.config();

// =========================================================
// CONFIGURATION
// =========================================================

const OLLAMA_URL = "http://127.0.0.1:11434";

const MODEL = "qwen2.5:7b";

// Number of questions to process.
// Set to 5 for your first test.
// Later change to 9000 or use 0 for all.
const TEST_LIMIT = 5;

// Delay between questions.
// This gives your computer a little breathing room.
const QUESTION_DELAY = 1000;

// Maximum time allowed for one AI generation.
// Local AI can take longer on CPU.
const AI_TIMEOUT = 180000;

// =========================================================
// HELPERS
// =========================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =========================================================
// CHECK MONGODB
// =========================================================

async function connectDB() {
  if (!process.env.DATA_BASE) {
    throw new Error(
      "DATA_BASE is missing from your .env file."
    );
  }

  console.log("");
  console.log("==============================================");
  console.log("🔌 Connecting to MongoDB...");
  console.log("==============================================");

  await mongoose.connect(process.env.DATA_BASE);

  console.log("✅ MongoDB connected");

  // Diagnostic
  const explanationPath =
    Question.schema.path("explanation");

  console.log("");
  console.log("🔎 Explanation schema:");

  if (!explanationPath) {
    console.log(
      "❌ Question.explanation was not found."
    );
  } else {
    console.log(
      `   Type: ${explanationPath.instance}`
    );

    console.log(
      `   SchemaType: ${
        explanationPath.constructor?.name ||
        "Unknown"
      }`
    );

    if (explanationPath.instance === "String") {
      console.log("");
      console.log(
        "🚨 WARNING: explanation is STRING."
      );
      console.log(
        "   Your Question.js appears to be old."
      );
      console.log("");
    } else {
      console.log(
        "   ✅ Explanation is a nested object."
      );
    }
  }

  console.log("");
}

// =========================================================
// CHECK OLLAMA
// =========================================================

async function checkOllama() {
  console.log(
    "=============================================="
  );

  console.log(
    "🤖 Checking local Ollama..."
  );

  console.log(
    "=============================================="
  );

  try {
    const response = await axios.get(
      `${OLLAMA_URL}/api/tags`,
      {
        timeout: 10000,
      }
    );

    const models =
      response.data?.models || [];

    const modelExists =
      models.some(
        (item) =>
          item.name === MODEL ||
          item.name.startsWith(`${MODEL}:`)
      );

    if (!modelExists) {
      console.log("");
      console.log(
        `❌ Model "${MODEL}" was not found.`
      );

      console.log("");
      console.log(
        "Run:"
      );

      console.log(
        `   ollama pull ${MODEL}`
      );

      console.log("");

      process.exit(1);
    }

    console.log(
      `✅ Ollama is running`
    );

    console.log(
      `✅ Model available: ${MODEL}`
    );

    console.log("");

  } catch (error) {
    console.log("");
    console.log(
      "❌ Cannot connect to Ollama."
    );

    console.log("");
    console.log(
      "Make sure Ollama is installed and running."
    );

    console.log("");

    console.log(
      "Try:"
    );

    console.log(
      "   ollama list"
    );

    console.log("");

    console.log(
      `Expected Ollama URL: ${OLLAMA_URL}`
    );

    console.log("");

    throw error;
  }
}

// =========================================================
// CLEAN AI RESPONSE
// =========================================================

function cleanJsonText(text) {
  if (!text) {
    return "";
  }

  let cleaned = text.trim();

  // Remove markdown code fences
  cleaned = cleaned.replace(
    /^```json\s*/i,
    ""
  );

  cleaned = cleaned.replace(
    /^```\s*/i,
    ""
  );

  cleaned = cleaned.replace(
    /\s*```$/i,
    ""
  );

  return cleaned.trim();
}

// =========================================================
// NORMALIZE EXPLANATION
// =========================================================

function normalizeExplanation(
  explanation,
  questionId
) {
  if (
    !explanation ||
    typeof explanation !== "object"
  ) {
    throw new Error(
      "AI did not return an explanation object."
    );
  }

  const commonMistakes =
    Array.isArray(
      explanation.commonMistakes
    )
      ? explanation.commonMistakes
          .slice(0, 5)
          .map((item) => ({
            mistake:
              item?.mistake
                ? String(item.mistake).trim()
                : null,

            whyWrong:
              item?.whyWrong
                ? String(item.whyWrong).trim()
                : null,
          }))
      : [];

  let confidence =
    explanation.confidence;

  if (
    typeof confidence !== "number" ||
    Number.isNaN(confidence)
  ) {
    confidence = null;
  }

  if (confidence !== null) {
    confidence = Math.max(
      0,
      Math.min(1, confidence)
    );
  }

  return {
    questionId:
      explanation.questionId ||
      questionId ||
      null,

    explanation:
      explanation.explanation
        ? String(
            explanation.explanation
          ).trim()
        : null,

    simplifiedExplanation:
      explanation.simplifiedExplanation
        ? String(
            explanation.simplifiedExplanation
          ).trim()
        : null,

    commonMistakes,

    solutionImageUrl:
      explanation.solutionImageUrl ||
      null,

    sourceType:
      explanation.sourceType ||
      "ollama-local",

    confidence,

    needsReview:
      Boolean(
        explanation.needsReview
      ),
  };
}

// =========================================================
// BUILD PROMPT
// =========================================================

function buildPrompt(question) {
  const questionText =
    question.question ||
    question.questionText ||
    question.text ||
    "";

  const options = question.options || {};

  const answer =
    question.correctAnswer ||
    question.answer ||
    "";

  return `
You are an expert Nigerian examination tutor.

Analyze the following examination question carefully.

The question may come from:
- JAMB
- WAEC
- NECO
- Post-UTME
- State examinations

Your job is to produce a CORRECT educational explanation.

IMPORTANT:
1. Solve the question yourself.
2. Determine why the correct answer is correct.
3. Explain the concept clearly.
4. Do not invent facts.
5. Do not simply repeat the answer.
6. Explain the reasoning in a way a Nigerian secondary-school student can understand.
7. If the supplied answer appears incorrect, do NOT blindly accept it. Explain the issue and set needsReview to true.
8. Return ONLY valid JSON.
9. Do NOT use markdown.
10. Do NOT put JSON inside code fences.

QUESTION:

${questionText}

OPTIONS:

A. ${options.a || ""}
B. ${options.b || ""}
C. ${options.c || ""}
D. ${options.d || ""}
E. ${options.e || ""}

SUPPLIED CORRECT ANSWER:

${answer}

SUBJECT:

${question.subject || ""}

EXAM TYPE:

${question.examType || ""}

YEAR:

${question.year || ""}

TOPIC:

${question.topic || ""}

Return exactly this JSON structure:

{
  "questionId": "${question.sourceId}",
  "explanation": "Detailed explanation of the correct answer.",
  "simplifiedExplanation": "Simple explanation a student can easily understand.",
  "commonMistakes": [
    {
      "mistake": "A common mistake students make.",
      "whyWrong": "Why that mistake is wrong."
    }
  ],
  "solutionImageUrl": null,
  "sourceType": "ollama-local",
  "confidence": 0.95,
  "needsReview": false
}

The confidence value must be between 0 and 1.

Use between 1 and 5 common mistakes when useful.
`;
}

// =========================================================
// GENERATE EXPLANATION
// =========================================================

async function generateExplanation(question) {
  const prompt =
    buildPrompt(question);

  console.log(
    "   🤖 Sending question to local AI..."
  );

  const response =
    await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: MODEL,

        prompt,

        stream: false,

        format: "json",

        options: {
          temperature: 0.2,
        },
      },
      {
        timeout: AI_TIMEOUT,
      }
    );

  const rawResponse =
    response.data?.response;

  if (!rawResponse) {
    throw new Error(
      "Ollama returned an empty response."
    );
  }

  console.log(
    "   ✅ AI response received"
  );

  const cleaned =
    cleanJsonText(rawResponse);

  let parsed;

  try {
    parsed =
      JSON.parse(cleaned);
  } catch (error) {
    console.log("");
    console.log(
      "❌ AI returned invalid JSON."
    );

    console.log("");
    console.log(
      "Raw AI response:"
    );

    console.log(
      rawResponse
    );

    console.log("");

    throw new Error(
      "Invalid JSON returned by Ollama."
    );
  }

  return normalizeExplanation(
    parsed,
    question.sourceId
  );
}

// =========================================================
// SAVE EXPLANATION
// =========================================================

async function saveExplanation(
  question,
  explanation
) {
  const result =
    await Question.updateOne(
      {
        _id: question._id,
      },
      {
        $set: {
          explanation,
        },
      }
    );

  if (
    result.modifiedCount > 0
  ) {
    console.log(
      "   💾 Explanation saved successfully"
    );

    return true;
  }

  if (
    result.matchedCount > 0
  ) {
    console.log(
      "   ℹ️ Question matched, but nothing changed."
    );

    return true;
  }

  console.log(
    "   ❌ Question could not be found."
  );

  return false;
}

// =========================================================
// PROCESS ONE QUESTION
// =========================================================

async function processQuestion(
  question,
  index,
  total
) {
  console.log("");
  console.log(
    `───────── Question ${index}/${total} ─────────`
  );

  console.log(
    `🆔 ALOC ID: ${question.sourceId}`
  );

  console.log(
    `📚 Subject: ${question.subject}`
  );

  console.log(
    `📝 Exam: ${question.examType} ${question.year}`
  );

  // ==========================================
  // CHECK EXISTING EXPLANATION
  // ==========================================

  if (
    question.explanation &&
    (
      question.explanation.explanation ||
      question.explanation.simplifiedExplanation
    )
  ) {
    console.log(
      "   ✅ Explanation already exists."
    );

    console.log(
      "   ⏭️ Skipping..."
    );

    return {
      status: "skipped",
    };
  }

  console.log(
    "   📚 Question has no explanation."
  );

  // ==========================================
  // GENERATE
  // ==========================================

  try {
    const explanation =
      await generateExplanation(
        question
      );

    console.log("");
    console.log(
      `   📝 Explanation length: ${
        explanation.explanation
          ? explanation.explanation.length
          : 0
      }`
    );

    console.log(
      `   📝 Simplified length: ${
        explanation.simplifiedExplanation
          ? explanation.simplifiedExplanation.length
          : 0
      }`
    );

    console.log(
      `   📝 Common mistakes: ${
        explanation.commonMistakes.length
      }`
    );

    console.log(
      `   🎯 Confidence: ${
        explanation.confidence ?? "N/A"
      }`
    );

    // ==========================================
    // SAVE
    // ==========================================

    const saved =
      await saveExplanation(
        question,
        explanation
      );

    if (!saved) {
      return {
        status: "failed",
      };
    }

    return {
      status: "saved",
    };

  } catch (error) {
    console.log("");

    if (
      error.code ===
      "ECONNABORTED"
    ) {
      console.log(
        "   ❌ Ollama request timed out."
      );
    } else {
      console.log(
        "   ❌ Explanation generation failed."
      );

      console.log(
        `   Message: ${error.message}`
      );
    }

    return {
      status: "failed",
    };
  }
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log("");
  console.log(
    "======================================================"
  );

  console.log(
    "🤖 LOCAL AI QUESTION EXPLANATION IMPORTER"
  );

  console.log(
    "======================================================"
  );

  console.log("");
  console.log(
    `AI Model: ${MODEL}`
  );

  console.log(
    `Ollama: ${OLLAMA_URL}`
  );

  console.log("");

  try {
    // ==========================================
    // CONNECT
    // ==========================================

    await connectDB();

    // ==========================================
    // CHECK OLLAMA
    // ==========================================

    await checkOllama();

    // ==========================================
    // FIND QUESTIONS WITHOUT EXPLANATION
    // ==========================================

    console.log(
      "=============================================="
    );

    console.log(
      "🔎 Finding questions without explanations..."
    );

    console.log(
      "=============================================="
    );

    const query = {
      $or: [
        {
          explanation: null,
        },
        {
          "explanation.explanation": {
            $in: [
              null,
              "",
            ],
          },
        },
      ],
    };

    let mongoQuery =
      Question.find(query)
        .sort({
          _id: 1,
        });

    if (
      TEST_LIMIT &&
      TEST_LIMIT > 0
    ) {
      mongoQuery =
        mongoQuery.limit(
          TEST_LIMIT
        );
    }

    const questions =
      await mongoQuery.lean();

    console.log("");
    console.log(
      `📊 Questions selected: ${questions.length}`
    );

    if (
      questions.length === 0
    ) {
      console.log("");
      console.log(
        "🎉 No questions need explanations."
      );

      return;
    }

    console.log("");

    // ==========================================
    // PROCESS
    // ==========================================

    let saved = 0;
    let skipped = 0;
    let failed = 0;

    for (
      let i = 0;
      i < questions.length;
      i++
    ) {
      const result =
        await processQuestion(
          questions[i],
          i + 1,
          questions.length
        );

      if (
        result.status ===
        "saved"
      ) {
        saved++;
      } else if (
        result.status ===
        "skipped"
      ) {
        skipped++;
      } else {
        failed++;
      }

      // ========================================
      // DELAY
      // ========================================

      if (
        i <
        questions.length - 1
      ) {
        await sleep(
          QUESTION_DELAY
        );
      }
    }

    // ==========================================
    // SUMMARY
    // ==========================================

    console.log("");
    console.log(
      "======================================================"
    );

    console.log(
      "🎉 LOCAL AI IMPORT COMPLETE"
    );

    console.log(
      "======================================================"
    );

    console.log(
      `📊 Processed: ${questions.length}`
    );

    console.log(
      `✅ Saved: ${saved}`
    );

    console.log(
      `⏭️ Skipped: ${skipped}`
    );

    console.log(
      `❌ Failed: ${failed}`
    );

    console.log(
      "======================================================"
    );

  } catch (error) {
    console.log("");

    console.log(
      "======================================================"
    );

    console.log(
      "❌ IMPORTER FAILED"
    );

    console.log(
      "======================================================"
    );

    console.log(
      error.message
    );

    console.log("");
  } finally {
    await mongoose.disconnect();

    console.log(
      "🔌 MongoDB disconnected."
    );

    console.log("");
  }
}

// =========================================================
// START
// =========================================================

main();
