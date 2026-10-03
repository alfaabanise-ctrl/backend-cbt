import dotenv from "dotenv";
import dns from "node:dns";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Question from "../model/Question.js";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIRECTORY, "../.env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const explanationTextMissing = (field) => ({
  $or: [
    { [field]: { $exists: false } },
    { [field]: null },
    { [field]: "" },
    { [field]: /^\s*$/ },
  ],
});

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
    explanationTextMissing("explanation.explanation"),
    explanationTextMissing("explanation.simplifiedExplanation"),
  ],
};

const explanationText = (field) => ({
  $trim: {
    input: {
      $convert: {
        input: field,
        to: "string",
        onError: "",
        onNull: "",
      },
    },
  },
});

const subjectExplanationCounts = [
  {
    $group: {
      _id: "$subject",
      totalQuestions: { $sum: 1 },
      withExplanation: {
        $sum: {
          $cond: [
            {
              $or: [
                {
                  $and: [
                    { $eq: [{ $type: "$explanation" }, "string"] },
                    { $ne: [explanationText("$explanation"), ""] },
                  ],
                },
                { $ne: [explanationText("$explanation.explanation"), ""] },
                {
                  $ne: [
                    explanationText("$explanation.simplifiedExplanation"),
                    "",
                  ],
                },
              ],
            },
            1,
            0,
          ],
        },
      },
    },
  },
  {
    $addFields: {
      withoutExplanation: {
        $subtract: ["$totalQuestions", "$withExplanation"],
      },
    },
  },
  { $sort: { _id: 1 } },
];

function getDisplayLimit() {
  if (process.argv.includes("--all")) {
    return 0;
  }

  const limitArgument = process.argv.find((argument) =>
    argument.startsWith("--limit="),
  );
  if (!limitArgument) {
    return 100;
  }

  const value = limitArgument.slice("--limit=".length);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("--limit must be a non-negative integer.");
  }

  return Number(value);
}

async function main() {
  const mongoUri = process.env.DATA_BASE;
  if (!mongoUri) {
    throw new Error("DATA_BASE is missing from .env");
  }

  const displayLimit = getDisplayLimit();
  let connected = false;
  try {
    await mongoose.connect(mongoUri);
    connected = true;

    const [total, missingCount, questions, subjectCounts] = await Promise.all([
      Question.countDocuments(),
      Question.countDocuments(missingExplanationFilter),
      Question.find(missingExplanationFilter)
        .sort({ _id: 1 })
        .select(
          "_id source sourceId subject examType year questionNumber number question questionText text",
        )
        .limit(displayLimit)
        .lean(),
      Question.aggregate(subjectExplanationCounts),
    ]);

    console.log(`Total questions: ${total}`);
    console.log(`Questions with an explanation: ${total - missingCount}`);
    console.log(`Questions without an explanation: ${missingCount}`);
    console.table([
      ...subjectCounts.map(({ _id, totalQuestions, withExplanation, withoutExplanation }) => ({
        subject: _id ?? "(unspecified)",
        totalQuestions,
        withExplanation,
        withoutExplanation,
      })),
      {
        subject: "TOTAL",
        totalQuestions: subjectCounts.reduce(
          (sum, item) => sum + item.totalQuestions,
          0,
        ),
        withExplanation: subjectCounts.reduce(
          (sum, item) => sum + item.withExplanation,
          0,
        ),
        withoutExplanation: subjectCounts.reduce(
          (sum, item) => sum + item.withoutExplanation,
          0,
        ),
      },
    ]);
    console.log(`Showing ${questions.length} questions without an explanation.`);
    if (questions.length < missingCount) {
      console.log("Pass --all to print every missing question.");
    }
    console.table(
      questions.map((question) => ({
        id: String(question._id),
        source: question.source ?? "",
        sourceId: question.sourceId ?? "",
        subject: question.subject ?? "",
        examType: question.examType ?? "",
        year: question.year ?? "",
        questionNumber: question.questionNumber ?? question.number ?? "",
        question: (
          question.question ||
          question.questionText ||
          question.text ||
          ""
        ).replace(/\s+/g, " ").slice(0, 160),
      })),
    );
  } finally {
    if (connected) {
      await mongoose.disconnect();
    }
  }
}

main().catch((error) => {
  console.error(`Question explanation check failed: ${error.message}`);
  process.exitCode = 1;
});
