import dotenv from "dotenv"
import mongoose from "mongoose"
import Question from "../model/Question.js"
import { Subject } from "../model/Subject.js"
import { Topic } from "../model/Topic.js"
import { Lesson } from "../model/Lesson.js"

dotenv.config({ quiet: true })

const subjectId = "english-language"
const subjectName = "ENGLISH LANGUAGE"
const englishAlias = /^english(?:[ -]language)?$/i
const applyChanges = process.argv.includes("--apply")

if (!process.env.DATA_BASE) {
  throw new Error("DATA_BASE is not configured.")
}

await mongoose.connect(process.env.DATA_BASE)

try {
  const subjects = await Subject.find({
    $or: [
      { subjectId: englishAlias },
      { name: englishAlias },
    ],
  })
    .select("subjectId name")
    .lean()

  if (subjects.length === 0) {
    throw new Error(
      "No English subject record was found in MongoDB; no changes were made."
    )
  }

  const oldSubjectIds = subjects.map((subject) => subject.subjectId)
  const questionFilter = { subject: englishAlias }
  const referenceFilter = {
    subjectId: { $in: [...new Set([...oldSubjectIds, subjectId])] },
  }

  const before = {
    subjects: subjects.map(({ subjectId: id, name }) => ({ id, name })),
    questions: await Question.countDocuments(questionFilter),
    topics: await Topic.countDocuments(referenceFilter),
    lessons: await Lesson.countDocuments(referenceFilter),
  }

  console.info(
    JSON.stringify(
      {
        mode: applyChanges ? "apply" : "preview",
        canonicalSubject: { subjectId, name: subjectName },
        matchingRecords: before,
      },
      null,
      2
    )
  )

  if (!applyChanges) {
    console.info("Preview only. Re-run with --apply to migrate these records.")
  } else {
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const canonical = subjects.find(
          (subject) => subject.subjectId.toLowerCase() === subjectId
        )
        const retained = canonical ?? subjects[0]
        const duplicateIds = subjects
          .filter((subject) => subject._id.toString() !== retained._id.toString())
          .map((subject) => subject._id)

        await Topic.collection.updateMany(
          referenceFilter,
          { $set: { subjectId } },
          { session }
        )
        await Lesson.collection.updateMany(
          referenceFilter,
          { $set: { subjectId } },
          { session }
        )
        await Question.collection.updateMany(
          questionFilter,
          { $set: { subject: subjectId } },
          { session }
        )
        await Subject.collection.updateOne(
          { _id: retained._id },
          { $set: { subjectId, name: subjectName } },
          { session }
        )

        if (duplicateIds.length > 0) {
          await Subject.collection.deleteMany(
            { _id: { $in: duplicateIds } },
            { session }
          )
        }
      })
    } finally {
      await session.endSession()
    }

    console.info("English subject migration committed.")
    console.info(
      JSON.stringify(
        {
          remainingLegacyQuestions: await Question.countDocuments({
            subject: englishAlias,
          }),
          remainingLegacyTopics: await Topic.countDocuments({
            subjectId: englishAlias,
          }),
          remainingLegacyLessons: await Lesson.countDocuments({
            subjectId: englishAlias,
          }),
          canonicalSubject: await Subject.findOne({ subjectId })
            .select("subjectId name")
            .lean(),
        },
        null,
        2
      )
    )
  }
} finally {
  await mongoose.disconnect()
}
