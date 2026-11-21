import CbtAttempt from "../model/CbtAttempt.js"
import CbtPaper from "../model/CbtPaper.js"
import { uploadToCloudinary } from "../utils/upload.js"

const boards = new Set(["WAEC", "NECO", "NABTEB", "JAMB", "Custom"])
const examTypes = new Set(["objective", "practical", "mixed"])



import crypto from "crypto"

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0,O,1,I

function randomCode(length) {
  let code = ""
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]
  }
  return code
}

async function generateUniqueAccessCode(taken = new Set()) {
  // try 4 characters first, then grow to 5 if collisions keep happening
  for (const length of [4, 5]) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = randomCode(length)
      if (taken.has(code)) continue
      const exists = await CbtPaper.exists({ accesscode: code })
      if (!exists) {
        taken.add(code)
        return code
      }
    }
  }
  const error = new Error("Could not generate a unique access code. Try again.")
  error.statusCode = 500
  throw error
}

// Keep the existing code if the paper already has one, otherwise make a new one
async function resolveAccessCode(paperId, taken) {
  const existing = await CbtPaper.findOne({ paperId }).select("+accesscode").lean()
  return existing?.accesscode || generateUniqueAccessCode(taken)
}
const blockTypes = new Set([
  "heading",
  "paragraph",
  "instruction",
  "image",
  "question",
  "answer",
  "table",
])

function cleanText(value) {
  return String(value ?? "").trim()
}

function choiceIndex(value, options) {
  const text = cleanText(value)
  const letter = text.match(/^([a-e])(?:[.)]|\s|$)/i)?.[1]?.toLowerCase()
  if (letter) return letter.charCodeAt(0) - 97

  const normalize = (option) => cleanText(option)
    .replace(/^[a-e](?:[.)]|\s)+/i, "")
    .toLowerCase()

  return options.findIndex((option) => normalize(option) === normalize(text))
}

function toPaper(raw, index = 0, forcedId = "") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const error = new Error("Each exam paper must be a JSON object.")
    error.statusCode = 400
    throw error
  }

  const name = cleanText(raw.name || raw.subject)
  const paperId = cleanText(forcedId || raw.id || raw.paperId || raw.code)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `paper-${index + 1}`

  if (!name) {
    const error = new Error("Exam paper subject name is required.")
    error.statusCode = 400
    throw error
  }

  const sourceSections = Array.isArray(raw.sections)
    ? raw.sections
    : [{ id: "section-a", name: "Section A", blocks: raw.blocks || [] }]

  if (!sourceSections.length) {
    const error = new Error(`Exam paper "${name}" must contain at least one section.`)
    error.statusCode = 400
    throw error
  }

  const sections = sourceSections.map((section, sectionIndex) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      const error = new Error(`Section ${sectionIndex + 1} in "${name}" must be an object.`)
      error.statusCode = 400
      throw error
    }

    const blocks = Array.isArray(section.blocks) ? section.blocks : []
    return {
      id: cleanText(section.id) || `section-${sectionIndex + 1}`,
      name: cleanText(section.name) || `Section ${String.fromCharCode(65 + sectionIndex)}`,
      blocks: blocks.map((block, blockIndex) => {
        const type = cleanText(block?.type)
        if (!block || typeof block !== "object" || Array.isArray(block) || !blockTypes.has(type)) {
          const error = new Error(`Invalid block ${blockIndex + 1} in section ${sectionIndex + 1}.`)
          error.statusCode = 400
          throw error
        }

        const options = Array.isArray(block.options)
          ? block.options.map(cleanText)
          : undefined

        return {
          id: cleanText(block.id) || `block-${blockIndex + 1}`,
          type,
          questionType: block.questionType === "objective" || block.questionType === "theory"
            ? block.questionType
            : type === "question" && options?.length ? "objective" : type === "question" ? "theory" : undefined,
          text: cleanText(block.text),
          title: cleanText(block.title),
          src: cleanText(block.src),
          alt: cleanText(block.alt),
          caption: cleanText(block.caption),
          headers: Array.isArray(block.headers) ? block.headers.map(cleanText) : undefined,
          rows: Array.isArray(block.rows) ? block.rows : undefined,
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
    paperId,
    name,
    code: cleanText(raw.code) || paperId.toUpperCase(),
    board: boards.has(requestedBoard) ? requestedBoard : "Custom",
    year: cleanText(raw.year),
    paper: cleanText(raw.paper || raw.paperType) || "Past Question",
    durationMinutes: Math.max(durationMinutes, 0),
    instructions: cleanText(raw.instructions),
    examType: examTypes.has(requestedExamType) ? requestedExamType : "mixed",
    sections,
  }
}

function sendError(res, error) {
  const status = Number(error.statusCode) || 500
  if (status >= 500) console.error("CBT API error:", error)
  return res.status(status).json({
    success: false,
    message: status === 500 ? "CBT request failed." : error.message,
  })
}

function paperSummary(paper, includeCode = false) {
  const plain = paper.toObject ? paper.toObject() : paper
  return {
    id: plain.paperId,
    paperId: plain.paperId,
    name: plain.name,
    code: plain.code,
    board: plain.board,
    year: plain.year,
    paper: plain.paper,
    durationMinutes: plain.durationMinutes,
    examType: plain.examType,
    questionCount: (plain.sections || []).reduce(
      (total, section) => total + (section.blocks || []).filter((block) => block.type === "question").length,
      0
    ),
    updatedAt: plain.updatedAt,
    ...(includeCode ? { accesscode: plain.accesscode || "" } : {}),
  }
}

export async function listCbtPapers(req, res) {
  try {
    const isAdmin = ["admin", "superadmin"].includes(req.user?.role || "")

    const papers = await CbtPaper.find({ status: "published" })
      .select(`${isAdmin ? "+accesscode " : ""}paperId name code board year paper durationMinutes examType sections updatedAt`)
      .sort({ board: 1, year: -1, name: 1, paper: 1 })
      .lean()

    return res.json({
      success: true,
      count: papers.length,
      data: papers.map((paper) => paperSummary(paper, isAdmin)),
    })
  } catch (error) {
    return sendError(res, error)
  }
}



export async function listAdminCbtPapers(req, res) {
  try {
    const papers = await CbtPaper.find({})
      .select(
        "paperId name code accesscode board year paper durationMinutes instructions examType sections status createdAt updatedAt"
      )
      .sort({ updatedAt: -1 })
      .lean()

    const subjects = papers.map((paper) => {
      // Use MongoDB ID if paperId is missing or corrupted
      const validPaperId =
        typeof paper.paperId === "string" &&
        paper.paperId.trim() &&
        paper.paperId !== "object-object"
          ? paper.paperId
          : paper._id.toString()

      // Calculate question count
      const questionCount = (paper.sections || []).reduce(
        (total, section) => {
          return (
            total +
            (section.blocks || []).filter(
              (block) => block.type === "question"
            ).length
          )
        },
        0
      )

      return {
        id: validPaperId,
        paperId: validPaperId,

        name: paper.name,
        code: paper.code,
        accesscode: paper.accesscode || "",

        board: paper.board,
        year: paper.year,
        paper: paper.paper,

        durationMinutes: paper.durationMinutes,
        instructions: paper.instructions,
        examType: paper.examType,

        questionCount,

        status: paper.status,
        createdAt: paper.createdAt,
        updatedAt: paper.updatedAt,
      }
    })

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

export async function getCbtPaper(req, res) {
  try {
    const paper = await CbtPaper.findOne({
      _id: req.params.id,
      status: "published",
    }).lean()

    if (!paper) {
      return res.status(404).json({ success: false, message: "Exam paper not found." })
    }

    return res.json({
      success: true,
      data: { ...paper, id: paper.paperId },
    })
  } catch (error) {
    return sendError(res, error)
  }
}

// Adjust these imports to match your project

// import { toPaper, sendError } from "./cbt.helpers.js"   // keep your existing helpers


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

    const isUpdate = Boolean(id) && id !== "undefined" && id !== "null"

    // ---------- UPDATE EXISTING PAPER ----------
    if (isUpdate) {
      const paperData = req.body?.subject ?? req.body
      const paper = toPaper(paperData, 0, id)
      const accesscode = await resolveAccessCode(id, new Set())

      const saved = await CbtPaper.findOneAndUpdate(
        { _id: id },
        { $set: { ...paper, accesscode, status: "published", updatedBy: userId } },
        { new: true, runValidators: true }
      )

      if (!saved) {
        return res.status(404).json({ success: false, message: "Exam paper not found." })
      }

      return res.status(200).json({
        success: true,
        message: "Exam paper updated.",
        data: { ...saved.toObject(), id: saved.paperId, accesscode },
      })
    }

    // ---------- CREATE / IMPORT ----------
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

    const normalized = rawPapers.map((raw, index) => toPaper(raw, index))
    const paperIds = normalized.map((p) => p.paperId)

    if (new Set(paperIds).size !== paperIds.length) {
      return res.status(400).json({
        success: false,
        message: "Your import contains duplicate paper IDs.",
      })
    }

    // Sequential (not Promise.all) so two papers in one import never get the same code
    const taken = new Set()
    const saved = []

    for (const paper of normalized) {
      const accesscode = await resolveAccessCode(paper.paperId, taken)

      const doc = await CbtPaper.findOneAndUpdate(
        { paperId: paper.paperId },
        {
          $set: { ...paper, accesscode, status: "published", updatedBy: userId },
          $setOnInsert: { createdBy: userId },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      )

      saved.push({ ...doc.toObject(), id: doc.paperId, accesscode })
    }

    return res.status(200).json({
      success: true,
      message: `Published ${saved.length} exam paper(s).`,
      count: saved.length,
      data: { version: 1, subjects: saved },
    })
  } catch (error) {
    console.error("CBT import/update error:", error)
    return sendError(res, error)
  }
}

export async function deleteCbtPaper(req, res) {
  try {
    const deleted = await CbtPaper.findOneAndDelete({ paperId: req.params.id })
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Exam paper not found." })
    }

    return res.json({ success: true, message: "Exam paper deleted." })
  } catch (error) {
    return sendError(res, error)
  }
}

export async function uploadCbtImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Choose an image to upload." })
    }

    const uploaded = await uploadToCloudinary(req.file, "cbt/exam-papers")
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

export async function submitCbtAttempt(req, res) {
  try {
    const paper = await CbtPaper.findOne({
      paperId: req.body?.paperId || req.body?.subjectId,
      status: "published",
    }).lean()

    if (!paper) {
      return res.status(404).json({ success: false, message: "Exam paper not found." })
    }

    const answers = req.body?.answers && typeof req.body.answers === "object"
      ? req.body.answers
      : {}
    let score = 0
    let possible = 0

    for (const section of paper.sections || []) {
      for (const question of section.blocks || []) {
        if (question.type !== "question") continue
        const isObjective = question.questionType === "objective" || Boolean(question.options?.length)
        if (!isObjective || question.answer === undefined || question.answer === null) continue

        const marks = Math.max(Number(question.marks) || 1, 1)
        possible += marks
        const submitted = answers[question.id]
        const correct = Array.isArray(question.answer)
          ? Array.isArray(submitted) && [...submitted].sort().join("\u0000") === [...question.answer].sort().join("\u0000")
          : choiceIndex(submitted, question.options || []) >= 0
            && choiceIndex(submitted, question.options || []) === choiceIndex(question.answer, question.options || [])

        if (correct) score += marks
      }
    }

    const attempt = await CbtAttempt.create({
      paperId: paper.paperId,
      paperName: `${paper.board} ${paper.year} ${paper.name}`,
      studentId: req.user._id,
      score,
      possible,
      percentage: possible ? Math.round((score / possible) * 100) : 0,
      answers,
    })

    return res.status(201).json({
      success: true,
      data: {
        id: attempt._id,
        paperId: paper.paperId,
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
export async function getCbtPaperByAccessCode(req, res) {
  try {
    const code = cleanText(req.body?.accessCode || req.params?.accessCode).toUpperCase()
      console.log(code, 'csdks;dfmsd;')
    if (!code) {
      return res.status(400).json({ success: false, message: "Enter the access code." })
    }

    const paper = await CbtPaper.findOne({ accesscode: code, status: "published" }).lean()

    if (!paper) {
      return res.status(404).json({ success: false, message: "Invalid access code." })
    }

    delete paper.accesscode // never send the code back
    return res.json({ success: true, data: { ...paper, id: paper.paperId } })
  } catch (error) {
    return sendError(res, error)
  }
}
