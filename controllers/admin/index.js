
import mongoose from "mongoose";

import Usercbt from "../../model/Users.js";
import Payment from "../../model/Payment.js";
import SoftwareToken from "../../model/SoftwareToken.js";
 
const cleanTeacher = (teacher) => {
  const data = teacher?.toObject
    ? teacher.toObject()
    : teacher;

  return {
    _id: data._id,

    firstName: data.firstName,
    middleName: data.middleName,
    lastName: data.lastName,

    email: data.email,
    phone: data.phone,
    whatsapp_no: data.whatsapp_no,

    avatar: data.avatar,

    location: data.location,

    role: data.role,
    status: data.status,

    lastLogin: data.lastLogin,

    emailVerified: data.emailVerified,

    createdBy: data.createdBy,
    createdByRole: data.createdByRole,

    adminOwner: data.adminOwner || null,
    teacherOwner: data.teacherOwner || null,

    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

/*
|--------------------------------------------------------------------------
| GET ALL TEACHERS
|--------------------------------------------------------------------------
|
| ADMIN ONLY
|
| The currently logged-in admin is taken from:
|
|     req.user._id
|
| We DO NOT trust:
|
|     req.query.adminId
|
| Therefore an admin can only see teachers belonging to himself.
|
|--------------------------------------------------------------------------
*/

export const getTeachers = async (req, res, next) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | CURRENT ADMIN
    |--------------------------------------------------------------------------
    */

    const adminId = req.user?._id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Admin session not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | OPTIONAL ROLE CHECK
    |--------------------------------------------------------------------------
    |
    | Authentication middleware should already have populated req.user.
    | This only prevents students/teachers from using this endpoint.
    |
    */

    if (
      req.user.role !== "admin" &&
      req.user.role !== "superadmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Only administrators can access teachers",
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

    const currentLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (currentPage - 1) * currentLimit;

    /*
    |--------------------------------------------------------------------------
    | BASE TEACHER FILTER
    |--------------------------------------------------------------------------
    |
    | THIS IS THE MOST IMPORTANT PART.
    |
    | Only teachers owned by the currently logged-in admin
    | are returned.
    |
    */

    const filter = {
      role: "teacher",
      adminOwner: adminId,
    };

    /*
    |--------------------------------------------------------------------------
    | STATUS FILTER
    |--------------------------------------------------------------------------
    */

    if (status) {
      const allowedStatuses = [
        "Active",
        "Suspended",
        "Inactive",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid teacher status",
        });
      }

      filter.status = status;
    }

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    if (search.trim()) {
      const escapedSearch = search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const searchRegex = new RegExp(
        escapedSearch,
        "i"
      );

      filter.$or = [
        {
          firstName: searchRegex,
        },
        {
          middleName: searchRegex,
        },
        {
          lastName: searchRegex,
        },
        {
          email: searchRegex,
        },
        {
          phone: searchRegex,
        },
        {
          whatsapp_no: searchRegex,
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | GET TEACHERS
    |--------------------------------------------------------------------------
    */

    const teachers = await Usercbt.find(filter)
      .select(
        "-password " +
        "-refreshToken " +
        "-emailVerificationToken " +
        "-resetPasswordToken"
      )
      .populate({
        path: "adminOwner",
        select:
          "firstName middleName lastName email avatar phone role",
      })
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(currentLimit)
      .lean();

    /*
    |--------------------------------------------------------------------------
    | TOTAL TEACHERS FOR THIS ADMIN
    |--------------------------------------------------------------------------
    */

    const totalTeachers = await Usercbt.countDocuments({
      role: "teacher",
      adminOwner: adminId,
    });

    /*
    |--------------------------------------------------------------------------
    | TOTAL STUDENTS FOR THIS ADMIN
    |--------------------------------------------------------------------------
    |
    | Includes:
    |
    | 1. Students registered directly by admin
    | 2. Students registered by teachers belonging to admin
    |
    */

    const totalStudents = await Usercbt.countDocuments({
      role: "student",
      adminOwner: adminId,
    });

    /*
    |--------------------------------------------------------------------------
    | TEACHER IDS
    |--------------------------------------------------------------------------
    */

    const teacherIds = teachers.map(
      (teacher) => teacher._id
    );

    /*
    |--------------------------------------------------------------------------
    | STUDENT COUNTS
    |--------------------------------------------------------------------------
    |
    | We count ONLY students:
    |
    | role = student
    | adminOwner = CURRENT ADMIN
    | teacherOwner = one of this admin's teachers
    |
    |--------------------------------------------------------------------------
    */

    const studentCounts =
      teacherIds.length
        ? await Usercbt.aggregate([
            /*
            |--------------------------------------------------------------------------
            | FIND STUDENTS
            |--------------------------------------------------------------------------
            */

            {
              $match: {
                role: "student",

                /*
                | IMPORTANT:
                | Prevent another admin's students from appearing.
                */
                adminOwner: adminId,

                teacherOwner: {
                  $in: teacherIds,
                },
              },
            },

            /*
            |--------------------------------------------------------------------------
            | FIND SOFTWARE TOKEN
            |--------------------------------------------------------------------------
            */

            {
              $lookup: {
                from: "softwaretokens",

                localField: "softwareToken",

                foreignField: "_id",

                as: "token",
              },
            },

            /*
            |--------------------------------------------------------------------------
            | GROUP BY TEACHER
            |--------------------------------------------------------------------------
            */

            {
              $group: {
                _id: "$teacherOwner",

                /*
                |--------------------------------------------------------------------------
                | TOTAL STUDENTS
                |--------------------------------------------------------------------------
                */

                totalStudents: {
                  $sum: 1,
                },

                /*
                |--------------------------------------------------------------------------
                | PAID / ACTIVE STUDENTS
                |--------------------------------------------------------------------------
                |
                | SoftwareToken status is lowercase:
                |
                | unused
                | active
                | used
                | expired
                | revoked
                |
                */

                paidStudents: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          {
                            $arrayElemAt: [
                              "$token.status",
                              0,
                            ],
                          },
                          "active",
                        ],
                      },

                      1,

                      0,
                    ],
                  },
                },
              },
            },
          ])
        : [];

    /*
    |--------------------------------------------------------------------------
    | CREATE FAST LOOKUP MAP
    |--------------------------------------------------------------------------
    */

    const studentMap = new Map(
      studentCounts.map((item) => [
        item._id.toString(),

        {
          totalStudents:
            item.totalStudents || 0,

          paidStudents:
            item.paidStudents || 0,
        },
      ])
    );

    /*
    |--------------------------------------------------------------------------
    | FORMAT TEACHERS
    |--------------------------------------------------------------------------
    */

    const result = teachers.map(
      (teacher) => {
        const teacherId =
          teacher._id.toString();

        const counts =
          studentMap.get(teacherId) || {
            totalStudents: 0,
            paidStudents: 0,
          };

        /*
        |--------------------------------------------------------------------------
        | CLEAN TEACHER
        |--------------------------------------------------------------------------
        */

        const cleanedTeacher =
          cleanTeacher(teacher);

        /*
        |--------------------------------------------------------------------------
        | ADMIN INFORMATION
        |--------------------------------------------------------------------------
        */

        let admin = null;

        if (teacher.adminOwner) {
          admin = {
            _id: teacher.adminOwner._id,

            firstName:
              teacher.adminOwner.firstName || "",

            middleName:
              teacher.adminOwner.middleName || null,

            lastName:
              teacher.adminOwner.lastName || null,

            email:
              teacher.adminOwner.email || "",

            phone:
              teacher.adminOwner.phone || null,

            avatar:
              teacher.adminOwner.avatar || null,

            role:
              teacher.adminOwner.role || "admin",
          };
        }

        /*
        |--------------------------------------------------------------------------
        | FINAL TEACHER
        |--------------------------------------------------------------------------
        */

        return {
          ...cleanedTeacher,

          /*
          |--------------------------------------------------------------------------
          | STUDENT COUNTS
          |--------------------------------------------------------------------------
          */

          totalStudents:
            counts.totalStudents,

          paidStudents:
            counts.paidStudents,

          /*
          |--------------------------------------------------------------------------
          | ADMIN
          |--------------------------------------------------------------------------
          */

          admin,
        };
      }
    );

    /*
    |--------------------------------------------------------------------------
    | TOTAL PAGES
    |--------------------------------------------------------------------------
    */

    const totalPages =
      Math.ceil(
        totalTeachers /
          currentLimit
      );

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      teachers: result,

      /*
      |--------------------------------------------------------------------------
      | SUMMARY
      |--------------------------------------------------------------------------
      |
      | These numbers belong ONLY to the logged-in admin.
      |
      */

      summary: {
        totalTeachers,
        totalStudents,
      },

      pagination: {
        page: currentPage,

        limit: currentLimit,

        total: totalTeachers,

        totalPages,
      },
    });
  } catch (error) {
    console.error(
      "getTeachers error:",
      error
    );

    next(error);
  }
};




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
    whatsapp_no: data.whatsapp_no,

    avatar: data.avatar,

    location: data.location,

    role: data.role,
    status: data.status,

    ExamYear: data.ExamYear,

    lastLogin: data.lastLogin,

    emailVerified: data.emailVerified,

    createdBy: data.createdBy,
    createdByRole: data.createdByRole,

    adminOwner: data.adminOwner || null,
    teacherOwner: data.teacherOwner || null,

    softwareToken: data.softwareToken || null,

    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

/*
|--------------------------------------------------------------------------
| GET STUDENTS BELONGING TO A TEACHER
|--------------------------------------------------------------------------
|
| ADMIN ONLY
|
| The logged-in admin can ONLY view students belonging to:
|
|     1. A teacher owned by that admin
|     2. Students owned by that same admin
|
|--------------------------------------------------------------------------
*/

export const getTeacherStudents = async (
  req,
  res,
  next
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | CURRENT ADMIN
    |--------------------------------------------------------------------------
    */

    const adminId = req.user?._id;
    console.log('sddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
    
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Admin session not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | ADMIN ACCESS CHECK
    |--------------------------------------------------------------------------
    */

    if (
      req.user.role !== "admin" &&
      req.user.role !== "superadmin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only administrators can access teacher students",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | TEACHER ID
    |--------------------------------------------------------------------------
    */

    const { teacherId } = req.params;

    /*
    |--------------------------------------------------------------------------
    | VALIDATE TEACHER ID
    |--------------------------------------------------------------------------
    */

    if (
      !mongoose.Types.ObjectId.isValid(
        teacherId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid teacher ID",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FIND TEACHER
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | adminOwner MUST equal the logged-in admin.
    |
    | This prevents Admin A from requesting:
    |
    |     /admin/teachers/<Admin-B-Teacher>/students
    |
    |--------------------------------------------------------------------------
    */

    const teacher = await Usercbt.findOne({
      _id: teacherId,

      role: "teacher",

      adminOwner: adminId,
    })
      .select(
        "_id firstName middleName lastName email phone avatar adminOwner role status createdAt"
      )
      .lean();

    /*
    |--------------------------------------------------------------------------
    | TEACHER NOT FOUND / NOT OWNED BY ADMIN
    |--------------------------------------------------------------------------
    */

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message:
          "Teacher not found or does not belong to this admin",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FIND STUDENTS
    |--------------------------------------------------------------------------
    |
    | A student must satisfy ALL THREE:
    |
    | role = student
    |
    | teacherOwner = this teacher
    |
    | adminOwner = logged-in admin
    |
    |--------------------------------------------------------------------------
    */

    const students = await Usercbt.find({
      role: "student",

      teacherOwner: teacher._id,

      adminOwner: adminId,
    })
      .select(
        "-password " +
        "-refreshToken " +
        "-emailVerificationToken " +
        "-resetPasswordToken"
      )
      .sort({
        createdAt: -1,
      })
      .lean();

    /*
    |--------------------------------------------------------------------------
    | CLEAN STUDENTS
    |--------------------------------------------------------------------------
    */

    const cleanedStudents =
      students.map(cleanStudent);

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      teacher: {
        _id: teacher._id,

        firstName: teacher.firstName,
        middleName: teacher.middleName,
        lastName: teacher.lastName,

        email: teacher.email,
        phone: teacher.phone,

        avatar: teacher.avatar,

        role: teacher.role,
        status: teacher.status,

        adminOwner: teacher.adminOwner,

        createdAt: teacher.createdAt,
      },

      students: cleanedStudents,

      totalStudents:
        cleanedStudents.length,
    });
  } catch (error) {
    console.error(
      "getTeacherStudents error:",
      error
    );

    next(error);
  }
};



/*
|--------------------------------------------------------------------------
| CLEAN STUDENT
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| STUDENT TOKEN SUMMARY
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| This summary is ONLY for the current admin's students.
|
|--------------------------------------------------------------------------
*/

const getStudentTokenSummary = async (adminId) => {
  /*
  |--------------------------------------------------------------------------
  | Find this admin's students
  |--------------------------------------------------------------------------
  */

  const students = await Usercbt.find({
    role: "student",
    adminOwner: adminId,
  })
    .select("_id softwareToken")
    .lean();

  const studentIds = students.map(
    (student) => student._id
  );

  /*
  |--------------------------------------------------------------------------
  | No students
  |--------------------------------------------------------------------------
  */

  if (!studentIds.length) {
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
  | Token IDs attached to these students
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
  | Token counts
  |--------------------------------------------------------------------------
  */

  let tokenSummary = {
    totalTokens: 0,
    activeTokens: 0,
    unusedTokens: 0,
    usedTokens: 0,
    expiredTokens: 0,
    revokedTokens: 0,
  };

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
      const count = item.count || 0;

      tokenSummary.totalTokens += count;

      if (item._id === "active") {
        tokenSummary.activeTokens =
          count;
      }

      if (item._id === "unused") {
        tokenSummary.unusedTokens =
          count;
      }

      if (item._id === "used") {
        tokenSummary.usedTokens =
          count;
      }

      if (item._id === "expired") {
        tokenSummary.expiredTokens =
          count;
      }

      if (item._id === "revoked") {
        tokenSummary.revokedTokens =
          count;
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Students with / without token
  |--------------------------------------------------------------------------
  */

  const studentsWithToken =
    students.filter(
      (student) =>
        Boolean(student.softwareToken)
    ).length;

  const studentsWithoutToken =
    students.length -
    studentsWithToken;

  return {
    ...tokenSummary,

    studentsWithToken,

    studentsWithoutToken,
  };
};

/*
|--------------------------------------------------------------------------
| GET /api/admin/students
|
| Get students belonging ONLY to the logged-in admin
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
    | CURRENT ADMIN
    |--------------------------------------------------------------------------
    */

    const adminId = req.user?._id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message:
          "Admin session not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | ADMIN ACCESS
    |--------------------------------------------------------------------------
    */

    if (
      req.user.role !== "admin" &&
      req.user.role !== "superadmin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only administrators can access students",
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
      teacherId,
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

    const currentLimit = Math.min(
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
    | BASE FILTER
    |--------------------------------------------------------------------------
    |
    | THIS IS THE MAIN SECURITY FILTER.
    |
    | The admin comes from req.user.
    |
    | No adminId from frontend is accepted.
    |
    */

    const filter = {
      role: "student",
      adminOwner: adminId,
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

      if (
        !allowedStatuses.includes(
          String(status)
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid student status",
        });
      }

      filter.status = status;
    }

    /*
    |--------------------------------------------------------------------------
    | EXAM YEAR
    |--------------------------------------------------------------------------
    */

    if (examYear) {
      const year = Number(examYear);

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
    | TEACHER FILTER
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | Teacher must belong to this admin.
    |
    |--------------------------------------------------------------------------
    */

    if (teacherId) {
      if (
        !mongoose.Types.ObjectId.isValid(
          teacherId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid teacher ID",
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Verify teacher belongs to current admin
      |--------------------------------------------------------------------------
      */

      const teacher =
        await Usercbt.findOne({
          _id: teacherId,

          role: "teacher",

          adminOwner: adminId,
        })
          .select("_id")
          .lean();

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message:
            "Teacher not found or does not belong to this admin",
        });
      }

      filter.teacherOwner =
        teacher._id;
    }

    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    if (
      typeof search === "string" &&
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

      filter.$or = [
        {
          firstName: searchRegex,
        },

        {
          middleName: searchRegex,
        },

        {
          lastName: searchRegex,
        },

        {
          email: searchRegex,
        },

        {
          phone: searchRegex,
        },

        {
          whatsapp_no:
            searchRegex,
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | SOFTWARE TOKEN FILTER
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
        "unused",
        "active",
        "used",
        "expired",
        "revoked",
      ];

      const normalizedTokenStatus =
        String(tokenStatus)
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
      | STUDENTS WITHOUT TOKEN
      |--------------------------------------------------------------------------
      */

      if (
        normalizedTokenStatus ===
        "none"
      ) {
        filter.$or = [
          {
            softwareToken: null,
          },

          {
            softwareToken: {
              $exists: false,
            },
          },
        ];
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
        |--------------------------------------------------------------------------
        | Find tokens
        |--------------------------------------------------------------------------
        */

        const tokens =
          await SoftwareToken.find({
            status:
              normalizedTokenStatus,
          })
            .select(
              "_id owner activatedBy"
            )
            .lean();

        const tokenIds =
          tokens.map(
            (token) =>
              token._id
          );

        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |
        | We filter students using their softwareToken field.
        |
        | This prevents another admin's token ownership
        | from accidentally exposing their students.
        |--------------------------------------------------------------------------
        */

        if (!tokenIds.length) {
          return res.status(200).json({
            success: true,

            students: [],

            summary:
              await getStudentTokenSummary(
                adminId
              ),

            pagination: {
              page: currentPage,
              limit: currentLimit,
              total: 0,
              totalPages: 0,
            },
          });
        }

        filter.softwareToken = {
          $in: tokenIds,
        };
      }
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
      totalTeachers,
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
        | TEACHER
        |--------------------------------------------------------------------------
        */

        .populate({
          path: "teacherOwner",

          select:
            "firstName " +
            "middleName " +
            "lastName " +
            "email " +
            "avatar " +
            "phone " +
            "role " +
            "adminOwner",
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
      | TOTAL STUDENTS FOR THIS ADMIN
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        role: "student",
        adminOwner: adminId,
      }),

      /*
      |--------------------------------------------------------------------------
      | TOTAL TEACHERS FOR THIS ADMIN
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        role: "teacher",
        adminOwner: adminId,
      }),
    ]);

    /*
    |--------------------------------------------------------------------------
    | BUILD RESULT
    |--------------------------------------------------------------------------
    */

    const result = students.map(
      (student) => {
        const cleanedStudent =
          cleanStudent(student);

        /*
        |--------------------------------------------------------------------------
        | SOFTWARE TOKEN
        |--------------------------------------------------------------------------
        */

        let softwareToken = null;

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

          let maskedToken = null;

          if (token.token) {
            const parts =
              token.token.split("-");

            if (
              parts.length >= 4
            ) {
              maskedToken =
                `${parts[0]}-****-****-${parts[3]}`;
            } else {
              const tokenLength =
                token.token.length;

              maskedToken =
                `${"*".repeat(
                  Math.max(
                    tokenLength - 4,
                    0
                  )
                )}${token.token.slice(
                  -4
                )}`;
            }
          }

          softwareToken = {
            _id: token._id,

            maskedToken,

            status:
              token.status,

            owner:
              token.owner,

            activatedBy:
              token.activatedBy,

            activatedAt:
              token.activatedAt,

            expiresAt:
              token.expiresAt,

            features:
              token.features || [],

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
        | TEACHER
        |--------------------------------------------------------------------------
        */

        const teacher =
          student.teacherOwner
            ? {
                _id:
                  student
                    .teacherOwner
                    ._id,

                firstName:
                  student
                    .teacherOwner
                    .firstName,

                middleName:
                  student
                    .teacherOwner
                    .middleName,

                lastName:
                  student
                    .teacherOwner
                    .lastName,

                email:
                  student
                    .teacherOwner
                    .email,

                avatar:
                  student
                    .teacherOwner
                    .avatar,

                phone:
                  student
                    .teacherOwner
                    .phone,

                role:
                  student
                    .teacherOwner
                    .role,

                adminOwner:
                  student
                    .teacherOwner
                    .adminOwner,
              }
            : null;

        /*
        |--------------------------------------------------------------------------
        | ADMIN
        |--------------------------------------------------------------------------
        */

        const admin =
          student.adminOwner
            ? {
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
              }
            : null;

        /*
        |--------------------------------------------------------------------------
        | FINAL STUDENT
        |--------------------------------------------------------------------------
        */

        return {
          ...cleanedStudent,

          softwareToken,

          teacher,

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
      await getStudentTokenSummary(
        adminId
      );

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      /*
      |--------------------------------------------------------------------------
      | STUDENTS
      |--------------------------------------------------------------------------
      */

      students: result,

      /*
      |--------------------------------------------------------------------------
      | ADMIN-ONLY SUMMARY
      |--------------------------------------------------------------------------
      */

      summary: {
        totalStudents,

        totalTeachers,

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
        page: currentPage,

        limit: currentLimit,

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
      "getStudents error:",
      error
    );

    next(error);
  }
};
