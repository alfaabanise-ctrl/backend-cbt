import { Lesson } from "../model/Lesson.js"
import { Subject } from "../model/Subject.js"
import { Topic } from "../model/Topic.js"
import mongoose from "mongoose"


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}


function naturalLessonSort(a, b) {
  const aParts = String(a).split(".")
  const bParts = String(b).split(".")

  const aTopic = aParts[0] || ""
  const bTopic = bParts[0] || ""

  const topicCompare = aTopic.localeCompare(bTopic)

  if (topicCompare !== 0) {
    return topicCompare
  }

  const aNumber = Number(aParts[1] || 0)
  const bNumber = Number(bParts[1] || 0)

  if (
    Number.isFinite(aNumber) &&
    Number.isFinite(bNumber)
  ) {
    return aNumber - bNumber
  }

  return String(a).localeCompare(
    String(b),
    undefined,
    { numeric: true }
  )
}


/*
|--------------------------------------------------------------------------
| GET SIDEBAR
|--------------------------------------------------------------------------
|
| GET /api/lessons/sidebar
|
| Uses:
|   subjectId
|   topicId
|   lessonId
|
| NEVER uses Mongo _id for application relationships.
|--------------------------------------------------------------------------
*/

export async function getSidebar(req, res, next) {
  try {
    const subjects = await Subject.find({})
      .select("subjectId name icon orderIndex")
      .sort({ orderIndex: 1 })
      .lean()

    const topics = await Topic.find({})
      .select(
        "topicId subjectId topicNumber title orderIndex"
      )
      .sort({ orderIndex: 1 })
      .lean()

    const lessons = await Lesson.find({})
      .select(
        "lessonId topicId subjectId slug title orderIndex"
      )
      .sort({ orderIndex: 1 })
      .lean()

    /*
     * Group topics by subjectId
     */
    const topicsBySubject = new Map()

    for (const topic of topics) {
      const key = String(topic.subjectId)

      if (!topicsBySubject.has(key)) {
        topicsBySubject.set(key, [])
      }

      topicsBySubject.get(key).push({
        topicId: topic.topicId,
        subjectId: topic.subjectId,
        topicNumber: topic.topicNumber,
        title: topic.title,
        orderIndex: topic.orderIndex,
        lessons: [],
      })
    }

    /*
     * Group lessons by topicId
     */
    const lessonsByTopic = new Map()

    for (const lesson of lessons) {
      const key = String(lesson.topicId)

      if (!lessonsByTopic.has(key)) {
        lessonsByTopic.set(key, [])
      }

      lessonsByTopic.get(key).push({
        lessonId: lesson.lessonId,
        topicId: lesson.topicId,
        subjectId: lesson.subjectId,
        slug: lesson.slug,
        title: lesson.title,
        orderIndex: lesson.orderIndex,
      })
    }

    /*
     * Attach lessons to topics
     */
    for (const topicList of topicsBySubject.values()) {
      for (const topic of topicList) {
        topic.lessons =
          lessonsByTopic.get(String(topic.topicId)) || []
      }
    }

    /*
     * Build final sidebar
     */
    const result = subjects.map((subject) => ({
      subjectId: subject.subjectId,
      name: subject.name,
      icon: subject.icon,
      orderIndex: subject.orderIndex,

      topics:
        topicsBySubject.get(
          String(subject.subjectId)
        ) || [],
    }))

    res.json(result)
  } catch (error) {
    next(error)
  }
}


/*
|--------------------------------------------------------------------------
| GET LESSON
|--------------------------------------------------------------------------
|
| GET /api/lessons/:slug
|
| Supports:
|   /api/lessons/:slug
|
| But internally uses slug, NOT _id.
|--------------------------------------------------------------------------
*/

export async function getLesson(req, res, next) {
  try {
    const { slug } = req.params

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Lesson slug is required.",
      })
    }

    const lesson = await Lesson.findOne({
      slug,
    })
      .select("-__v")
      .lean()

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found.",
      })
    }

    res.json({
      success: true,
      data: lesson,
    })
  } catch (error) {
    next(error)
  }
}


/*
|--------------------------------------------------------------------------
| GET LESSON BY LESSON ID
|--------------------------------------------------------------------------
|
| GET /api/lessons/id/:lessonId
|
| This is better when lessonId is your application identifier.
|--------------------------------------------------------------------------
*/

export async function getLessonById(req, res, next) {
  try {
    const { lessonId } = req.params
    console.log(lessonId, 'lessonIdlessonIdlessonIdlessonIdlessonId');
    
    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "lessonId is required.",
      })
    }

    const lesson = await Lesson.findOne({
      lessonId,
    })
      .select("-__v")
      .lean()
    // console.log(lesson, 'lessfon');
    
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found.",
      })
    }

    res.json({
      success: true,
      data: lesson,
    })
  } catch (error) {
    next(error)
  }
}


/*
|--------------------------------------------------------------------------
| GET ADJACENT LESSON
|--------------------------------------------------------------------------
|
| GET /api/lessons/adjacent
|
| Query:
|
| ?topicId=chemistry-organic-chemistry
| &orderIndex=2
| &direction=next
|
|--------------------------------------------------------------------------
*/

export async function getAdjacentLesson(req, res, next) {
  try {
    const topicId = String(req.query.topicId || "").trim()
    const orderIndexRaw = req.query.orderIndex
    const direction = String(req.query.direction || "").trim()

    if (!topicId) {
      return res.status(400).json({
        success: false,
        message: "topicId is required",
      })
    }

    if (
      orderIndexRaw === undefined ||
      orderIndexRaw === null ||
      orderIndexRaw === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "orderIndex is required",
      })
    }

    const currentOrder = Number(orderIndexRaw)

    if (!Number.isFinite(currentOrder)) {
      return res.status(400).json({
        success: false,
        message: "orderIndex must be a valid number",
      })
    }

    if (direction !== "next" && direction !== "previous") {
      return res.status(400).json({
        success: false,
        message:
          'direction must be either "next" or "previous"',
      })
    }

    let query
    let sort

    if (direction === "next") {
      query = {
        topicId,
        orderIndex: {
          $gt: currentOrder,
        },
      }

      sort = {
        orderIndex: 1,
      }
    } else {
      query = {
        topicId,
        orderIndex: {
          $lt: currentOrder,
        },
      }

      sort = {
        orderIndex: -1,
      }
    }

    const lesson = await Lesson.findOne(query)
      .select(
        "lessonId subjectId topicId slug title orderIndex"
      )
      .sort(sort)
      .lean()

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message:
          direction === "next"
            ? "No next lesson found"
            : "No previous lesson found",
      })
    }

    return res.json({
      success: true,
      data: lesson,
    })
  } catch (error) {
    console.error(
      "Get adjacent lesson failed:",
      error
    )

    next(error)
  }
}

/*
|--------------------------------------------------------------------------
| SEARCH LESSONS
|--------------------------------------------------------------------------
|
| GET /api/lessons/search?q=organic
|
|--------------------------------------------------------------------------
*/

export async function searchLessons(
  req,
  res,
  next
) {
  try {
    const term = String(
      req.query.q || ""
    ).trim()

    const limit = Math.min(
      Number(req.query.limit) || 20,
      100
    )

    if (!term) {
      return res.json([])
    }

    const lessons = await Lesson.find(
      {
        $text: {
          $search: term,
        },
      },
      {
        score: {
          $meta: "textScore",
        },
      }
    )
      .select(
        "lessonId topicId subjectId slug title summary"
      )
      .sort({
        score: {
          $meta: "textScore",
        },
      })
      .limit(limit)
      .lean()

    /*
     * Get subjects using subjectId.
     *
     * NEVER:
     * Subject.find({ _id: ... })
     */
    const subjectIds = [
      ...new Set(
        lessons
          .map((lesson) => lesson.subjectId)
          .filter(Boolean)
          .map(String)
      ),
    ]

    const subjects = await Subject.find({
      subjectId: {
        $in: subjectIds,
      },
    })
      .select("subjectId name")
      .lean()

    const subjectMap = new Map(
      subjects.map((subject) => [
        String(subject.subjectId),
        subject.name,
      ])
    )

    res.json(
      lessons.map((lesson) => ({
        lessonId: lesson.lessonId,
        topicId: lesson.topicId,
        subjectId: lesson.subjectId,

        slug: lesson.slug,
        title: lesson.title,
        summary: lesson.summary,

        subjectName:
          subjectMap.get(
            String(lesson.subjectId)
          ) || "",

        snippet: lesson.summary,
      }))
    )
  } catch (error) {
    next(error)
  }
}


/*
|--------------------------------------------------------------------------
| IMPORT CURRICULUM
|--------------------------------------------------------------------------
|
| POST /api/lessons/import
|
| This is the MongoDB equivalent of your SQLite importer.
|
| Application IDs:
|
| Subject:
|   subjectId
|
| Topic:
|   topicId
|
| Lesson:
|   lessonId
|
| MongoDB's internal _id is NOT used for relationships.
|--------------------------------------------------------------------------
*/

export async function importCurriculum(
  req,
  res,
  next
) {
  const session = await mongoose.startSession()

  try {
    /*
     * -------------------------------------------------------
     * READ CURRICULUM
     * -------------------------------------------------------
     */

    const curriculum =
      req.body?.curriculum ??
      req.body

    if (
      !curriculum ||
      typeof curriculum !== "object" ||
      Array.isArray(curriculum)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid curriculum data.",
      })
    }

    if (!Array.isArray(curriculum.topics)) {
      return res.status(400).json({
        success: false,
        message:
          "curriculum.topics must be an array.",
      })
    }

    if (
      !curriculum.lessons ||
      typeof curriculum.lessons !== "object" ||
      Array.isArray(curriculum.lessons)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "curriculum.lessons must be an object.",
      })
    }


    /*
     * -------------------------------------------------------
     * SUBJECT ID
     * -------------------------------------------------------
     */

    const subjectName = String(
      curriculum.subject ||
      "Untitled Subject"
    ).trim()

    /*
     * IMPORTANT:
     *
     * The frontend can send:
     *
     * subjectId = "chemistry"
     *
     * We use that directly.
     *
     * We NEVER query:
     *
     * Subject.findOne({ _id: "chemistry" })
     */

    const subjectId =
      String(
        curriculum.subjectId ||
        slugify(subjectName)
      ).trim()

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message:
          "Unable to determine subjectId.",
      })
    }


    /*
     * -------------------------------------------------------
     * RESULT
     * -------------------------------------------------------
     */

    let importResult = null


    /*
     * -------------------------------------------------------
     * TRANSACTION
     * -------------------------------------------------------
     */

    await session.withTransaction(async () => {

      /*
       * =====================================================
       * SUBJECT
       * =====================================================
       */

      let subject =
        await Subject.findOne({
          subjectId,
        }).session(session)

      let subjectAction = "updated"

      /*
       * INSERT SUBJECT
       */

      if (!subject) {

        const subjectCount =
          await Subject.countDocuments()
            .session(session)

        subject =
          new Subject({
            subjectId,
            name: subjectName,
            icon:
              curriculum.icon ||
              "",

            orderIndex:
              subjectCount,
          })

        await subject.save({
          session,
        })

        subjectAction = "inserted"

      }

      /*
       * UPDATE SUBJECT
       */

      else {

        subject.name =
          subjectName

        if (
          curriculum.icon !==
          undefined
        ) {
          subject.icon =
            curriculum.icon
        }

        await subject.save({
          session,
        })
      }


      /*
       * =====================================================
       * TOPIC ORDER
       * =====================================================
       */

      const lastTopic =
        await Topic.findOne({
          subjectId,
        })
          .sort({
            orderIndex: -1,
          })
          .session(session)
          .lean()

      const lastTopicNumber =
        await Topic.findOne({
          subjectId,
        })
          .sort({
            topicNumber: -1,
          })
          .session(session)
          .lean()

      let nextTopicOrder =
        Number(
          lastTopic?.orderIndex || 0
        ) + 1

      let nextTopicNumber =
        Number(
          lastTopicNumber?.topicNumber || 0
        ) + 1


      /*
       * =====================================================
       * TOPICS
       * =====================================================
       */

      const topicIdMap = {}

      let topicsInserted = 0
      let topicsUpdated = 0


      for (
        const topic of
        curriculum.topics
      ) {

        const topicCode =
          String(
            topic?.topicId ||
            ""
          ).trim()

        if (!topicCode) {
          continue
        }

        const topicName =
          String(
            topic?.topicName ||
            topicCode
          ).trim()

        /*
         * Application topic ID
         */

        const topicId =
          String(
            topic?.databaseId ||
            `${subjectId}-${slugify(topicName)}`
          )


        topicIdMap[topicCode] =
          topicId


        /*
         * FIND TOPIC USING topicId
         */

        let existing =
          await Topic.findOne({
            topicId,
          }).session(session)


        /*
         * UPDATE
         */

        if (existing) {

          existing.subjectId =
            subjectId

          existing.title =
            topicName

          if (
            topic.topicNumber !==
            undefined
          ) {
            existing.topicNumber =
              topic.topicNumber
          }

          await existing.save({
            session,
          })

          topicsUpdated++

        }


        /*
         * INSERT
         */

        else {

          await Topic.create(
            [
              {
                topicId,

                subjectId,

                topicNumber:
                  topic.topicNumber ??
                  nextTopicNumber,

                title:
                  topicName,

                orderIndex:
                  topic.orderIndex ??
                  nextTopicOrder,
              },
            ],
            {
              session,
            }
          )

          topicsInserted++

          nextTopicNumber++
          nextTopicOrder++
        }
      }


      /*
       * =====================================================
       * LESSONS
       * =====================================================
       */

      const lessons =
        curriculum.lessons || {}

      const lessonKeys =
        Object.keys(lessons)
          .sort(
            naturalLessonSort
          )

      const orderCounters = {}

      let inserted = 0
      let updated = 0
      let totalBlocks = 0


      for (
        const lessonKey of
        lessonKeys
      ) {

        const entry =
          lessons[lessonKey]

        const lesson =
          entry?.lesson ??
          entry


        if (
          !lesson ||
          typeof lesson !== "object"
        ) {
          continue
        }


        /*
         * ---------------------------------------------------
         * LESSON KEY
         * ---------------------------------------------------
         */

        const parts =
          String(lessonKey)
            .split(".")

        const topicCode =
          parts[0]

        const lessonCode =
          parts[1] ||
          lesson.id ||
          slugify(
            lesson.title
          )

        if (!topicCode) {
          continue
        }


        /*
         * ---------------------------------------------------
         * FIND TOPIC
         * ---------------------------------------------------
         */

        let topicId =
          topicIdMap[
            topicCode
          ]


        /*
         * FALLBACK TOPIC
         */

        if (!topicId) {

          const topicName =
            lesson.topic ||
            topicCode

          topicId =
            `${subjectId}-${slugify(topicName)}`


          /*
           * Search by topicId.
           */

          let existing =
            await Topic.findOne({
              topicId,
            }).session(session)


          /*
           * Fallback search by subjectId + title.
           */

          if (!existing) {

            existing =
              await Topic.findOne({
                subjectId,
                title: topicName,
              }).session(session)
          }


          /*
           * CREATE FALLBACK TOPIC
           */

          if (!existing) {

            await Topic.create(
              [
                {
                  topicId,

                  subjectId,

                  topicNumber:
                    nextTopicNumber,

                  title:
                    topicName,

                  orderIndex:
                    nextTopicOrder,
                },
              ],
              {
                session,
              }
            )

            nextTopicNumber++
            nextTopicOrder++

          }

          /*
           * Existing topic.
           *
           * IMPORTANT:
           * use existing.topicId
           *
           * NOT existing._id
           */

          else {

            topicId =
              String(
                existing.topicId
              )
          }


          topicIdMap[
            topicCode
          ] = topicId
        }


        /*
         * ---------------------------------------------------
         * LESSON ORDER
         * ---------------------------------------------------
         */

        if (
          orderCounters[topicId] ==
          null
        ) {

          const lastLesson =
            await Lesson.findOne({
              topicId,
            })
              .sort({
                orderIndex: -1,
              })
              .session(session)
              .lean()

          orderCounters[
            topicId
          ] =
            Number(
              lastLesson?.orderIndex ||
              0
            ) + 1
        }


        /*
         * ---------------------------------------------------
         * BLOCKS
         * ---------------------------------------------------
         */

        const blocks =
          Array.isArray(
            lesson.blocks
          )
            ? lesson.blocks
            : []

        totalBlocks +=
          blocks.length


        /*
         * ---------------------------------------------------
         * SLUG
         * ---------------------------------------------------
         */

        const slug =
          slugify(
            lesson.title ||
            lessonKey
          )


        /*
         * ---------------------------------------------------
         * LESSON ID
         * ---------------------------------------------------
         *
         * Example:
         *
         * chemistry-1-1-atomic-structure
         *
         */

        const lessonId =
          String(
            lesson.databaseId ||
            lesson.lessonId ||
            `${subjectId}-${slugify(topicCode)}-${slugify(lessonCode)}-${slug}`
          )


        /*
         * ---------------------------------------------------
         * SUMMARY
         * ---------------------------------------------------
         */

        const summary =
          String(
            lesson.introduction ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200)


        /*
         * ---------------------------------------------------
         * SEARCH TEXT
         * ---------------------------------------------------
         */

        const objectiveText =
          Array.isArray(
            lesson.learningObjectives
          )
            ? lesson.learningObjectives.join(
                " "
              )
            : ""


        /*
         * Include block text if available.
         */

        const blockSearchText =
          blocks
            .map((block) => {

              if (
                !block ||
                typeof block !==
                  "object"
              ) {
                return ""
              }

              return [
                block.text,
                block.text_html,
                block.title,
                block.caption,
                block.latex,

                ...(Array.isArray(
                  block.items
                )
                  ? block.items
                  : []),

                ...(Array.isArray(
                  block.items_html
                )
                  ? block.items_html
                  : []),
              ]
                .filter(Boolean)
                .join(" ")
            })
            .join(" ")


        const searchText = [
          lesson.title || "",
          lesson.introduction || "",
          objectiveText,
          blockSearchText,
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()


        /*
         * ---------------------------------------------------
         * EXISTING LESSON
         * ---------------------------------------------------
         *
         * IMPORTANT:
         *
         * Find by lessonId.
         *
         * NEVER _id.
         */

        const existingLesson =
          await Lesson.findOne({
            lessonId,
          }).session(session)


        let orderIndex


        if (existingLesson) {

          orderIndex =
            Number(
              existingLesson.orderIndex ||
              0
            )

        }

        else {

          orderIndex =
            lesson.orderIndex ??
            orderCounters[
              topicId
            ]

          orderCounters[
            topicId
          ] =
            orderIndex + 1
        }


        /*
         * ---------------------------------------------------
         * LESSON DATA
         * ---------------------------------------------------
         */

        const lessonData = {

          lessonId,

          topicId,

          subjectId,

          topicNumber:
            lesson.syllabusReference ||
            "",

          slug,

          title:
            lesson.title ||
            "Untitled Lesson",

          summary,

          blocks,

          searchText,

          orderIndex,
        }


        /*
         * ---------------------------------------------------
         * UPSERT LESSON
         * ---------------------------------------------------
         */

        await Lesson.findOneAndUpdate(

          {
            lessonId,
          },

          {
            $set:
              lessonData,
          },

          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            session,
          }
        )


        /*
         * ---------------------------------------------------
         * COUNTERS
         * ---------------------------------------------------
         */

        if (
          existingLesson
        ) {
          updated++
        } else {
          inserted++
        }
      }


      /*
       * =====================================================
       * RESULT
       * =====================================================
       */

      importResult = {

        subject:
          subjectName,

        subjectId,

        subjectAction,

        topicsInserted,

        topicsUpdated,

        totalLessons:
          lessonKeys.length,

        inserted,

        updated,

        totalBlocks,
      }
    })


    /*
     * =======================================================
     * RESPONSE
     * =======================================================
     */

    return res.json({

      success: true,

      message:
        "Curriculum imported successfully.",

      data:
        importResult,
    })

  }

  catch (error) {

    console.error(
      "Curriculum import failed:",
      error
    )

    next(error)

  }

  finally {

    await session.endSession()
  }
}


/*
|--------------------------------------------------------------------------
| GET SUBJECT
|--------------------------------------------------------------------------
|
| GET /api/lessons/subject/:subjectId
|--------------------------------------------------------------------------
*/

export async function getSubject(
  req,
  res,
  next
) {
  try {

    const { subjectId } =
      req.params

    const subject =
      await Subject.findOne({
        subjectId,
      })
        .select(
          "subjectId name icon orderIndex"
        )
        .lean()

    if (!subject) {

      return res.status(404).json({
        success: false,
        message:
          "Subject not found.",
      })
    }

    res.json({
      success: true,
      data: subject,
    })

  } catch (error) {

    next(error)
  }
}


/*
|--------------------------------------------------------------------------
| GET TOPIC
|--------------------------------------------------------------------------
|
| GET /api/lessons/topic/:topicId
|--------------------------------------------------------------------------
*/

export async function getTopic(
  req,
  res,
  next
) {
  try {

    const { topicId } =
      req.params

    const topic =
      await Topic.findOne({
        topicId,
      })
        .select(
          "topicId subjectId topicNumber title orderIndex"
        )
        .lean()

    if (!topic) {

      return res.status(404).json({
        success: false,
        message:
          "Topic not found.",
      })
    }

    res.json({
      success: true,
      data: topic,
    })

  } catch (error) {

    next(error)
  }
}


/*
|--------------------------------------------------------------------------
| GET LESSONS BY TOPIC
|--------------------------------------------------------------------------
|
| GET /api/lessons/topic/:topicId/lessons
|--------------------------------------------------------------------------
*/

export async function getLessonsByTopic(
  req,
  res,
  next
) {
  try {

    const { topicId } =
      req.params

    const lessons =
      await Lesson.find({
        topicId,
      })
        .select(
          "lessonId topicId subjectId slug title summary orderIndex"
        )
        .sort({
          orderIndex: 1,
        })
        .lean()

    res.json({
      success: true,
      data: lessons,
    })

  } catch (error) {

    next(error)
  }
}



export async function updateLesson(req, res) {
  try {
    /*
     * The lesson ID comes from:
     *
     * PUT /api/lessons/:id
     */

    const { lessonId } = req.params

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: "Lesson ID is required",
      })
    }
    console.log(lessonId, 'lessonIdlessonIdlessonId');
    
    /*
     * Get data from request body.
     *
     * We intentionally DO NOT get the ID
     * from req.body.
     */
    const { title,  summary,  blocks, slug,  topicId, subjectId, topicNumber,     orderIndex,
      searchText,
    } = req.body
    
    /*
     * Validate blocks.
     */
    if (!Array.isArray(req.body.blocks)) {
      return res.status(400).json({
        success: false,
        message: "blocks must be an array",
      })
    }

    /*
     * Update the lesson.
     *
     * The MongoDB _id is protected because
     * we only update the fields explicitly listed.
     */
    const lesson = await Lesson.findOneAndUpdate(
     { lessonId},
      {
        $set: {
          title:
            title ?? "Untitled Lesson",

          summary:
            summary ?? "",

          blocks,

          slug:
            slug ?? "",

          topicId:
            topicId ?? null,

          subjectId:
            subjectId ?? null,

          topicNumber:
            topicNumber ?? null,

          orderIndex:
            orderIndex ?? 0,

          searchText:
            searchText ?? "",
        },
      },
      {
        new: true,
        runValidators: true,
      },
    )

    /*
     * Lesson doesn't exist.
     */
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson not found",
      })
    }

    /*
     * Return the updated lesson.
     */
    return res.status(200).json({
      success: true,
      lesson,
    })
  } catch (error) {
    console.error(
      "Failed to update lesson:",
      error,
    )

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update lesson",
    })
  }
}