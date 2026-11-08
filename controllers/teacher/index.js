import Usercbt from "../../model/Users.js";
import SoftwareToken from "../../model/SoftwareToken.js";
import mongoose from "mongoose";
/*
|--------------------------------------------------------------------------
| GET TEACHER DASHBOARD
|--------------------------------------------------------------------------
|
| GET /teacher/dashboard
|
| Returns:
| - Teacher information
| - Total students created by teacher
| - Students that have purchased/accessed a token
| - Students not subscribed
| - Teacher subscription
| - Teacher access token
|
|--------------------------------------------------------------------------
*/

export const getTeacherDashboard = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | LOGGED IN TEACHER
    |--------------------------------------------------------------------------
    */

    const teacherId =
      req.user?._id ||
      req.user?.id;

    if (!teacherId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated teacher not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | GET TEACHER
    |--------------------------------------------------------------------------
    */

    const teacher = await Usercbt.findOne({
      _id: teacherId,
      role: "teacher",
    })
      .select(
        "_id firstName middleName lastName email phone avatar role adminOwner commissionPercentage softwareToken status createdAt"
      )
      .lean();

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher account not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | TOTAL STUDENTS
    |--------------------------------------------------------------------------
    |
    | Only students belonging to this teacher.
    |
    | student.teacherOwner === teacher._id
    |
    |--------------------------------------------------------------------------
    */

    const totalStudentsCreated =
      await Usercbt.countDocuments({
        role: "student",
        teacherOwner: teacher._id,
      });
      console.log(totalStudentsCreated);
      
    /*log
    |--------------------------------------------------------------------------
    | SUBSCRIBED STUDENTS
    |--------------------------------------------------------------------------
    |
    | A student is treated as subscribed when the student
    | has a softwareToken.
    |
    |--------------------------------------------------------------------------
    */

    const totalStudentsSubscribed =
      await Usercbt.countDocuments({
        role: "student",
        teacherOwner: teacher._id,

        softwareToken: {
          $ne: null,
        },
      });
      console.log(totalStudentsSubscribed);
      
    /*
    |--------------------------------------------------------------------------
    | NOT SUBSCRIBED
    |--------------------------------------------------------------------------
    */

    const totalStudentsNotSubscribed =
      Math.max(
        totalStudentsCreated -
          totalStudentsSubscribed,
        0
      );

    /*
    |--------------------------------------------------------------------------
    | FIND TEACHER TOKEN
    |--------------------------------------------------------------------------
    |
    | First try the token saved on Usercbt.softwareToken.
    |
    | If it is not there, find the latest token owned
    | by this teacher.
    |
    |--------------------------------------------------------------------------
    */

    let teacherToken = null;

    if (teacher.softwareToken) {
      teacherToken =
        await SoftwareToken.findOne({
          _id: teacher.softwareToken,
          owner: teacher._id,
        })
          .select(
            "token plan amount paymentReference status activatedBy activatedAt expiresAt features deviceLimit deviceCount createdAt updatedAt"
          )
          .lean();
    }
    console.log(teacherToken);
    
    /*
    |--------------------------------------------------------------------------
    | FALLBACK TOKEN SEARCH
    |--------------------------------------------------------------------------
    */

    if (!teacherToken) {
      teacherToken =
        await SoftwareToken.findOne({
          owner: teacher._id,
        })
          .sort({
            createdAt: -1,
          })
          .select(
            "token plan amount paymentReference status activatedBy activatedAt expiresAt features deviceLimit deviceCount createdAt updatedAt"
          )
          .lean();
    }

    /*
    |--------------------------------------------------------------------------
    | SUBSCRIPTION STATUS
    |--------------------------------------------------------------------------
    */

    let subscriptionStatus =
      "Inactive";

    let subscription =
      "No Subscription";

    if (teacherToken) {
      subscription =
        teacherToken.plan ||
        "Full Package";

      /*
      |--------------------------------------------------------------------------
      | STATUS
      |--------------------------------------------------------------------------
      */

      const tokenStatus =
        String(
          teacherToken.status || ""
        ).toLowerCase();

      if (
        tokenStatus === "active"
      ) {
        subscriptionStatus =
          "Active";
      } else if (
        tokenStatus === "unused"
      ) {
        subscriptionStatus =
          "Pending";
      } else if (
        tokenStatus === "expired"
      ) {
        subscriptionStatus =
          "Expired";
      } else if (
        tokenStatus === "revoked"
      ) {
        subscriptionStatus =
          "Inactive";
      } else {
        subscriptionStatus =
          "Inactive";
      }

      /*
      |--------------------------------------------------------------------------
      | EXPIRED DATE CHECK
      |--------------------------------------------------------------------------
      */

      if (
        teacherToken.expiresAt &&
        new Date(
          teacherToken.expiresAt
        ).getTime() <
          Date.now()
      ) {
        subscriptionStatus =
          "Expired";
      }
    }

    /*
    |--------------------------------------------------------------------------
    | TEACHER NAME
    |--------------------------------------------------------------------------
    */

    const teacherName = [
      teacher.firstName,
      teacher.middleName,
      teacher.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      teacher: {
        id: teacher._id,
        name:
          teacherName ||
          "Teacher",
        firstName:
          teacher.firstName,
        middleName:
          teacher.middleName,
        lastName:
          teacher.lastName,
        email:
          teacher.email,
        phone:
          teacher.phone,
        avatar:
          teacher.avatar,
        role:
          teacher.role,
        status:
          teacher.status,
        adminOwner:
          teacher.adminOwner,
        commissionPercentage:
          teacher.commissionPercentage,
        createdAt:
          teacher.createdAt,
      },

      /*
      |--------------------------------------------------------------------------
      | DASHBOARD
      |--------------------------------------------------------------------------
      */

      dashboard: {
        totalStudentsCreated,

        totalStudentsSubscribed,

        totalStudentsNotSubscribed,

        subscription,

        subscriptionStatus,
      },

      /*
      |--------------------------------------------------------------------------
      | TEACHER TOKEN
      |--------------------------------------------------------------------------
      */

      teacherToken: teacherToken
        ? {
            id:
              teacherToken._id,

            code:
              teacherToken.token,

            plan:
              teacherToken.plan,

            amount:
              teacherToken.amount,

            paymentReference:
              teacherToken.paymentReference,

            status:
              teacherToken.status,

            activatedBy:
              teacherToken.activatedBy,

            activatedAt:
              teacherToken.activatedAt,

            expiresAt:
              teacherToken.expiresAt,

            features:
              teacherToken.features || [],

            deviceLimit:
              teacherToken.deviceLimit,

            deviceCount:
              teacherToken.deviceCount,

            createdAt:
              teacherToken.createdAt,

            updatedAt:
              teacherToken.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error(
      "Teacher dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Unable to load teacher dashboard",
    });
  }
};




/*
|--------------------------------------------------------------------------
| CLEAN STUDENT
|--------------------------------------------------------------------------
*/

const cleanStudent = (student) => {
  const data = student?.toObject
    ? student.toObject()
    : student;

  return {
    _id: data._id,

    firstName: data.firstName,
    middleName: data.middleName,
    lastName: data.lastName,

    email: data.email,

    phone: data.phone,

    whatsapp_no:
      data.whatsapp_no,

    avatar: data.avatar,

    location:
      data.location,

    role: data.role,

    status: data.status,

    ExamYear:
      data.ExamYear,

    lastLogin:
      data.lastLogin,

    emailVerified:
      data.emailVerified,

    createdBy:
      data.createdBy,

    createdByRole:
      data.createdByRole,

    adminOwner:
      data.adminOwner || null,

    teacherOwner:
      data.teacherOwner || null,

    softwareToken:
      data.softwareToken || null,

    createdAt:
      data.createdAt,

    updatedAt:
      data.updatedAt,
  };
};

/*
|--------------------------------------------------------------------------
| GET TEACHER TOKEN SUMMARY
|--------------------------------------------------------------------------
|
| Only counts tokens belonging to students of the
| currently logged-in teacher.
|
|--------------------------------------------------------------------------
*/

const getTeacherTokenSummary = async (
  teacherId
) => {
  /*
  |--------------------------------------------------------------------------
  | FIND TEACHER'S STUDENTS
  |--------------------------------------------------------------------------
  */

  const students =
    await Usercbt.find({
      role: "student",
      teacherOwner: teacherId,
    })
      .select("_id softwareToken")
      .lean();

  /*
  |--------------------------------------------------------------------------
  | NO STUDENTS
  |--------------------------------------------------------------------------
  */

  if (!students.length) {
    return {
      totalTokens: 0,

      activeTokens: 0,

      unusedTokens: 0,

      usedTokens: 0,

      expiredTokens: 0,

      revokedTokens: 0,

      studentsWithToken: 0,

      studentsWithoutToken: 0,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | TOKEN IDS
  |--------------------------------------------------------------------------
  */

  const tokenIds = students
    .map(
      (student) =>
        student.softwareToken
    )
    .filter(Boolean);

  /*
  |--------------------------------------------------------------------------
  | DEFAULT SUMMARY
  |--------------------------------------------------------------------------
  */

  const summary = {
    totalTokens: 0,

    activeTokens: 0,

    unusedTokens: 0,

    usedTokens: 0,

    expiredTokens: 0,

    revokedTokens: 0,

    studentsWithToken: 0,

    studentsWithoutToken: 0,
  };

  /*
  |--------------------------------------------------------------------------
  | TOKEN COUNTS
  |--------------------------------------------------------------------------
  */

  if (tokenIds.length) {
    const counts =
      await SoftwareToken.aggregate([
        {
          $match: {
            _id: {
              $in: tokenIds,
            },
          },
        },

        {
          $group: {
            _id: "$status",

            count: {
              $sum: 1,
            },
          },
        },
      ]);

    for (const item of counts) {
      const count =
        Number(item.count) || 0;

      summary.totalTokens +=
        count;

      switch (item._id) {
        case "active":
          summary.activeTokens =
            count;
          break;

        case "unused":
          summary.unusedTokens =
            count;
          break;

        case "used":
          summary.usedTokens =
            count;
          break;

        case "expired":
          summary.expiredTokens =
            count;
          break;

        case "revoked":
          summary.revokedTokens =
            count;
          break;
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | STUDENTS WITH / WITHOUT TOKEN
  |--------------------------------------------------------------------------
  */

  summary.studentsWithToken =
    students.filter(
      (student) =>
        Boolean(
          student.softwareToken
        )
    ).length;

  summary.studentsWithoutToken =
    students.length -
    summary.studentsWithToken;

  return summary;
};

/*
|--------------------------------------------------------------------------
| GET /api/teacher/students
|--------------------------------------------------------------------------
|
| Logged-in teacher can ONLY see students where:
|
|     student.teacherOwner === req.user._id
|
|--------------------------------------------------------------------------
*/

export const getStudents = async (
  req,
  res,
  next
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | CURRENT TEACHER
    |--------------------------------------------------------------------------
    */

    const teacherId =
      req.user?._id;

    if (!teacherId) {
      return res.status(401).json({
        success: false,

        message:
          "Teacher session not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | TEACHER ACCESS
    |--------------------------------------------------------------------------
    */

    if (
      req.user.role !==
      "teacher"
    ) {
      return res.status(403).json({
        success: false,

        message:
          "Only teachers can access their students",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | QUERY
    |--------------------------------------------------------------------------
    */

    const {
      search = "",
      status,
      examYear,
      tokenStatus,
      page = 1,
      limit = 20,
    } = req.query;

    /*
    |--------------------------------------------------------------------------
    | PAGINATION
    |--------------------------------------------------------------------------
    */

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const currentLimit =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

    const skip =
      (currentPage - 1) *
      currentLimit;

    /*
    |--------------------------------------------------------------------------
    | MAIN SECURITY FILTER
    |--------------------------------------------------------------------------
    |
    | The teacher ID comes ONLY from req.user.
    |
    */

    const filter = {
      role: "student",

      teacherOwner: teacherId,
    };

    /*
    |--------------------------------------------------------------------------
    | ACCOUNT STATUS
    |--------------------------------------------------------------------------
    */

    if (status) {
      const allowedStatuses = [
        "Active",
        "Suspended",
        "Inactive",
      ];

      const normalizedStatus =
        String(status).trim();

      if (
        !allowedStatuses.includes(
          normalizedStatus
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid student status",
        });
      }

      filter.status =
        normalizedStatus;
    }

    /*
    |--------------------------------------------------------------------------
    | EXAM YEAR
    |--------------------------------------------------------------------------
    */

    if (examYear) {
      const year =
        Number(examYear);

      if (
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2100
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid exam year",
        });
      }

      filter.ExamYear = year;
    }

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    const andFilters = [];

    if (
      typeof search ===
        "string" &&
      search.trim()
    ) {
      const escapedSearch =
        search
          .trim()
          .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

      const searchRegex =
        new RegExp(
          escapedSearch,
          "i"
        );

      andFilters.push({
        $or: [
          {
            firstName:
              searchRegex,
          },

          {
            middleName:
              searchRegex,
          },

          {
            lastName:
              searchRegex,
          },

          {
            email:
              searchRegex,
          },

          {
            phone:
              searchRegex,
          },

          {
            whatsapp_no:
              searchRegex,
          },
        ],
      });
    }

    /*
    |--------------------------------------------------------------------------
    | TOKEN STATUS
    |--------------------------------------------------------------------------
    |
    | Supported:
    |
    | all
    | none
    | active
    | unused
    | used
    | expired
    | revoked
    |
    |--------------------------------------------------------------------------
    */

    if (tokenStatus) {
      const allowedTokenStatuses = [
        "all",
        "none",
        "active",
        "unused",
        "used",
        "expired",
        "revoked",
      ];

      const normalizedTokenStatus =
        String(tokenStatus)
          .trim()
          .toLowerCase();

      if (
        !allowedTokenStatuses.includes(
          normalizedTokenStatus
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid token status",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | WITHOUT TOKEN
      |--------------------------------------------------------------------------
      */

      if (
        normalizedTokenStatus ===
        "none"
      ) {
        andFilters.push({
          $or: [
            {
              softwareToken:
                null,
            },

            {
              softwareToken: {
                $exists: false,
              },
            },
          ],
        });
      }

      /*
      |--------------------------------------------------------------------------
      | SPECIFIC TOKEN STATUS
      |--------------------------------------------------------------------------
      */

      else if (
        normalizedTokenStatus !==
        "all"
      ) {
        /*
        | IMPORTANT:
        | Only find token IDs belonging to the
        | currently logged-in teacher's students.
        */

        const teacherStudents =
          await Usercbt.find({
            role: "student",

            teacherOwner:
              teacherId,
          })
            .select(
              "_id softwareToken"
            )
            .lean();

        const teacherTokenIds =
          teacherStudents
            .map(
              (student) =>
                student.softwareToken
            )
            .filter(Boolean);

        if (
          !teacherTokenIds.length
        ) {
          return res.status(200).json({
            success: true,

            students: [],

            summary:
              await getTeacherTokenSummary(
                teacherId
              ),

            pagination: {
              page: currentPage,

              limit: currentLimit,

              total: 0,

              totalPages: 0,
            },
          });
        }

        /*
        |--------------------------------------------------------------------------
        | FIND ONLY TOKENS BELONGING
        | TO THIS TEACHER'S STUDENTS
        |--------------------------------------------------------------------------
        */

        const matchingTokens =
          await SoftwareToken.find({
            _id: {
              $in:
                teacherTokenIds,
            },

            status:
              normalizedTokenStatus,
          })
            .select("_id")
            .lean();

        const matchingTokenIds =
          matchingTokens.map(
            (token) =>
              token._id
          );

        if (
          !matchingTokenIds.length
        ) {
          return res.status(200).json({
            success: true,

            students: [],

            summary:
              await getTeacherTokenSummary(
                teacherId
              ),

            pagination: {
              page: currentPage,

              limit: currentLimit,

              total: 0,

              totalPages: 0,
            },
          });
        }

        andFilters.push({
          softwareToken: {
            $in:
              matchingTokenIds,
          },
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | APPLY $AND FILTERS
    |--------------------------------------------------------------------------
    */

    if (andFilters.length) {
      filter.$and =
        andFilters;
    }

    /*
    |--------------------------------------------------------------------------
    | GET STUDENTS + COUNTS
    |--------------------------------------------------------------------------
    */

    const [
      students,
      filteredStudentTotal,
      totalStudents,
    ] = await Promise.all([
      /*
      |--------------------------------------------------------------------------
      | STUDENTS
      |--------------------------------------------------------------------------
      */

      Usercbt.find(filter)
        .select(
          "-password " +
            "-refreshToken " +
            "-emailVerificationToken " +
            "-resetPasswordToken"
        )

        /*
        |--------------------------------------------------------------------------
        | SOFTWARE TOKEN
        |--------------------------------------------------------------------------
        */

        .populate({
          path: "softwareToken",

          select:
            "token " +
            "owner " +
            "status " +
            "plan " +
            "amount " +
            "paymentReference " +
            "activatedBy " +
            "activatedAt " +
            "expiresAt " +
            "features " +
            "deviceLimit " +
            "deviceCount " +
            "createdAt " +
            "updatedAt",
        })

        /*
        |--------------------------------------------------------------------------
        | ADMIN
        |--------------------------------------------------------------------------
        */

        .populate({
          path: "adminOwner",

          select:
            "firstName " +
            "middleName " +
            "lastName " +
            "email " +
            "avatar " +
            "phone " +
            "role",
        })

        .sort({
          createdAt: -1,
        })

        .skip(skip)

        .limit(currentLimit)

        .lean(),

      /*
      |--------------------------------------------------------------------------
      | FILTERED TOTAL
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments(
        filter
      ),

      /*
      |--------------------------------------------------------------------------
      | TOTAL STUDENTS FOR THIS TEACHER
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        role: "student",

        teacherOwner:
          teacherId,
      }),
    ]);

    /*
    |--------------------------------------------------------------------------
    | BUILD RESULT
    |--------------------------------------------------------------------------
    */

    const result =
      students.map(
        (student) => {
          const cleanedStudent =
            cleanStudent(
              student
            );

          /*
          |--------------------------------------------------------------------------
          | SOFTWARE TOKEN
          |--------------------------------------------------------------------------
          */

          let softwareToken =
            null;

          if (
            student.softwareToken
          ) {
            const token =
              student.softwareToken;

            /*
            |--------------------------------------------------------------------------
            | MASK TOKEN
            |--------------------------------------------------------------------------
            */

            let maskedToken =
              null;

            if (token.token) {
              const parts =
                token.token.split(
                  "-"
                );

              if (
                parts.length >= 4
              ) {
                maskedToken =
                  `${parts[0]}-****-****-${parts[3]}`;
              } else {
                maskedToken =
                  `${"*".repeat(
                    Math.max(
                      token.token
                        .length -
                        4,
                      0
                    )
                  )}${token.token.slice(
                    -4
                  )}`;
              }
            }

            softwareToken = {
              _id:
                token._id,

              maskedToken,

              status:
                token.status,

              plan:
                token.plan,

              amount:
                token.amount,

              paymentReference:
                token.paymentReference,

              owner:
                token.owner,

              activatedBy:
                token.activatedBy,

              activatedAt:
                token.activatedAt,

              expiresAt:
                token.expiresAt,

              features:
                token.features ||
                [],

              deviceLimit:
                token.deviceLimit,

              deviceCount:
                token.deviceCount,

              createdAt:
                token.createdAt,

              updatedAt:
                token.updatedAt,
            };
          }

          /*
          |--------------------------------------------------------------------------
          | ADMIN
          |--------------------------------------------------------------------------
          */

          let admin = null;

          if (
            student.adminOwner
          ) {
            admin = {
              _id:
                student
                  .adminOwner
                  ._id,

              firstName:
                student
                  .adminOwner
                  .firstName,

              middleName:
                student
                  .adminOwner
                  .middleName,

              lastName:
                student
                  .adminOwner
                  .lastName,

              email:
                student
                  .adminOwner
                  .email,

              avatar:
                student
                  .adminOwner
                  .avatar,

              phone:
                student
                  .adminOwner
                  .phone,

              role:
                student
                  .adminOwner
                  .role,
            };
          }

          /*
          |--------------------------------------------------------------------------
          | FINAL STUDENT
          |--------------------------------------------------------------------------
          */

          return {
            ...cleanedStudent,

            softwareToken,

            /*
            | Teacher is the currently logged-in
            | teacher, so no need to query/populate
            | another teacher.
            */

            teacher: {
              _id: teacherId,

              role: "teacher",
            },

            admin,
          };
        }
      );

    /*
    |--------------------------------------------------------------------------
    | TOKEN SUMMARY
    |--------------------------------------------------------------------------
    */

    const tokenSummary =
      await getTeacherTokenSummary(
        teacherId
      );

    /*
    |--------------------------------------------------------------------------
    | GET CURRENT TEACHER
    |--------------------------------------------------------------------------
    */

    const teacher =
      await Usercbt.findOne({
        _id: teacherId,

        role: "teacher",
      })
        .select(
          "_id firstName middleName lastName email phone avatar role status adminOwner commissionPercentage createdAt"
        )
        .lean();

    /*
    |--------------------------------------------------------------------------
    | TEACHER NOT FOUND
    |--------------------------------------------------------------------------
    */

    if (!teacher) {
      return res.status(404).json({
        success: false,

        message:
          "Teacher account not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      /*
      |--------------------------------------------------------------------------
      | TEACHER
      |--------------------------------------------------------------------------
      */

      teacher: {
        _id:
          teacher._id,

        firstName:
          teacher.firstName,

        middleName:
          teacher.middleName,

        lastName:
          teacher.lastName,

        email:
          teacher.email,

        phone:
          teacher.phone,

        avatar:
          teacher.avatar,

        role:
          teacher.role,

        status:
          teacher.status,

        adminOwner:
          teacher.adminOwner,

        commissionPercentage:
          teacher.commissionPercentage,

        createdAt:
          teacher.createdAt,
      },

      /*
      |--------------------------------------------------------------------------
      | STUDENTS
      |--------------------------------------------------------------------------
      */

      students:
        result,

      /*
      |--------------------------------------------------------------------------
      | SUMMARY
      |--------------------------------------------------------------------------
      */

      summary: {
        totalStudents,

        totalTokens:
          tokenSummary.totalTokens,

        activeTokens:
          tokenSummary.activeTokens,

        unusedTokens:
          tokenSummary.unusedTokens,

        usedTokens:
          tokenSummary.usedTokens,

        expiredTokens:
          tokenSummary.expiredTokens,

        revokedTokens:
          tokenSummary.revokedTokens,

        studentsWithToken:
          tokenSummary.studentsWithToken,

        studentsWithoutToken:
          tokenSummary.studentsWithoutToken,
      },

      /*
      |--------------------------------------------------------------------------
      | PAGINATION
      |--------------------------------------------------------------------------
      */

      pagination: {
        page:
          currentPage,

        limit:
          currentLimit,

        total:
          filteredStudentTotal,

        totalPages:
          Math.ceil(
            filteredStudentTotal /
              currentLimit
          ),
      },
    });
  } catch (error) {
    console.error(
      "getTeacherStudents error:",
      error
    );

    next(error);
  }
};