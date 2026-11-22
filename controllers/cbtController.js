
import crypto from "crypto"
import mongoose from "mongoose"

import CbtAttempt from "../model/CbtAttempt.js"
import CbtPaper from "../model/CbtPaper.js"
import { uploadToCloudinary } from "../utils/upload.js"

const boards = new Set(["WAEC", "NECO", "NABTEB", "JAMB", "Custom"])
const examTypes = new Set(["objective", "practical", "mixed"])

const blockTypes = new Set([
  "heading",
  "paragraph",
  "instruction",
  "image",
  "question",
  "answer",
  "table",
])

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function cleanText(value) {
  return String(value ?? "").trim()
}

function randomCode(length) {
  let code = ""

  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]
  }

  return code
}

function isValidMongoId(id) {
  return mongoose.Types.ObjectId.isValid(id) &&
    String(new mongoose.Types.ObjectId(id)) === String(id)
}

function sendError(res, error) {
  const status = Number(error.statusCode) || 500

  if (status >= 500) {
    console.error("CBT API error:", error)
  }

  return res.status(status).json({
    success: false,
    message: status === 500
      ? "CBT request failed."
      : error.message,
  })
}

// Generate an access code that is unique across all papers.
async function generateUniqueAccessCode(taken = new Set()) {
  for (const length of [4, 5]) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const code = randomCode(length)

      if (taken.has(code)) continue

      const exists = await CbtPaper.exists({
        accesscode: code,
      })

      if (!exists) {
        taken.add(code)
        return code
      }
    }
  }

  const error = new Error(
    "Could not generate a unique access code. Try again."
  )

  error.statusCode = 500
  throw error
}

// Keep an existing paper's access code when updating it.
async function resolveAccessCode(mongoId = null, taken = new Set()) {
  if (mongoId && isValidMongoId(String(mongoId))) {
    const existing = await CbtPaper.findById(mongoId)
      .select("+accesscode")
      .lean()

    if (existing?.accesscode) {
      return existing.accesscode
    }
  }

  return generateUniqueAccessCode(taken)
}

function choiceIndex(value, options = []) {
  const text = cleanText(value)

  const letter = text.match(/^([a-e])(?:[.)]|\s|$)/i)?.[1]?.toLowerCase()

  if (letter) {
    return letter.charCodeAt(0) - 97
  }

  const normalize = (option) =>
    cleanText(option)
      .replace(/^[a-e](?:[.)]|\s)+/i, "")
      .toLowerCase()

  return options.findIndex(
    (option) => normalize(option) === normalize(text)
  )
}

// Normalize imported or submitted paper data.
// Deliberately does not create or return paperId.
function toPaper(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const error = new Error("Each exam paper must be a JSON object.")
    error.statusCode = 400
    throw error
  }

  const name = cleanText(raw.name || raw.subject)

  if (!name) {
    const error = new Error("Exam paper subject name is required.")
    error.statusCode = 400
    throw error
  }

  const sourceSections = Array.isArray(raw.sections)
    ? raw.sections
    : [
        {
          id: "section-a",
          name: "Section A",
          blocks: raw.blocks || [],
        },
      ]

  if (!sourceSections.length) {
    const error = new Error(
      `Exam paper "${name}" must contain at least one section.`
    )

    error.statusCode = 400
    throw error
  }

  const sections = sourceSections.map((section, sectionIndex) => {
    if (
      !section ||
      typeof section !== "object" ||
      Array.isArray(section)
    ) {
      const error = new Error(
        `Section ${sectionIndex + 1} in "${name}" must be an object.`
      )

      error.statusCode = 400
      throw error
    }

    const blocks = Array.isArray(section.blocks)
      ? section.blocks
      : []

    return {
      id: cleanText(section.id) || `section-${sectionIndex + 1}`,

      name:
        cleanText(section.name) ||
        `Section ${String.fromCharCode(65 + sectionIndex)}`,

      blocks: blocks.map((block, blockIndex) => {
        const type = cleanText(block?.type)

        if (
          !block ||
          typeof block !== "object" ||
          Array.isArray(block) ||
          !blockTypes.has(type)
        ) {
          const error = new Error(
            `Invalid block ${blockIndex + 1} in section ${sectionIndex + 1}.`
          )

          error.statusCode = 400
          throw error
        }

        const options = Array.isArray(block.options)
          ? block.options.map(cleanText)
          : undefined

        return {
          id: cleanText(block.id) || `block-${blockIndex + 1}`,

          type,

          questionType:
            block.questionType === "objective" ||
            block.questionType === "theory"
              ? block.questionType
              : type === "question" && options?.length
                ? "objective"
                : type === "question"
                  ? "theory"
                  : undefined,

          text: cleanText(block.text),
          title: cleanText(block.title),
          src: cleanText(block.src),
          alt: cleanText(block.alt),
          caption: cleanText(block.caption),

          headers: Array.isArray(block.headers)
            ? block.headers.map(cleanText)
            : undefined,

          rows: Array.isArray(block.rows)
            ? block.rows
            : undefined,

          options,

          answer: block.answer,
          explanation: cleanText(block.explanation),
          marks: Math.max(Number(block.marks) || 1, 1),
        }
      }),
    }
  })

  const requestedBoard = cleanText(raw.board).toUpperCase()
  const requestedExamType = cleanText(raw.examType).toLowerCase()

  const durationMinutes = Number(raw.durationMinutes) || 0

  return {
    name,

    // This is a display/code field, not a document identifier.
    code: cleanText(raw.code) || name.toUpperCase(),

    board: boards.has(requestedBoard)
      ? requestedBoard
      : "Custom",

    year: cleanText(raw.year),

    paper:
      cleanText(raw.paper || raw.paperType) ||
      "Past Question",

    durationMinutes: Math.max(durationMinutes, 0),

    instructions: cleanText(raw.instructions),

    examType: examTypes.has(requestedExamType)
      ? requestedExamType
      : "mixed",

    sections,
  }
}

function getMongoId(paper) {
  return paper?._id?.toString?.() || ""
}

function countQuestions(sections = []) {
  return sections.reduce((total, section) => {
    return (
      total +
      (section.blocks || []).filter(
        (block) => block.type === "question"
      ).length
    )
  }, 0)
}

// Consistent public summary.
// Both id and _id refer to the MongoDB document ID.
function paperSummary(paper, includeCode = false) {
  const plain = paper.toObject
    ? paper.toObject()
    : paper

  const mongoId = getMongoId(plain)

  return {
    _id: mongoId,
    id: mongoId,

    name: plain.name,
    code: plain.code,

    board: plain.board,
    year: plain.year,
    paper: plain.paper,

    durationMinutes: plain.durationMinutes,
    examType: plain.examType,

    questionCount: countQuestions(plain.sections || []),

    updatedAt: plain.updatedAt,

    ...(includeCode
      ? { accesscode: plain.accesscode || "" }
      : {}),
  }
}

// GET /api/cbt
export async function listCbtPapers(req, res) {
  try {
    const isAdmin = ["admin", "superadmin"].includes(
      req.user?.role || ""
    )

    const papers = await CbtPaper.find({
      status: "published",
    })
      .select(
        `${isAdmin ? "+accesscode " : ""}name code board year paper durationMinutes examType sections updatedAt`
      )
      .sort({
        board: 1,
        year: -1,
        name: 1,
        paper: 1,
      })
      .lean()

    return res.json({
      success: true,
      count: papers.length,
      data: papers.map((paper) =>
        paperSummary(paper, isAdmin)
      ),
    })
  } catch (error) {
    return sendError(res, error)
  }
}

// GET /api/cbt/admin
export async function listAdminCbtPapers(req, res) {
  try {
    const papers = await CbtPaper.find({})
      .select(
        "+accesscode name code board year paper durationMinutes instructions examType sections status createdAt updatedAt"
      )
      .sort({ updatedAt: -1 })
      .lean()

    const subjects = papers.map((paper) => ({
      ...paperSummary(paper, true),

      instructions: paper.instructions,
      status: paper.status,
      createdAt: paper.createdAt,
      updatedAt: paper.updatedAt,
    }))

    return res.json({
      success: true,
      data: {
        version: 1,
        subjects,
      },
    })
  } catch (error) {
    console.error("List admin CBT papers error:", error)
    return sendError(res, error)
  }
}

// GET /api/cbt/:id
export async function getCbtPaper(req, res) {
  try {
    const { id } = req.params

    if (!isValidMongoId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid exam paper ID.",
      })
    }

    const paper = await CbtPaper.findOne({
      _id: id,
      status: "published",
    }).lean()

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Exam paper not found.",
      })
    }

    const mongoId = getMongoId(paper)

    return res.json({
      success: true,
      data: {
        ...paper,
        _id: mongoId,
        id: mongoId,
      },
    })
  } catch (error) {
    return sendError(res, error)
  }
}

// POST /api/cbt/import
// PUT /api/cbt/:id
export async function savePapers(req, res) {
  try {
    const id = req.params?.id
    const userId = req.user?._id

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication failed. User information was not found.",
      })
    }

    const isUpdate =
      Boolean(id) &&
      id !== "undefined" &&
      id !== "null"

    // UPDATE EXISTING PAPER
    if (isUpdate) {
      if (!isValidMongoId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid exam paper ID.",
        })
      }

      const paperData = req.body?.subject ?? req.body

      if (
        !paperData ||
        typeof paperData !== "object" ||
        Array.isArray(paperData)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid exam paper data.",
        })
      }

      // Never allow the request body to change MongoDB identifiers.
      const {
        _id: ignoredMongoId,
        id: ignoredId,
        paperId: ignoredPaperId,
        ...cleanPaperData
      } = paperData

      const normalizedPaper = toPaper(cleanPaperData)

      const existing = await CbtPaper.findById(id)
        .select("+accesscode")

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Exam paper not found.",
        })
      }

      const accesscode = await resolveAccessCode(
        existing._id.toString(),
        new Set()
      )

      const saved = await CbtPaper.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            ...normalizedPaper,
            accesscode,
            status: "published",
            updatedBy: userId,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      ).select("+accesscode")

      const savedObject = saved.toObject()
      const mongoId = getMongoId(savedObject)

      return res.status(200).json({
        success: true,
        message: "Exam paper updated.",
        data: {
          ...savedObject,
          _id: mongoId,
          id: mongoId,
        },
      })
    }

    // CREATE / IMPORT PAPERS
    const source = req.body?.curriculum ?? req.body

    const rawPapers = Array.isArray(source)
      ? source
      : Array.isArray(source?.subjects)
        ? source.subjects
        : []

    if (!rawPapers.length) {
      return res.status(400).json({
        success: false,
        message: "JSON must contain a non-empty subjects array.",
      })
    }

    const normalized = rawPapers.map((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        const error = new Error(
          `Paper ${index + 1} must be a JSON object.`
        )

        error.statusCode = 400
        throw error
      }

      // Ignore all incoming document identifiers.
      const {
        _id: ignoredMongoId,
        id: ignoredId,
        paperId: ignoredPaperId,
        ...cleanPaper
      } = raw

      return toPaper(cleanPaper, index)
    })

    const taken = new Set()
    const saved = []

    for (const paper of normalized) {
      const accesscode = await resolveAccessCode(null, taken)

      // MongoDB creates _id automatically.
      const doc = await CbtPaper.create({
        ...paper,
        accesscode,
        status: "published",
        createdBy: userId,
        updatedBy: userId,
      })

      const plain = doc.toObject()
      const mongoId = getMongoId(plain)

      saved.push({
        ...plain,
        _id: mongoId,
        id: mongoId,
      })
    }

    return res.status(200).json({
      success: true,
      message: `Published ${saved.length} exam paper(s).`,
      count: saved.length,
      data: {
        version: 1,
        subjects: saved,
      },
    })
  } catch (error) {
    console.error("CBT import/update error:", error)
    return sendError(res, error)
  }
}

// DELETE /api/cbt/:id
export async function deleteCbtPaper(req, res) {
  try {
    const { id } = req.params

    if (!isValidMongoId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid exam paper ID.",
      })
    }

    const deleted = await CbtPaper.findByIdAndDelete(id)

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Exam paper not found.",
      })
    }

    return res.json({
      success: true,
      message: "Exam paper deleted.",
      data: {
        _id: deleted._id.toString(),
        id: deleted._id.toString(),
      },
    })
  } catch (error) {
    return sendError(res, error)
  }
}

// POST /api/cbt/upload-image
export async function uploadCbtImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Choose an image to upload.",
      })
    }

    const uploaded = await uploadToCloudinary(
      req.file,
      "cbt/exam-papers"
    )

    return res.status(201).json({
      success: true,
      data: {
        src: uploaded.secure_url,
        publicId: uploaded.public_id,
      },
    })
  } catch (error) {
    return sendError(res, error)
  }
}

// POST /api/cbt/attempt
export async function submitCbtAttempt(req, res) {
  try {
    // The client must send the MongoDB paper ID.
    // Keep accepting subjectId as a temporary request alias.
    const paperMongoId = cleanText(
      req.body?.paperId || req.body?.subjectId
    )

    if (!isValidMongoId(paperMongoId)) {
      return res.status(400).json({
        success: false,
        message: "A valid MongoDB exam paper ID is required.",
      })
    }

    const paper = await CbtPaper.findOne({
      _id: paperMongoId,
      status: "published",
    }).lean()

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Exam paper not found.",
      })
    }

    const answers =
      req.body?.answers &&
      typeof req.body.answers === "object" &&
      !Array.isArray(req.body.answers)
        ? req.body.answers
        : {}

    let score = 0
    let possible = 0

    for (const section of paper.sections || []) {
      for (const question of section.blocks || []) {
        if (question.type !== "question") continue

        const isObjective =
          question.questionType === "objective" ||
          Boolean(question.options?.length)

        if (
          !isObjective ||
          question.answer === undefined ||
          question.answer === null
        ) {
          continue
        }

        const marks = Math.max(
          Number(question.marks) || 1,
          1
        )

        possible += marks

        const submitted = answers[question.id]

        const correct = Array.isArray(question.answer)
          ? (
              Array.isArray(submitted) &&
              [...submitted].sort().join("\u0000") ===
                [...question.answer].sort().join("\u0000")
            )
          : (
              choiceIndex(submitted, question.options || []) >= 0 &&
              choiceIndex(submitted, question.options || []) ===
                choiceIndex(question.answer, question.options || [])
            )

        if (correct) {
          score += marks
        }
      }
    }

    const mongoPaperId = paper._id.toString()

    const attempt = await CbtAttempt.create({
      // This existing field now stores the MongoDB paper ID.
      paperId: mongoPaperId,

      paperName: `${paper.board} ${paper.year} ${paper.name}`,

      studentId: req.user._id,

      score,
      possible,

      percentage: possible
        ? Math.round((score / possible) * 100)
        : 0,

      answers,
    })

    return res.status(201).json({
      success: true,
      data: {
        id: attempt._id.toString(),
        _id: attempt._id.toString(),

        paperId: mongoPaperId,
        paperMongoId: mongoPaperId,

        score,
        possible,
        percentage: attempt.percentage,
        submittedAt: attempt.submittedAt,
      },
    })
  } catch (error) {
    return sendError(res, error)
  }
}

// POST /api/cbt/access-code
export async function getCbtPaperByAccessCode(req, res) {
  try {
    const code = cleanText(
      req.body?.accessCode || req.params?.accessCode
    ).toUpperCase()

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Enter the access code.",
      })
    }

    const paper = await CbtPaper.findOne({
      accesscode: code,
      status: "published",
    }).lean()

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Invalid access code.",
      })
    }

    // Never expose the access code in this response.
    delete paper.accesscode

    const mongoId = getMongoId(paper)

    return res.json({
      success: true,
      data: {
        ...paper,
        _id: mongoId,
        id: mongoId,
      },
    })
  } catch (error) {
    return sendError(res, error)
  }
}
