import "dotenv/config";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import Question from "./model/Question.js";

/* =========================================================
   CONFIGURATION
========================================================= */

const MONGO_URI = process.env.DATA_BASE;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

/*
  Number of questions sent to Gemini at once.
  Keep this at 7 for reliability.
*/
const BATCH_SIZE = Number(
  process.env.BATCH_SIZE || 7
);

const QUESTION_DELAY = Number(
  process.env.QUESTION_DELAY || 2000
);

const MAX_RETRIES = Number(
  process.env.MAX_RETRIES || 3
);

const MIN_BATCH_SIZE = 1;

/*
  Only process questions from ALOC.
*/
const QUESTION_SOURCE = "ALOC";

/*
  JAMB only.
*/
const EXAM_TYPE = "jamb";

/* =========================================================
   SUBJECTS
========================================================= */

const SUBJECTS = [
  // "commerce",
  //  "physics",
   "mathematics",
    "geography",
 
  "government",
  "accounting",
  "literature-in-english",
  "christian-religious-studies",
  "economics",
 
 
  "computer-studies",
  "marketing",
  "history",
  "insurance",
];

/* =========================================================
   GEMINI CLIENT
========================================================= */

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

/* =========================================================
   CUSTOM ERROR
========================================================= */

class BatchGenerationError extends Error {
  constructor(
    message,
    {
      retryable = true,
      rateLimited = false,
      jsonValidation = false,
    } = {}
  ) {
    super(message);

    this.name = "BatchGenerationError";
    this.retryable = retryable;
    this.rateLimited = rateLimited;
    this.jsonValidation = jsonValidation;
  }
}

/* =========================================================
   SLEEP
========================================================= */

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/* =========================================================
   CLEAN TEXT
========================================================= */

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/* =========================================================
   SUBJECT REGEX
========================================================= */

function subjectToRegex(subject) {
  const words = subject
    .split("-")
    .map((word) =>
      word.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )
    );

  return new RegExp(
    "^" +
      words.join("[ -]+") +
      "$",
    "i"
  );
}

/* =========================================================
   QUESTION TEXT
========================================================= */

function getQuestionText(question) {
  return cleanText(
    question.question ||
      question.questionText ||
      question.text ||
      question.rawData?.question ||
      question.rawData?.questionText ||
      ""
  );
}

/* =========================================================
   OPTIONS
========================================================= */

function getOptions(question) {
  /*
    Array format:
    [
      "Option one",
      "Option two",
      ...
    ]
  */

  if (Array.isArray(question.options)) {
    return question.options
      .map((option, index) => {
        const letter =
          String.fromCharCode(65 + index);

        if (
          typeof option === "string"
        ) {
          return `${letter}. ${option}`;
        }

        if (
          option &&
          typeof option === "object"
        ) {
          return `${letter}. ${
            option.text ||
            option.value ||
            option.label ||
            ""
          }`;
        }

        return `${letter}. ${String(
          option ?? ""
        )}`;
      })
      .join("\n");
  }

  /*
    Object format:
    {
      A: "...",
      B: "...",
      C: "..."
    }
  */

  if (
    question.options &&
    typeof question.options === "object" &&
    !Array.isArray(question.options)
  ) {
    return Object.entries(
      question.options
    )
      .map(([key, value]) => {
        if (
          value &&
          typeof value === "object"
        ) {
          return `${key}. ${
            value.text ||
            value.value ||
            value.label ||
            ""
          }`;
        }

        return `${key}. ${value}`;
      })
      .join("\n");
  }

  /*
    Individual option fields.
  */

  const options = [
    [
      "A",
      question.optionA ||
        question.optionsA ||
        question.a,
    ],

    [
      "B",
      question.optionB ||
        question.optionsB ||
        question.b,
    ],

    [
      "C",
      question.optionC ||
        question.optionsC ||
        question.c,
    ],

    [
      "D",
      question.optionD ||
        question.optionsD ||
        question.d,
    ],

    [
      "E",
      question.optionE ||
        question.optionsE ||
        question.e,
    ],
  ];

  return options
    .filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        cleanText(value) !== ""
    )
    .map(
      ([letter, value]) =>
        `${letter}. ${value}`
    )
    .join("\n");
}

/* =========================================================
   ANSWER
========================================================= */

function getAnswer(question) {
  return cleanText(
    question.answer ||
      question.correctAnswer ||
      question.rawData?.correctAnswer ||
      question.rawData?.answer ||
      ""
  );
}

/* =========================================================
   YEAR
========================================================= */

function getYear(question) {
  return cleanText(
    question.year ||
      question.examYear ||
      question.rawData?.year ||
      ""
  );
}

/* =========================================================
   BUILD BATCH PROMPT
========================================================= */

function buildBatchPrompt(
  questions,
  subject
) {
  let prompt = `
You are an expert Nigerian examination tutor.

You are generating high-quality explanations for
JAMB past examination questions.

SUBJECT:
${subject}

EXAMINATION:
JAMB

SOURCE:
ALOC

You have received exactly ${
    questions.length
  } questions.

YOU MUST PROCESS EVERY QUESTION.

For EVERY question:

1. Read the complete question carefully.
2. Read every available option.
3. Examine the supplied answer.
4. Independently verify the answer.
5. Explain why the correct answer is correct.
6. Explain the important reason the other options are wrong.
7. Provide a detailed explanation.
8. Provide a simplified explanation for a student.
9. Identify common mistakes students may make.
10. Return the exact questionId provided.

==================================================
VERY IMPORTANT RULES
==================================================

- Never change questionId.
- Never invent questionId.
- Never omit a question.
- Never combine questions.
- One input question must produce exactly one result.
- Return exactly ${
    questions.length
  } result objects.
- Do not return Markdown.
- HTML is allowed only inside the explanation fields.
- Do not use <script>.
- Do not use <style>.
- Do not use iframe.
- Do not use JavaScript.
- Do not use external links.
- Do not create fake references.
- sourceType must be "AI".
- solutionImageUrl must be null.
- confidence must be between 0 and 1.
- commonMistakes must always be an array.
- needsReview must be true when the supplied answer
  appears wrong, ambiguous, or cannot be confidently verified.

==================================================
HTML RULES
==================================================

Use clean HTML such as:

<p>...</p>
<strong>...</strong>
<h3>...</h3>
<ul>
<li>...</li>
</ul>
<ol>
<li>...</li>
</ol>

Do not use Markdown.

==================================================
ANSWER RULE
==================================================

The supplied answer is a clue, not absolute truth.

You must independently reason through the question.

If the supplied answer appears incorrect:

- Do not silently pretend it is correct.
- Set needsReview to true.
- Explain the academically correct answer.
- Mention that the supplied answer requires review.

==================================================
QUESTION DATA
==================================================
`;

  questions.forEach(
    (question, index) => {
      prompt += `

========================================
QUESTION ${index + 1}
========================================

questionId:
${cleanText(question.sourceId)}

subject:
${cleanText(question.subject)}

examType:
${cleanText(question.examType)}

year:
${getYear(question)}

QUESTION:
${getQuestionText(question)}

OPTIONS:
${getOptions(question)}

SUPPLIED ANSWER:
${getAnswer(question)}
`;
    }
  );

  prompt += `

==================================================
FINAL INSTRUCTION
==================================================

You received exactly ${
    questions.length
  } questions.

You MUST return exactly ${
    questions.length
  } explanation objects.

The questionId of every returned object MUST
exactly match the questionId supplied above.

Return ONLY valid JSON matching the schema.
`;

  return prompt;
}

/* =========================================================
   GEMINI RESPONSE SCHEMA
========================================================= */

const responseSchema = {
  type: "object",

  properties: {
    explanations: {
      type: "array",

      items: {
        type: "object",

        properties: {
          questionId: {
            type: "string",
          },

          explanation: {
            type: "string",
          },

          simplifiedExplanation: {
            type: "string",
          },

          commonMistakes: {
            type: "array",

            items: {
              type: "object",

              properties: {
                mistake: {
                  type: "string",
                },

                whyWrong: {
                  type: "string",
                },
              },

              required: [
                "mistake",
                "whyWrong",
              ],
            },
          },

          solutionImageUrl: {
            type: "string",
            nullable: true,
          },

          sourceType: {
            type: "string",
          },

          confidence: {
            type: "number",
          },

          needsReview: {
            type: "boolean",
          },
        },

        required: [
          "questionId",
          "explanation",
          "simplifiedExplanation",
          "commonMistakes",
          "solutionImageUrl",
          "sourceType",
          "confidence",
          "needsReview",
        ],
      },
    },
  },

  required: [
    "explanations",
  ],
};

/* =========================================================
   EXTRACT GEMINI TEXT
========================================================= */

function extractGeminiText(response) {
  /*
    Current @google/genai normally exposes:
      response.text
  */

  if (
    typeof response?.text ===
    "string"
  ) {
    return response.text.trim();
  }

  /*
    Fallback for candidate format.
  */

  const parts =
    response?.candidates?.[0]
      ?.content?.parts;

  if (Array.isArray(parts)) {
    return parts
      .map((part) => part?.text || "")
      .join("")
      .trim();
  }

  return "";
}

/* =========================================================
   REMOVE JSON FENCES
========================================================= */

function cleanJsonResponse(text) {
  let value = cleanText(text);

  if (!value) {
    return "";
  }

  /*
    Remove ```json ... ```
  */

  if (
    value.startsWith("```") &&
    value.endsWith("```")
  ) {
    value = value
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  return value;
}

/* =========================================================
   DETECT RATE LIMIT
========================================================= */

function isRateLimitError(error) {
  const message =
    cleanText(
      error?.message ||
        error?.status ||
        error
    ).toLowerCase();

  return (
    message.includes(
      "resource exhausted"
    ) ||
    message.includes(
      "rate limit"
    ) ||
    message.includes(
      "too many requests"
    ) ||
    message.includes(
      "quota"
    ) ||
    message.includes(
      "429"
    ) ||
    message.includes(
      "limit exceeded"
    )
  );
}

/* =========================================================
   RATE LIMIT DELAY
========================================================= */

function getRetryDelay(attempt) {
  /*
    Exponential backoff.

    Attempt 1:
      5 seconds

    Attempt 2:
      10 seconds

    Attempt 3:
      20 seconds
  */

  return (
    5000 *
    Math.pow(
      2,
      attempt - 1
    )
  );
}

/* =========================================================
   GENERATE GEMINI BATCH
========================================================= */

async function generateBatchExplanations(
  questions,
  subject
) {
  const prompt =
    buildBatchPrompt(
      questions,
      subject
    );

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `\n🤖 Gemini request`
      );

      console.log(
        `   Model: ${GEMINI_MODEL}`
      );

      console.log(
        `   Questions: ${questions.length}`
      );

      console.log(
        `   Attempt: ${attempt}/${MAX_RETRIES}`
      );

      const response =
        await ai.models.generateContent(
          {
            model: GEMINI_MODEL,

            contents: [
              {
                role: "user",

                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],

            config: {
              temperature: 0.2,

              responseMimeType:
                "application/json",

              responseSchema:
                responseSchema,
            },
          }
        );

      const rawText =
        extractGeminiText(
          response
        );

      if (!rawText) {
        throw new BatchGenerationError(
          "Gemini returned an empty response.",
          {
            retryable: true,
          }
        );
      }

      console.log(
        `📥 Gemini response received`
      );

      const cleaned =
        cleanJsonResponse(
          rawText
        );

      let parsed;

      try {
        parsed =
          JSON.parse(cleaned);
      } catch (jsonError) {
        throw new BatchGenerationError(
          `Gemini returned invalid JSON: ${jsonError.message}`,
          {
            retryable: true,
            jsonValidation: true,
          }
        );
      }

      if (
        !parsed ||
        !Array.isArray(
          parsed.explanations
        )
      ) {
        throw new BatchGenerationError(
          "Gemini response does not contain an explanations array.",
          {
            retryable: true,
            jsonValidation: true,
          }
        );
      }

      if (
        parsed.explanations.length !==
        questions.length
      ) {
        throw new BatchGenerationError(
          `Gemini returned ${parsed.explanations.length} explanations for ${questions.length} questions.`,
          {
            retryable: true,
            jsonValidation: true,
          }
        );
      }

      return parsed.explanations;
    } catch (error) {
      lastError = error;

      const rateLimited =
        isRateLimitError(
          error
        );

      console.error(
        `\n❌ Gemini attempt ${attempt} failed`
      );

      console.error(
        error?.message ||
          error
      );

      if (
        rateLimited
      ) {
        console.error(
          "🚦 Gemini rate limit/quota detected."
        );

        if (
          attempt <
          MAX_RETRIES
        ) {
          const delay =
            getRetryDelay(
              attempt
            );

          console.log(
            `⏳ Waiting ${delay / 1000}s before retry...`
          );

          await sleep(
            delay
          );

          continue;
        }

        throw new BatchGenerationError(
          error?.message ||
            "Gemini rate limit exceeded.",
          {
            retryable: false,
            rateLimited: true,
          }
        );
      }

      if (
        attempt <
        MAX_RETRIES
      ) {
        const delay =
          3000 *
          attempt;

        console.log(
          `⏳ Retrying in ${delay / 1000}s...`
        );

        await sleep(
          delay
        );

        continue;
      }
    }
  }

  throw new BatchGenerationError(
    lastError?.message ||
      "Gemini batch generation failed.",
    {
      retryable: true,
    }
  );
}

/* =========================================================
   VALIDATE SINGLE RESULT
========================================================= */

function validateSingleResult(
  question,
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw new Error(
      `Invalid result for ${question.sourceId}`
    );
  }

  /*
    Question ID must match exactly.
  */

  if (
    cleanText(
      result.questionId
    ) !==
    cleanText(
      question.sourceId
    )
  ) {
    throw new Error(
      `Question ID mismatch. Expected ${question.sourceId}, received ${result.questionId}`
    );
  }

  /*
    Required explanation.
  */

  if (
    !cleanText(
      result.explanation
    )
  ) {
    throw new Error(
      `Missing explanation for ${question.sourceId}`
    );
  }

  /*
    Required simplified explanation.
  */

  if (
    !cleanText(
      result.simplifiedExplanation
    )
  ) {
    throw new Error(
      `Missing simplifiedExplanation for ${question.sourceId}`
    );
  }

  /*
    commonMistakes must be array.
  */

  if (
    !Array.isArray(
      result.commonMistakes
    )
  ) {
    throw new Error(
      `commonMistakes is not an array for ${question.sourceId}`
    );
  }

  /*
    sourceType.
  */

  if (
    cleanText(
      result.sourceType
    ).toUpperCase() !==
    "AI"
  ) {
    throw new Error(
      `Invalid sourceType for ${question.sourceId}`
    );
  }

  /*
    Confidence.
  */

  const confidence =
    Number(
      result.confidence
    );

  if (
    Number.isNaN(
      confidence
    ) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error(
      `Invalid confidence for ${question.sourceId}`
    );
  }

  /*
    needsReview must be boolean.
  */

  if (
    typeof result.needsReview !==
    "boolean"
  ) {
    throw new Error(
      `Invalid needsReview for ${question.sourceId}`
    );
  }

  return true;
}

/* =========================================================
   VALIDATE ENTIRE BATCH
========================================================= */

function validateBatchResults(
  questions,
  results
) {
  if (
    !Array.isArray(
      results
    )
  ) {
    throw new Error(
      "Gemini results are not an array."
    );
  }

  if (
    results.length !==
    questions.length
  ) {
    throw new Error(
      `Expected ${questions.length} results but received ${results.length}.`
    );
  }

  /*
    Detect duplicate IDs.
  */

  const ids =
    results.map(
      (item) =>
        cleanText(
          item.questionId
        )
    );

  const duplicates =
    ids.filter(
      (id, index) =>
        ids.indexOf(id) !==
        index
    );

  if (
    duplicates.length > 0
  ) {
    throw new Error(
      `Duplicate questionId returned: ${[
        ...new Set(
          duplicates
        ),
      ].join(", ")}`
    );
  }

  /*
    Validate every result
    against the exact input question.
  */

  for (
    const question of questions
  ) {
    const result =
      results.find(
        (item) =>
          cleanText(
            item.questionId
          ) ===
          cleanText(
            question.sourceId
          )
      );

    if (!result) {
      throw new Error(
        `Gemini did not return an explanation for ${question.sourceId}`
      );
    }

    validateSingleResult(
      question,
      result
    );
  }

  return true;
}

/* =========================================================
   NORMALIZE EXPLANATION BEFORE SAVING
========================================================= */

function normalizeExplanation(
  result
) {
  return {
    explanation:
      cleanText(
        result.explanation
      ),

    simplifiedExplanation:
      cleanText(
        result.simplifiedExplanation
      ),

    commonMistakes:
      Array.isArray(
        result.commonMistakes
      )
        ? result.commonMistakes.map(
            (item) => ({
              mistake:
                cleanText(
                  item?.mistake
                ),

              whyWrong:
                cleanText(
                  item?.whyWrong
                ),
            })
          )
        : [],

    solutionImageUrl:
      result.solutionImageUrl ??
      null,

    sourceType:
      "AI",

    confidence:
      Math.max(
        0,
        Math.min(
          1,
          Number(
            result.confidence
          )
        )
      ),

    needsReview:
      Boolean(
        result.needsReview
      ),
  };
}

/* =========================================================
   SAVE BATCH
========================================================= */

async function saveBatch(
  questions,
  results
) {
  let saved = 0;

  for (
    const question of questions
  ) {
    const result =
      results.find(
        (item) =>
          cleanText(
            item.questionId
          ) ===
          cleanText(
            question.sourceId
          )
      );

    if (!result) {
      throw new Error(
        `Cannot save ${question.sourceId}: explanation not found.`
      );
    }

    const explanation =
      normalizeExplanation(
        result
      );

    await Question.updateOne(
      {
        _id: question._id,
      },

      {
        $set: {
          explanation:
            explanation,
        },
      }
    );

    saved++;

    console.log(
      `   💾 Saved ${saved}/${questions.length}: ${question.sourceId}`
    );
  }

  return saved;
}

/* =========================================================
   BUILD INCOMPLETE QUERY
========================================================= */

function buildIncompleteQuery(
  subjectSlug
) {
  const subjectRegex =
    subjectToRegex(
      subjectSlug
    );

  return {
    source: QUESTION_SOURCE,

    examType:
      new RegExp(
        `^${EXAM_TYPE}$`,
        "i"
      ),

    subject:
      subjectRegex,

    $or: [
      {
        "explanation.explanation":
          {
            $exists: false,
          },
      },

      {
        "explanation.explanation":
          "",
      },

      {
        "explanation.simplifiedExplanation":
          {
            $exists: false,
          },
      },

      {
        "explanation.simplifiedExplanation":
          "",
      },
    ],
  };
}

/* =========================================================
   GET QUESTIONS
========================================================= */

async function getQuestionsForSubject(
  subjectSlug,
  limit
) {
  const query =
    buildIncompleteQuery(
      subjectSlug
    );

  return Question.find(
    query
  )
    .sort({
      _id: 1,
    })
    .limit(limit)
    .lean();
}

/* =========================================================
   COUNT REMAINING
========================================================= */

async function countRemaining(
  subjectSlug
) {
  const query =
    buildIncompleteQuery(
      subjectSlug
    );

  return Question.countDocuments(
    query
  );
}

/* =========================================================
   SPLIT BATCH
========================================================= */

function splitBatch(
  questions
) {
  if (
    questions.length <=
    MIN_BATCH_SIZE
  ) {
    return [
      questions,
    ];
  }

  const middle =
    Math.ceil(
      questions.length / 2
    );

  return [
    questions.slice(
      0,
      middle
    ),

    questions.slice(
      middle
    ),
  ].filter(
    (batch) =>
      batch.length > 0
  );
}

/* =========================================================
   PROCESS AI BATCH
========================================================= */

async function processAIbatch(
  questions,
  subjectSlug,
  batchLabel = ""
) {
  if (
    !questions ||
    questions.length === 0
  ) {
    return 0;
  }

  console.log(
    `\n========================================`
  );

  console.log(
    `🤖 AI BATCH ${batchLabel}`
  );

  console.log(
    `📚 Subject: ${subjectSlug}`
  );

  console.log(
    `📦 Questions: ${questions.length}`
  );

  console.log(
    `========================================`
  );

  questions.forEach(
    (question, index) => {
      console.log(
        `   ${index + 1}. ${question.sourceId}`
      );
    }
  );

  /*
    TRY NORMAL BATCH
  */

  try {
    const results =
      await generateBatchExplanations(
        questions,
        subjectSlug
      );

    console.log(
      `📥 Received ${results.length} explanations`
    );

    /*
      NEVER SAVE PARTIAL DATA.
      Validate the entire batch first.
    */

    validateBatchResults(
      questions,
      results
    );

    console.log(
      "✅ Batch validation passed"
    );

    /*
      Save only after validation.
    */

    const saved =
      await saveBatch(
        questions,
        results
      );

    console.log(
      `\n✅ Batch saved: ${saved}/${questions.length}`
    );

    return saved;
  } catch (error) {
    console.error(
      `\n⚠️ Batch failed`
    );

    console.error(
      `   Questions: ${questions.length}`
    );

    console.error(
      `   Error: ${
        error?.message ||
        error
      }`
    );

    /*
      Rate limit should not be split immediately.

      If Gemini says quota/rate limit,
      throwing allows the subject/main flow
      to stop safely.
    */

    if (
      error?.rateLimited === true
    ) {
      throw error;
    }

    /*
      If only one question remains,
      it cannot be split further.
    */

    if (
      questions.length <=
      MIN_BATCH_SIZE
    ) {
      console.error(
        `❌ Single question failed: ${questions[0]?.sourceId}`
      );

      throw error;
    }

    /*
      Split failed batch.
    */

    console.log(
      `\n✂️ Splitting ${questions.length} questions...`
    );

    const smallerBatches =
      splitBatch(
        questions
      );

    let totalSaved = 0;

    for (
      let i = 0;
      i <
      smallerBatches.length;
      i++
    ) {
      const smallerBatch =
        smallerBatches[i];

      console.log(
        `\n📦 Sub-batch ${
          i + 1
        }/${smallerBatches.length}`
      );

      console.log(
        `   Size: ${smallerBatch.length}`
      );

      const saved =
        await processAIbatch(
          smallerBatch,
          subjectSlug,
          `${batchLabel}.${i + 1}`
        );

      totalSaved +=
        saved;

      /*
        Delay between sub-batches.
      */

      if (
        i <
        smallerBatches.length - 1
      ) {
        await sleep(
          QUESTION_DELAY
        );
      }
    }

    return totalSaved;
  }
}

/* =========================================================
   PROCESS ONE SUBJECT
========================================================= */

async function processSubject(
  subjectSlug,
  subjectNumber,
  totalSubjects
) {
  console.log(
    "\n\n========================================"
  );

  console.log(
    `📚 SUBJECT ${subjectNumber}/${totalSubjects}`
  );

  console.log(
    `📖 ${subjectSlug}`
  );

  console.log(
    "========================================"
  );

  let batchNumber = 0;
  let totalSaved = 0;

  while (true) {
    /*
      Count remaining questions.
    */

    const remaining =
      await countRemaining(
        subjectSlug
      );

    console.log(
      `\n📊 ${subjectSlug}`
    );

    console.log(
      `   Remaining: ${remaining}`
    );

    /*
      Subject finished.
    */

    if (
      remaining === 0
    ) {
      console.log(
        `\n🎉 ${subjectSlug.toUpperCase()} FINISHED`
      );

      console.log(
        `💾 Saved this subject: ${totalSaved}`
      );

      break;
    }

    /*
      Get questions.
    */

    const questions =
      await getQuestionsForSubject(
        subjectSlug,
        BATCH_SIZE
      );

    /*
      Nothing returned.
    */

    if (
      questions.length === 0
    ) {
      console.log(
        `\n⚠️ MongoDB returned no questions.`
      );

      console.log(
        `⚠️ MongoDB count still says ${remaining} remaining.`
      );

      console.log(
        "🛑 Stopping this subject to avoid an infinite loop."
      );

      break;
    }

    /*
      Diagnostic warning.
    */

    if (
      questions.length <
        BATCH_SIZE &&
      remaining >
        questions.length
    ) {
      console.log(
        "\n⚠️ DATABASE BATCH WARNING"
      );

      console.log(
        `   MongoDB remaining: ${remaining}`
      );

      console.log(
        `   Returned: ${questions.length}`
      );

      console.log(
        `   Requested: ${BATCH_SIZE}`
      );

      /*
        Do not stop.
        Process what MongoDB returned.
      */
    }

    batchNumber++;

    console.log(
      `\n🚀 Starting batch ${batchNumber}`
    );

    console.log(
      `📦 Sending ${questions.length} questions to Gemini`
    );

    /*
      Process batch.
    */

    const saved =
      await processAIbatch(
        questions,
        subjectSlug,
        String(batchNumber)
      );

    totalSaved +=
      saved;

    console.log(
      `\n💾 Batch ${batchNumber} complete`
    );

    console.log(
      `   Saved: ${saved}/${questions.length}`
    );

    console.log(
      `   Total subject saved: ${totalSaved}`
    );

    /*
      Check remaining again.
    */

    const newRemaining =
      await countRemaining(
        subjectSlug
      );

    console.log(
      `   Remaining: ${newRemaining}`
    );

    /*
      Wait before next request.
    */

    if (
      newRemaining > 0
    ) {
      console.log(
        `\n⏳ Waiting ${
          QUESTION_DELAY / 1000
        } seconds...`
      );

      await sleep(
        QUESTION_DELAY
      );
    }
  }
}

/* =========================================================
   DATABASE CONNECTION
========================================================= */

async function connectDatabase() {
  if (!MONGO_URI) {
    throw new Error(
      "DATA_BASE is missing from .env"
    );
  }

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

/* =========================================================
   CHECK CONFIGURATION
========================================================= */

function validateConfiguration() {
  console.log(
    "\n🔎 Checking configuration..."
  );

  if (!MONGO_URI) {
    throw new Error(
      "DATA_BASE is missing from .env"
    );
  }

  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing from .env"
    );
  }

  if (!GEMINI_MODEL) {
    throw new Error(
      "GEMINI_MODEL is missing."
    );
  }

  if (
    !Number.isInteger(
      BATCH_SIZE
    ) ||
    BATCH_SIZE < 1
  ) {
    throw new Error(
      "BATCH_SIZE must be a positive integer."
    );
  }

  if (
    !Number.isInteger(
      MAX_RETRIES
    ) ||
    MAX_RETRIES < 1
  ) {
    throw new Error(
      "MAX_RETRIES must be a positive integer."
    );
  }

  console.log(
    "✅ Configuration valid"
  );
}

/* =========================================================
   CHECK DUPLICATE SUBJECTS
========================================================= */

function checkDuplicateSubjects() {
  const duplicates =
    SUBJECTS.filter(
      (subject, index) =>
        SUBJECTS.indexOf(
          subject
        ) !== index
    );

  if (
    duplicates.length > 0
  ) {
    throw new Error(
      `Duplicate subjects found: ${[
        ...new Set(
          duplicates
        ),
      ].join(", ")}`
    );
  }
}

/* =========================================================
   PRINT CONFIGURATION
========================================================= */

function printConfiguration() {
  console.log(
    "\n========================================"
  );

  console.log(
    "CONFIGURATION"
  );

  console.log(
    "========================================"
  );

  console.log(
    `🤖 Gemini model: ${GEMINI_MODEL}`
  );

  console.log(
    `📦 Batch size: ${BATCH_SIZE}`
  );

  console.log(
    `⏳ Question delay: ${
      QUESTION_DELAY / 1000
    } seconds`
  );

  console.log(
    `🔁 Max retries: ${MAX_RETRIES}`
  );

  console.log(
    `📚 Source: ${QUESTION_SOURCE}`
  );

  console.log(
    `📝 Exam type: ${EXAM_TYPE}`
  );

  console.log(
    `📚 Subjects: ${SUBJECTS.length}`
  );

  console.log(
    "========================================"
  );
}

/* =========================================================
   PRINT SUBJECT ORDER
========================================================= */

function printSubjectOrder() {
  console.log(
    "\n📚 SUBJECT PROCESSING ORDER:"
  );

  SUBJECTS.forEach(
    (subject, index) => {
      console.log(
        `${index + 1}. ${subject}`
      );
    }
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  console.log(
    "\n========================================"
  );

  console.log(
    "🚀 ABANISE GEMINI EXPLANATION GENERATOR"
  );

  console.log(
    "========================================"
  );

  try {
    /*
      Validate environment.
    */

    validateConfiguration();

    /*
      Validate subjects.
    */

    checkDuplicateSubjects();

    /*
      Print configuration.
    */

    printConfiguration();

    /*
      Print order.
    */

    printSubjectOrder();

    /*
      Connect database.
    */

    await connectDatabase();

    /*
      Process subjects sequentially.

      Subject 1 completely finishes
      before subject 2 begins.
    */

    for (
      let i = 0;
      i < SUBJECTS.length;
      i++
    ) {
      const subject =
        SUBJECTS[i];

      try {
        await processSubject(
          subject,
          i + 1,
          SUBJECTS.length
        );
      } catch (error) {
        console.error(
          "\n========================================"
        );

        console.error(
          "❌ SUBJECT ERROR"
        );

        console.error(
          "========================================"
        );

        console.error(
          `Subject: ${subject}`
        );

        console.error(
          error?.message ||
            error
        );

        /*
          Stop on serious errors.

          Already saved MongoDB documents
          remain saved.
        */

        console.error(
          "\n🛑 Processing stopped."
        );

        break;
      }
    }

    console.log(
      "\n========================================"
    );

    console.log(
      "🏁 PROCESSING FINISHED"
    );

    console.log(
      "========================================"
    );
  } catch (error) {
    console.error(
      "\n========================================"
    );

    console.error(
      "❌ FATAL ERROR"
    );

    console.error(
      "========================================"
    );

    console.error(
      error?.message ||
        error
    );

    if (
      error?.stack
    ) {
      console.error(
        error.stack
      );
    }
  } finally {
    /*
      Always disconnect MongoDB.
    */

    try {
      if (
        mongoose.connection.readyState !==
        0
      ) {
        await mongoose.disconnect();

        console.log(
          "\n🔌 MongoDB disconnected"
        );
      }
    } catch (disconnectError) {
      console.error(
        "MongoDB disconnect error:",
        disconnectError?.message ||
          disconnectError
      );
    }
  }
}

/* =========================================================
   START APPLICATION
========================================================= */

main();