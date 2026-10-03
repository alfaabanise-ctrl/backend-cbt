import SoftwareToken from "../model/softwareToken.js";
import Question from "../model/Question.js";
import { Subject } from "../model/Subject.js";
import { Topic } from "../model/Topic.js";
import { Lesson } from "../model/Lesson.js";

/*
|--------------------------------------------------------------------------
| Helper: Find and validate software token
|--------------------------------------------------------------------------
|
| TESTING VERSION:
| - No login required
| - No req.user required
| - No owner required
| - Token itself is enough
|
*/

const getValidToken = async (token) => {
  if (!token) {
    return {
      error: "Token is required",
      status: 400,
    };
  }

  const cleanToken = String(token).trim().toUpperCase();

  const softwareToken = await SoftwareToken.findOne({
    token: cleanToken,
  });

  if (!softwareToken) {
    return {
      error: "Invalid token",
      status: 404,
    };
  }

  /*
   * Token has been revoked.
   */
  if (softwareToken.status === "revoked") {
    return {
      error: "This token has been revoked",
      status: 403,
    };
  }

  /*
   * Token has expired.
   */
  if (softwareToken.status === "expired") {
    return {
      error: "This token has expired",
      status: 403,
    };
  }

  /*
   * If expiresAt exists, also check the actual date.
   */
  if (
    softwareToken.expiresAt &&
    new Date(softwareToken.expiresAt).getTime() < Date.now()
  ) {
    return {
      error: "This token has expired",
      status: 403,
    };
  }

  return {
    softwareToken,
  };
};

/*
|--------------------------------------------------------------------------
| START DOWNLOAD
|--------------------------------------------------------------------------
|
| POST
| /api/content/download/start
|
| Body:
|
| {
|   "token": "ABANISE-XXXX-XXXX-XXXX"
| }
|
*/

export const startDownload = async (req, res) => {
  try {
    const { token } = req.body;

    const result = await getValidToken(token);

    if (result.error) {
      return res.status(result.status).json({
        success: false,
        message: result.error,
      });
    }

    const softwareToken = result.softwareToken;

    /*
     * For testing we do NOT require a logged-in user.
     *
     * We can still activate an unused token.
     *
     * But we don't attach it to a user because there
     * is no logged-in user in this testing version.
     */

    if (
      softwareToken.status === "unused" ||
      !softwareToken.status
    ) {
      softwareToken.status = "active";
      softwareToken.activatedAt =
        softwareToken.activatedAt || new Date();

      await softwareToken.save();
    }

    /*
     * Count available content.
     */

    const [
      totalSubjects,
      totalTopics,
      totalQuestions,
      totalLearning,
    ] = await Promise.all([
      Subject.countDocuments({
       
      }),

      Topic.countDocuments({
     
      }),

      Question.countDocuments({
       
      }),

      Lesson.countDocuments({
       
      }),
    ]);
    console.log(totalSubjects);
     console.log(totalTopics);
     console.log(totalQuestions);
    console.log(totalLearning);
    const total =
      totalSubjects +
      totalTopics +
      totalQuestions +
      totalLearning;
    console.log(total);
    
    return res.json({
      success: true,

      message: "Content download session started",

      data: {
        token: {
          id: softwareToken._id,
          status: softwareToken.status,
          expiresAt: softwareToken.expiresAt || null,
        },

        content: {
          subjects: totalSubjects,
          topics: totalTopics,
          questions: totalQuestions,
          learning: totalLearning,
          total,
        },

        batchSize: 500,

        version: "1.0.0",
      },
    });
  } catch (error) {
    console.error("startDownload error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to start content download",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DOWNLOAD QUESTIONS
|--------------------------------------------------------------------------
|
| GET
| /api/content/download/questions
|
| Example:
|
| /api/content/download/questions
|   ?token=ABANISE-XXXX
|   &limit=500
|
| Next batch:
|
| /api/content/download/questions
|   ?token=ABANISE-XXXX
|   &limit=500
|   &cursor=XXXXXXXX
|
*/

export const downloadQuestions = async (req, res) => {
  try {
    const {
      token,
      cursor = null,
      limit = 500,
    } = req.query;

    const result = await getValidToken(token);

    if (result.error) {
      return res.status(result.status).json({
        success: false,
        message: result.error,
      });
    }

    const batchSize = Math.min(
      Number(limit) || 500,
      500
    );

    const query = {
     
    };

    /*
     * Cursor pagination.
     */

    if (cursor) {
      query._id = {
        $gt: cursor,
      };
    }

    const questions = await Question.find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();
    console.log(questions);
     console.log(questions.rawData);
    const nextCursor =
      questions.length === batchSize
        ? questions[questions.length - 1]._id
        : null;

    const total = await Question.countDocuments({
     
    });

    return res.json({
      success: true,

      data: {
        items: questions,

        total,

        count: questions.length,

        nextCursor,

        hasMore: Boolean(nextCursor),
      },
    });
  } catch (error) {
    console.error(
      "downloadQuestions error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to download questions",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DOWNLOAD SUBJECTS
|--------------------------------------------------------------------------
|
| GET
| /api/content/download/subjects?token=...
|
*/

export const downloadSubjects = async (req, res) => {
  try {
    const { token } = req.query;

    const result = await getValidToken(token);

    if (result.error) {
      return res.status(result.status).json({
        success: false,
        message: result.error,
      });
    }

    const subjects = await Subject.find({
     
    })
      .sort({ name: 1 })
      .lean();

    return res.json({
      success: true,

      data: {
        items: subjects,
        total: subjects.length,
      },
    });
  } catch (error) {
    console.error(
      "downloadSubjects error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to download subjects",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DOWNLOAD TOPICS
|--------------------------------------------------------------------------
|
| GET
| /api/content/download/topics?token=...
|
*/

export const downloadTopics = async (req, res) => {
  try {
    const { token } = req.query;

    const result = await getValidToken(token);

    if (result.error) {
      return res.status(result.status).json({
        success: false,
        message: result.error,
      });
    }

    const topics = await Topic.find({
     
    })
      .sort({
        subject: 1,
        name: 1,
      })
      .lean();

    return res.json({
      success: true,

      data: {
        items: topics,
        total: topics.length,
      },
    });
  } catch (error) {
    console.error(
      "downloadTopics error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to download topics",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DOWNLOAD LEARNING CONTENT
|--------------------------------------------------------------------------
|
| GET
| /api/content/download/learning
|
| Example:
|
| /api/content/download/learning
|   ?token=ABANISE-XXXX
|   &limit=500
|
*/

export const downloadLearning = async (req, res) => {
  try {
    const {
      token,
      cursor = null,
      limit = 500,
    } = req.query;

    const result = await getValidToken(token);

    if (result.error) {
      return res.status(result.status).json({
        success: false,
        message: result.error,
      });
    }

    const batchSize = Math.min(
      Number(limit) || 500,
      500
    );

    const query = {
     
    };

    /*
     * Cursor pagination.
     */

    if (cursor) {
      query._id = {
        $gt: cursor,
      };
    }

    const items = await Lesson.find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    const nextCursor =
      items.length === batchSize
        ? items[items.length - 1]._id
        : null;

    const total = await Lesson.countDocuments({
      
    });

    return res.json({
      success: true,

      data: {
        items,

        total,

        count: items.length,

        nextCursor,

        hasMore: Boolean(nextCursor),
      },
    });
  } catch (error) {
    console.error(
      "downloadLearning error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to download learning content",
      error: error.message,
    });
  }
};