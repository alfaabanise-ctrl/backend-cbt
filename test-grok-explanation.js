import "dotenv/config";
import mongoose from "mongoose";
import Groq from "groq-sdk";
import Question from "./model/Question.js";

/* =========================================================
   CONFIGURATION
========================================================= */

const MONGO_URI = process.env.DATA_BASE;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-20b";

/*
  Keep this at 7 for reliability.

  If Groq consistently handles 7 correctly,
  you can later increase it.
*/
const BATCH_SIZE = 7;

const QUESTION_DELAY =
  Number(process.env.QUESTION_DELAY || 2000);

const MAX_RETRIES =
  Number(process.env.MAX_RETRIES || 3);

/*
  When a batch fails, we split it into smaller
  batches automatically.

  Example:

  7
  ↓
  3 + 4
  ↓
  1 + 2 + 2 + 2
  ↓
  individual questions if necessary
*/
const MIN_BATCH_SIZE = 1;

/* =========================================================
   SUBJECTS
========================================================= */

/*
  YOU CONTROL THE ORDER HERE.

  The script completely finishes one subject
  before moving to the next subject.

  IMPORTANT:
  commerce was duplicated in your previous list.
  It has been removed.
*/

const SUBJECTS = [
  "commerce",
  "accounting",
  "literature-in-english",
  "christian-religious-studies",
  "economics",
  "geography",
  "mathematics",
  "physics",
  "government",
  "computer-studies",
  "marketing",
  "history",
  "insurance",
];

/* =========================================================
   GROQ CLIENT
========================================================= */

const groq = new Groq({
  apiKey: GROQ_API_KEY,
});

/* =========================================================
   CUSTOM ERRORS
========================================================= */

class BatchGenerationError extends Error {
  constructor(message, options = {}) {
    super(message);

    this.name = "BatchGenerationError";

    this.retryable =
      options.retryable !== false;

    this.rateLimited =
      options.rateLimited === true;

    this.jsonValidation =
      options.jsonValidation === true;
  }
}

/* =========================================================
   HELPERS
========================================================= */

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

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
  return (
    question.question ||
    question.questionText ||
    question.text ||
    question.rawData?.question ||
    ""
  );
}

/* =========================================================
   OPTIONS
========================================================= */

function getOptions(question) {
  if (Array.isArray(question.options)) {
    return question.options
      .map((option, index) => {
        const letter =
          String.fromCharCode(65 + index);

        if (typeof option === "string") {
          return `${letter}. ${option}`;
        }

        return `${letter}. ${
          option.text ||
          option.value ||
          option.label ||
          ""
        }`;
      })
      .join("\n");
  }

  if (
    question.options &&
    typeof question.options === "object"
  ) {
    return Object.entries(
      question.options
    )
      .map(
        ([key, value]) =>
          `${key}. ${value}`
      )
      .join("\n");
  }

  return [
    question.optionA
      ? `A. ${question.optionA}`
      : "",

    question.optionB
      ? `B. ${question.optionB}`
      : "",

    question.optionC
      ? `C. ${question.optionC}`
      : "",

    question.optionD
      ? `D. ${question.optionD}`
      : "",

    question.optionE
      ? `E. ${question.optionE}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* =========================================================
   ANSWER
========================================================= */

function getAnswer(question) {
  return (
    question.answer ||
    question.correctAnswer ||
    question.rawData?.correctAnswer ||
    ""
  );
}

/* =========================================================
   BUILD PROMPT
========================================================= */

function buildBatchPrompt(
  questions,
  subject
) {
  let prompt = `
You are an expert Nigerian examination tutor.

You are generating explanations for JAMB
past questions.

SUBJECT:
${subject}

You are receiving ${questions.length} questions
in this request.

YOU MUST PROCESS EVERY QUESTION.

For EVERY question:

1. Carefully read the question.
2. Read every option.
3. Examine the supplied answer.
4. Independently verify whether the supplied answer
   is academically correct.
5. Explain why the correct answer is correct.
6. Explain why the other options are wrong when useful.
7. Create a detailed HTML explanation.
8. Create a simple HTML explanation.
9. Identify common mistakes.
10. Return the EXACT questionId supplied.

IMPORTANT RULES:

- Never change questionId.
- Never invent a questionId.
- Never omit a question.
- Never combine two questions.
- One questionId = one explanation.
- Do not return Markdown.
- Return HTML inside the HTML fields.
- Do not use Markdown syntax.
- Do not use <script>.
- Do not use <style>.
- Do not use iframe.
- Do not use JavaScript.
- Do not use external links.
- sourceType must be "AI".
- confidence must be between 0 and 1.
- solutionImageUrl must be null.

If the supplied answer is wrong, ambiguous,
or cannot be confidently verified:

- Set needsReview to true.
- Do NOT silently change the supplied answer.
- Explain the academically correct answer.

HTML may contain:

<p>...</p>
<strong>...</strong>
<h3>...</h3>

<ul>
<li>...</li>
</ul>

<ol>
<li>...</li>
</ol>

HTML must be clean and safe for rendering
inside a Nuxt/Vue application.

QUESTIONS:
`;

  questions.forEach(
    (question, index) => {
      prompt += `

========================================
QUESTION ${index + 1}
========================================

questionId:
${question.sourceId}

subject:
${question.subject}

examType:
${question.examType}

year:
${question.year || ""}

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

IMPORTANT FINAL INSTRUCTION:

You received exactly ${questions.length} questions.

Return exactly ${questions.length}
result objects.

If ${questions.length} questions are received,
return exactly ${questions.length}
result objects.

The questionId in every result MUST
exactly match the questionId supplied.

Return ONLY the JSON object required
by the schema.
`;

  return prompt;
}

/* =========================================================
   GROQ RESPONSE SCHEMA
========================================================= */

const responseSchema = {
  type: "object",

  additionalProperties: false,

  properties: {
    explanations: {
      type: "array",

      items: {
        type: "object",

        additionalProperties: false,

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

              additionalProperties: false,

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
            type: [
              "string",
              "null",
            ],
          },

          sourceType: {
            type: "string",
          },

          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
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
   GROQ REQUEST
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
        `🤖 Groq request: ${questions.length} questions`
      );

      const response =
        await groq.chat.completions.create({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are an expert Nigerian JAMB examination tutor. Follow the requested JSON schema exactly. Process every supplied question.",
            },

            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.2,

          response_format: {
            type: "json_schema",

            json_schema: {
              name:
                "jamb_explanations",

              strict: true,

              schema:
                responseSchema,
            },
          },
        });

      const content =
        response
          ?.choices?.[0]
          ?.message?.content;

      if (!content) {
        throw new BatchGenerationError(
          "Groq returned an empty response"
        );
      }

      let parsed;

      try {
        parsed =
          JSON.parse(content);
      } catch (parseError) {
        throw new BatchGenerationError(
          `Groq returned invalid JSON: ${parseError.message}`,
          {
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
          "Groq response does not contain explanations array",
          {
            jsonValidation: true,
          }
        );
      }

      /*
        IMPORTANT:

        If Groq returns only part of the batch,
        retry the SAME batch.

        Example:

        Sent 7
        Returned 4

        We retry before splitting.
      */

      if (
        parsed.explanations.length !==
        questions.length
      ) {
        console.log(
          `⚠️ Groq returned ${parsed.explanations.length}/${questions.length}`
        );

        if (
          attempt < MAX_RETRIES
        ) {
          const waitTime =
            attempt * 5000;

          console.log(
            `⏳ Incomplete response. Retrying in ${waitTime / 1000}s...`
          );

          await sleep(
            waitTime
          );

          continue;
        }

        throw new BatchGenerationError(
          `Groq returned ${parsed.explanations.length} explanations but ${questions.length} questions were sent`,
          {
            jsonValidation: false,
          }
        );
      }

      console.log(
        `📥 Groq returned ${parsed.explanations.length} explanations`
      );

      return parsed.explanations;
    } catch (error) {
      lastError = error;

      const message =
        error?.message ||
        String(error);

      console.error(
        `❌ Groq error - attempt ${attempt}/${MAX_RETRIES}`
      );

      console.error(
        message
      );

      /*
        Detect rate limiting.
      */

      const rateLimited =
        error?.status === 429 ||
        message.includes("429") ||
        message
          .toLowerCase()
          .includes("rate limit") ||
        message
          .toLowerCase()
          .includes("too many requests");

      /*
        Detect Groq strict JSON validation failure.
      */

      const jsonValidation =
        message
          .toLowerCase()
          .includes(
            "json_validate_failed"
          ) ||
        message
          .toLowerCase()
          .includes(
            "failed to validate json"
          );

      /*
        RATE LIMIT

        Retry with a longer delay.
      */

      if (rateLimited) {
        if (
          attempt === MAX_RETRIES
        ) {
          throw new BatchGenerationError(
            `Groq rate limit persisted after ${MAX_RETRIES} attempts`,
            {
              retryable: false,
              rateLimited: true,
            }
          );
        }

        const waitTime =
          Math.max(
            attempt * 15000,
            15000
          );

        console.log(
          `⏳ Groq rate limit. Waiting ${waitTime / 1000}s...`
        );

        await sleep(
          waitTime
        );

        continue;
      }

      /*
        JSON VALIDATION ERROR

        Retry first.

        If it still fails after MAX_RETRIES,
        the caller will split the batch.
      */

      if (jsonValidation) {
        if (
          attempt === MAX_RETRIES
        ) {
          throw new BatchGenerationError(
            message,
            {
              retryable: true,
              jsonValidation: true,
            }
          );
        }

        const waitTime =
          attempt * 5000;

        console.log(
          `⏳ JSON validation failed. Retrying in ${waitTime / 1000}s...`
        );

        await sleep(
          waitTime
        );

        continue;
      }

      /*
        OTHER ERRORS
      */

      if (
        attempt === MAX_RETRIES
      ) {
        throw error;
      }

      const waitTime =
        attempt * 5000;

      console.log(
        `⏳ Retrying in ${waitTime / 1000}s...`
      );

      await sleep(
        waitTime
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "Groq request failed"
    )
  );
}

/* =========================================================
   VALIDATE RESULTS
========================================================= */

function validateBatchResults(
  questions,
  results
) {
  const expectedIds =
    new Set(
      questions.map(
        (question) =>
          String(
            question.sourceId
          )
      )
    );

  const returnedIds =
    new Set();

  /*
    SAME NUMBER
  */

  if (
    results.length !==
    questions.length
  ) {
    throw new BatchGenerationError(
      `Groq returned ${results.length} explanations but ${questions.length} questions were sent`
    );
  }

  /*
    CHECK EVERY RESULT
  */

  for (
    const result of results
  ) {
    const id =
      cleanText(
        result.questionId
      );

    /*
      EMPTY ID
    */

    if (!id) {
      throw new BatchGenerationError(
        "Groq returned empty questionId"
      );
    }

    /*
      UNKNOWN ID
    */

    if (
      !expectedIds.has(id)
    ) {
      throw new BatchGenerationError(
        `Groq returned unknown questionId: ${id}`
      );
    }

    /*
      DUPLICATE ID
    */

    if (
      returnedIds.has(id)
    ) {
      throw new BatchGenerationError(
        `Groq returned duplicate questionId: ${id}`
      );
    }

    returnedIds.add(id);

    /*
      EXPLANATION
    */

    if (
      !cleanText(
        result.explanation
      )
    ) {
      throw new BatchGenerationError(
        `Missing explanation for ${id}`
      );
    }

    /*
      SIMPLIFIED
    */

    if (
      !cleanText(
        result.simplifiedExplanation
      )
    ) {
      throw new BatchGenerationError(
        `Missing simplifiedExplanation for ${id}`
      );
    }

    /*
      SOURCE
    */

    if (
      result.sourceType !==
      "AI"
    ) {
      throw new BatchGenerationError(
        `Invalid sourceType for ${id}`
      );
    }

    /*
      COMMON MISTAKES
    */

    if (
      !Array.isArray(
        result.commonMistakes
      )
    ) {
      throw new BatchGenerationError(
        `Invalid commonMistakes for ${id}`
      );
    }

    /*
      CONFIDENCE
    */

    if (
      typeof result.confidence !==
      "number"
    ) {
      throw new BatchGenerationError(
        `Invalid confidence for ${id}`
      );
    }

    if (
      result.confidence < 0 ||
      result.confidence > 1
    ) {
      throw new BatchGenerationError(
        `Invalid confidence value for ${id}`
      );
    }

    /*
      NEEDS REVIEW
    */

    if (
      typeof result.needsReview !==
      "boolean"
    ) {
      throw new BatchGenerationError(
        `Invalid needsReview for ${id}`
      );
    }

    /*
      SOLUTION IMAGE

      Must be null.
    */

    if (
      result.solutionImageUrl !==
        null &&
      typeof result.solutionImageUrl !==
        "string"
    ) {
      throw new BatchGenerationError(
        `Invalid solutionImageUrl for ${id}`
      );
    }
  }

  /*
    MAKE SURE EVERY QUESTION
    WAS RETURNED.
  */

  for (
    const id of expectedIds
  ) {
    if (
      !returnedIds.has(id)
    ) {
      throw new BatchGenerationError(
        `Groq did not return explanation for ${id}`
      );
    }
  }

  return true;
}

/* =========================================================
   SAVE BATCH
========================================================= */

async function saveBatch(
  questions,
  results
) {
  const resultMap =
    new Map();

  for (
    const result of results
  ) {
    resultMap.set(
      String(
        result.questionId
      ),
      result
    );
  }

  let saved = 0;

  /*
    IMPORTANT:

    We validate EVERYTHING before this function
    is called.

    Therefore no partial batch should be saved.
  */

  for (
    const question of questions
  ) {
    const questionId =
      String(
        question.sourceId
      );

    const result =
      resultMap.get(
        questionId
      );

    if (!result) {
      throw new Error(
        `No AI result for ${questionId}`
      );
    }

    /*
      EXACT STRUCTURE SAVED TO MONGODB
    */

    const explanation = {
      questionId:
        question.sourceId,

      explanation:
        result.explanation,

      simplifiedExplanation:
        result.simplifiedExplanation,

      commonMistakes:
        result.commonMistakes,

      solutionImageUrl:
        result.solutionImageUrl,

      sourceType:
        "AI",

      confidence:
        result.confidence,

      needsReview:
        result.needsReview,
    };

    /*
      SAVE ONLY explanation.

      Other question fields remain untouched.
    */

    const update =
      await Question.updateOne(
        {
          _id:
            question._id,
        },

        {
          $set: {
            explanation,
          },
        }
      );

    if (
      update.modifiedCount === 1
    ) {
      saved++;

      console.log(
        `   ✅ Saved ${questionId}`
      );
    } else {
      console.log(
        `   ⚠️ Not modified ${questionId}`
      );
    }
  }

  return saved;
}

/* =========================================================
   BUILD INCOMPLETE QUERY
========================================================= */

/*
  IMPORTANT:

  Both countRemaining() and
  getQuestionsForSubject() use THIS SAME
  function.

  This prevents the count query and fetch query
  from accidentally becoming different.
*/

function buildIncompleteQuery(
  subjectSlug
) {
  const subjectRegex =
    subjectToRegex(
      subjectSlug
    );

  return {
    source: "ALOC",

    examType: "jamb",

    subject:
      subjectRegex,

    $and: [
      {
        $or: [
          {
            "explanation.explanation":
              {
                $exists: false,
              },
          },

          {
            "explanation.explanation":
              null,
          },

          {
            "explanation.explanation":
              "",
          },
        ],
      },

      {
        $or: [
          {
            "explanation.simplifiedExplanation":
              {
                $exists: false,
              },
          },

          {
            "explanation.simplifiedExplanation":
              null,
          },

          {
            "explanation.simplifiedExplanation":
              "",
          },
        ],
      },
    ],
  };
}

/* =========================================================
   GET QUESTIONS FOR SUBJECT
========================================================= */

async function getQuestionsForSubject(
  subjectSlug,
  batchSize = BATCH_SIZE
) {
  const query =
    buildIncompleteQuery(
      subjectSlug
    );

  return await Question
    .find(query)
    .sort({
      _id: 1,
    })
    .limit(batchSize)
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

  return await Question.countDocuments(
    query
  );
}

/* =========================================================
   SPLIT BATCH
========================================================= */

function splitBatch(
  questions
) {
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
   PROCESS ONE AI BATCH
========================================================= */

/*
  THIS IS THE IMPORTANT PART.

  Example:

  7 questions
       ↓
  Groq fails
       ↓
  retry x3
       ↓
  still fails
       ↓
  split
       ↓
  3 questions + 4 questions

  If 3 fails:

  3
  ↓
  1 + 2

  If 2 fails:

  2
  ↓
  1 + 1

  Therefore one bad response cannot stop
  the entire subject.
*/

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
    `\n🤖 Processing AI batch ${batchLabel}`
  );

  console.log(
    `📦 Questions: ${questions.length}`
  );

  for (
    const question of questions
  ) {
    console.log(
      `   → ${question.sourceId}`
    );
  }

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
      `📥 Groq returned ${results.length} explanations`
    );

    /*
      VALIDATE EVERYTHING BEFORE SAVING
    */

    validateBatchResults(
      questions,
      results
    );

    /*
      SAVE ONLY AFTER FULL VALIDATION
    */

    const saved =
      await saveBatch(
        questions,
        results
      );

    console.log(
      `💾 Batch saved: ${saved}/${questions.length}`
    );

    return saved;
  } catch (error) {
    console.error(
      `\n⚠️ Batch failed: ${questions.length} questions`
    );

    console.error(
      error?.message ||
        error
    );

    /*
      RATE LIMIT SHOULD NOT BE
      AGGRESSIVELY SPLIT.

      Splitting would create MORE API requests
      while the API is already rate-limited.
    */

    if (
      error?.rateLimited === true
    ) {
      throw error;
    }

    /*
      IF ONLY ONE QUESTION REMAINS,
      WE CANNOT SPLIT ANY FURTHER.
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
      SPLIT THE BATCH.
    */

    console.log(
      `\n✂️ Splitting ${questions.length} questions into smaller batches...`
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
        `\n📦 Sub-batch ${i + 1}/${smallerBatches.length}: ${smallerBatch.length} questions`
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
        Small delay between
        split batches.
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
      COUNT
    */

    const remaining =
      await countRemaining(
        subjectSlug
      );

    console.log(
      `\n📊 Remaining: ${remaining}`
    );

    /*
      SUBJECT FINISHED
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
      GET UP TO BATCH_SIZE
    */

    const questions =
      await getQuestionsForSubject(
        subjectSlug,
        BATCH_SIZE
      );

    /*
      DATABASE RETURNED NOTHING
    */

    if (
      questions.length === 0
    ) {
      console.log(
        `⚠️ No questions found for ${subjectSlug}`
      );

      console.log(
        `⚠️ MongoDB still reports ${remaining} remaining.`
      );

      console.log(
        "🛑 Stopping this subject to avoid an infinite loop."
      );

      break;
    }

    /*
      IMPORTANT DEBUG CHECK

      If MongoDB says:

      Remaining: 697

      but returns:

      4 questions

      when BATCH_SIZE is 7,

      we show a warning.

      This is useful for detecting
      database/query problems.
    */

    if (
      questions.length <
        BATCH_SIZE &&
      remaining >
        questions.length
    ) {
      console.log(
        `⚠️ DATABASE BATCH WARNING`
      );

      console.log(
        `   MongoDB remaining: ${remaining}`
      );

      console.log(
        `   MongoDB returned: ${questions.length}`
      );

      console.log(
        `   Requested: ${BATCH_SIZE}`
      );

      /*
        We DO NOT stop here.

        The database may legitimately change
        between count and fetch.

        We process what MongoDB actually returned.
      */
    }

    batchNumber++;

    console.log(
      `\n🚀 Batch ${batchNumber}`
    );

    console.log(
      `📦 Sending ${questions.length} questions to Groq`
    );

    /*
      PROCESS BATCH.

      This function automatically retries
      and splits failed batches.
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
      `\n💾 Batch ${batchNumber} complete: ${saved}/${questions.length}`
    );

    /*
      WAIT BEFORE NEXT BATCH
    */

    const newRemaining =
      await countRemaining(
        subjectSlug
      );

    if (
      newRemaining > 0
    ) {
      console.log(
        `⏳ Waiting ${QUESTION_DELAY / 1000}s before next batch...`
      );

      await sleep(
        QUESTION_DELAY
      );
    }
  }
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  console.log(
    "\n========================================"
  );

  console.log(
    "🚀 ABANISE GROQ EXPLANATION GENERATOR"
  );

  console.log(
    "========================================"
  );

  console.log(
    `🤖 Model: ${GROQ_MODEL}`
  );

  console.log(
    `📦 Questions per request: ${BATCH_SIZE}`
  );

  console.log(
    `🔁 Maximum retries: ${MAX_RETRIES}`
  );

  console.log(
    `📚 Subjects: ${SUBJECTS.length}`
  );

  /*
    CHECK CONFIG
  */

  if (!MONGO_URI) {
    throw new Error(
      "DATA_BASE is missing from .env"
    );
  }

  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is missing from .env"
    );
  }

  /*
    CHECK DUPLICATE SUBJECTS
  */

  const duplicateSubjects =
    SUBJECTS.filter(
      (subject, index) =>
        SUBJECTS.indexOf(
          subject
        ) !== index
    );

  if (
    duplicateSubjects.length > 0
  ) {
    throw new Error(
      `Duplicate subjects found: ${[
        ...new Set(
          duplicateSubjects
        ),
      ].join(", ")}`
    );
  }

  /*
    CONNECT MONGODB
  */

  console.log(
    "\n🔌 Connecting to MongoDB..."
  );

  await mongoose.connect(
    MONGO_URI
  );

  console.log(
    "✅ MongoDB connected"
  );

  /*
    SHOW SUBJECT ORDER
  */

  console.log(
    "\n📚 SUBJECT ORDER:"
  );

  SUBJECTS.forEach(
    (subject, index) => {
      console.log(
        `${index + 1}. ${subject}`
      );
    }
  );

  /*
    PROCESS SUBJECTS
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
        "\n❌ ERROR"
      );

      console.error(
        `Subject: ${subject}`
      );

      console.error(
        error?.message ||
          error
      );

      /*
        IMPORTANT:

        We stop on serious errors such as
        persistent rate limits or a single
        question that cannot be generated.

        We DO NOT stop merely because a
        7-question batch returned 4.

        That batch is automatically split.
      */

      console.log(
        "\n🛑 Process stopped because of a serious error."
      );

      console.log(
        "Already saved explanations are safe."
      );

      break;
    }
  }

  /*
    FINISHED
  */

  console.log(
    "\n========================================"
  );

  console.log(
    "🏁 ALL SELECTED SUBJECT PROCESSING FINISHED"
  );

  console.log(
    "========================================"
  );

  await mongoose.disconnect();
}

/* =========================================================
   START
========================================================= */

main().catch(
  async (error) => {
    console.error(
      "\n❌ FATAL ERROR"
    );

    console.error(
      error
    );

    try {
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
);