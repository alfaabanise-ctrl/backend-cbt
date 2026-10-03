import { Subject } from "../model/Subject.js";
import { Topic } from "../model/Topic.js";
import { Lesson } from "../model/Lesson.js";
 import PastQuestion from "../model/Question.js";

/**
 * Get subjects.
 */
export const getSoftwareSubjects = async (
  req,
  res
) => {
  try {
    const subjects =
      await Subject.find({})
        .sort({
          orderIndex: 1,
          name: 1,
        })
        .lean();

    return res.status(200).json({
      success: true,
      count: subjects.length,
      data: subjects,
    });
  } catch (error) {
    console.error(
      "getSoftwareSubjects error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load subjects.",
    });
  }
};

/**
 * Get topics.
 */
export const getSoftwareTopics = async (
  req,
  res
) => {
  try {
    const {
      subjectId,
    } = req.query;

    const filter = {};

    if (subjectId) {
      filter.subjectId =
        String(subjectId).trim();
    }

    const topics =
      await Topic.find(filter)
        .sort({
          subjectId: 1,
          orderIndex: 1,
          title: 1,
        })
        .lean();

    return res.status(200).json({
      success: true,
      count: topics.length,
      data: topics,
    });
  } catch (error) {
    console.error(
      "getSoftwareTopics error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load topics.",
    });
  }
};

/**
 * Get lessons.
 */
export const getSoftwareLessons = async (
  req,
  res
) => {
  try {
    const {
      subjectId,
      topicId,
    } = req.query;

    const filter = {};

    if (subjectId) {
      filter.subjectId =
        String(subjectId).trim();
    }

    if (topicId) {
      filter.topicId =
        String(topicId).trim();
    }

    const lessons =
      await Lesson.find(filter)
        .sort({
          subjectId: 1,
          topicId: 1,
          orderIndex: 1,
        })
        .lean();

    return res.status(200).json({
      success: true,
      count: lessons.length,
      data: lessons,
    });
  } catch (error) {
    console.error(
      "getSoftwareLessons error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load lessons.",
    });
  }
};

/**
 * Get past questions.
 *
 * Never return 100,000 questions in one response.
 */
export const getSoftwarePastQuestions =
  async (req, res) => {
    try {
      const {
        subjectId,
        topicId,
        year,
        page = 1,
        limit = 500,
      } = req.query;

      const filter = {};

      if (subjectId) {
        filter.subjectId =
          String(subjectId).trim();
      }

      if (topicId) {
        filter.topicId =
          String(topicId).trim();
      }

      if (year) {
        const numericYear =
          Number(year);

        if (
          Number.isFinite(numericYear)
        ) {
          filter.year =
            numericYear;
        }
      }

      const currentPage =
        Math.max(
          Number(page) || 1,
          1
        );

      const perPage =
        Math.min(
          Math.max(
            Number(limit) || 500,
            1
          ),
          1000
        );

      const skip =
        (currentPage - 1) *
        perPage;

      const [
        questions,
        total,
      ] = await Promise.all([
        PastQuestion.find(filter)
          .sort({
            year: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(perPage)
          .lean(),

        PastQuestion.countDocuments(
          filter
        ),
      ]);

      const totalPages =
        Math.ceil(
          total / perPage
        );

      return res.status(200).json({
        success: true,

        data: questions,

        pagination: {
          page: currentPage,
          limit: perPage,
          total,
          totalPages,

          hasNextPage:
            currentPage <
            totalPages,

          hasPreviousPage:
            currentPage > 1,
        },
      });
    } catch (error) {
      console.error(
        "getSoftwarePastQuestions error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load past questions.",
      });
    }
  };