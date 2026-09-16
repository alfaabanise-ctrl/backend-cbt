import Usercbt from "../../model/Users.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import SoftwareToken from "../../model/SoftwareToken.js"
/*
|--------------------------------------------------------------------------
| Helper
|--------------------------------------------------------------------------
*/

const cleanAdmin = (admin) => {
  const data = admin.toObject ? admin.toObject() : admin;

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

    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};


/*
|--------------------------------------------------------------------------
| GET /api/superadmin/admins
| Get all Admins
|--------------------------------------------------------------------------
*/


export const getAdmins = async (req, res, next) => {
  try {
    const {
      search = "",
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);

    const currentLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip = (currentPage - 1) * currentLimit;

    /* ------------------------------------------------------------------
    | ADMIN FILTER
    |------------------------------------------------------------------ */

    const filter = {
      role: "admin",
    };

    if (status) {
      filter.status = status;
    }

    if (search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");

      filter.$or = [
        { firstName: searchRegex },
        { middleName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    /* ------------------------------------------------------------------
    | GET ADMINS
    |------------------------------------------------------------------ */

    const [admins, total] = await Promise.all([
      Usercbt.find(filter)
        .select(
          "-password -refreshToken -emailVerificationToken -resetPasswordToken"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(currentLimit),

      Usercbt.countDocuments(filter),
    ]);

    /* ------------------------------------------------------------------
    | ADMIN IDS
    |------------------------------------------------------------------ */

    const adminIds = admins.map((admin) => admin._id);

    /* ------------------------------------------------------------------
    | TEACHER COUNTS
    | STUDENT COUNTS
    | PAID STUDENTS
    | UNPAID STUDENTS
    |------------------------------------------------------------------ */

    const [
      teacherCounts,
      studentCounts,
      paidStudentCounts,
    ] = await Promise.all([

      /* --------------------------------------------------------------
      | TOTAL TEACHERS
      |-------------------------------------------------------------- */

      Usercbt.aggregate([
        {
          $match: {
            role: "teacher",
            adminOwner: { $in: adminIds },
          },
        },
        {
          $group: {
            _id: "$adminOwner",
            total: { $sum: 1 },
          },
        },
      ]),

      /* --------------------------------------------------------------
      | TOTAL STUDENTS
      |-------------------------------------------------------------- */

      Usercbt.aggregate([
        {
          $match: {
            role: "student",
            adminOwner: { $in: adminIds },
          },
        },
        {
          $group: {
            _id: "$adminOwner",
            total: { $sum: 1 },
          },
        },
      ]),

      /* --------------------------------------------------------------
      | PAID STUDENTS
      |
      | A student is considered PAID when:
      |
      | student.softwareToken -> SoftwareToken
      | SoftwareToken.status = "active"
      |-------------------------------------------------------------- */

      Usercbt.aggregate([
        {
          $match: {
            role: "student",
            adminOwner: { $in: adminIds },
            softwareToken: { $ne: null },
          },
        },

        {
          $lookup: {
            from: "softwaretokens",
            localField: "softwareToken",
            foreignField: "_id",
            as: "token",
          },
        },

        {
          $unwind: "$token",
        },

        {
          $match: {
            "token.status": "active",
          },
        },

        {
          $group: {
            _id: "$adminOwner",
            total: { $sum: 1 },
          },
        },
      ]),
    ]);

    /* ------------------------------------------------------------------
    | MAP COUNTS
    |------------------------------------------------------------------ */

    const teacherMap = new Map(
      teacherCounts.map((item) => [
        item._id.toString(),
        item.total,
      ])
    );

    const studentMap = new Map(
      studentCounts.map((item) => [
        item._id.toString(),
        item.total,
      ])
    );

    const paidStudentMap = new Map(
      paidStudentCounts.map((item) => [
        item._id.toString(),
        item.total,
      ])
    );

    /* ------------------------------------------------------------------
    | FINAL RESULT
    |------------------------------------------------------------------ */

    const result = admins.map((admin) => {
      const id = admin._id.toString();

      const totalStudents =
        studentMap.get(id) || 0;

      const paidStudents =
        paidStudentMap.get(id) || 0;

      const unpaidStudents =
        Math.max(totalStudents - paidStudents, 0);

      return {
        ...cleanAdmin(admin),

        /* Teachers */
        totalTeachers:
          teacherMap.get(id) || 0,

        /* Students */
        totalStudents,

        /* Payment */
        paidStudents,

        unpaidStudents,
      };
    });

    /* ------------------------------------------------------------------
    | RESPONSE
    |------------------------------------------------------------------ */

    return res.json({
      success: true,

      admins: result,

      pagination: {
        page: currentPage,
        limit: currentLimit,
        total,
        totalPages: Math.ceil(
          total / currentLimit
        ),
      },
    });

  } catch (error) {
    next(error);
  }
};



/*
|--------------------------------------------------------------------------
| GET /api/superadmin/admins/:adminId
| Get one Admin + Teachers + Students
|--------------------------------------------------------------------------
*/

export const getAdmin = async (req, res, next) => {
  try {
    const { adminId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    const admin = await Usercbt.findOne({
      _id: adminId,
      role: "admin",
    }).select(
      "-password -refreshToken -emailVerificationToken -resetPasswordToken"
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    /*
     * Get all teachers belonging to this Admin
     */

    const teachers = await Usercbt.find({
      role: "teacher",
      adminOwner: admin._id,
    }).select(
      "-password -refreshToken -emailVerificationToken -resetPasswordToken"
    );

    /*
     * Get all students belonging to this Admin
     */

    const students = await Usercbt.find({
      role: "student",
      adminOwner: admin._id,
    }).select(
      "-password -refreshToken -emailVerificationToken -resetPasswordToken"
    );

    /*
     * Attach students underneath their Teacher
     */

    const teachersWithStudents = teachers.map((teacher) => {
      const teacherStudents = students.filter(
        (student) =>
          student.teacherOwner &&
          student.teacherOwner.toString() ===
          teacher._id.toString()
      );

      return {
        ...cleanAdmin(teacher),

        students: teacherStudents.map(cleanAdmin),

        totalStudents: teacherStudents.length,
      };
    });

    return res.json({
      success: true,

      admin: cleanAdmin(admin),

      teachers: teachersWithStudents,

      /*
       * Students directly belonging to the Admin
       * but not assigned to a Teacher.
       */

      directStudents: students
        .filter(
          (student) =>
            !student.teacherOwner
        )
        .map(cleanAdmin),

      totalTeachers: teachers.length,

      totalStudents: students.length,
    });
  } catch (error) {
    next(error);
  }
};





/*
|--------------------------------------------------------------------------
| Helper
|--------------------------------------------------------------------------
*/





/*
|--------------------------------------------------------------------------
| GET /api/superadmin/teachers
|--------------------------------------------------------------------------
| Get all Teachers
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| Helper
|--------------------------------------------------------------------------
*/

const cleanTeacher = (teacher) => {
  const data = teacher.toObject
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
| GET /api/superadmin/teachers
|--------------------------------------------------------------------------
| Get all Teachers
|--------------------------------------------------------------------------
*/








/*
|--------------------------------------------------------------------------
| GET ALL TEACHERS
|--------------------------------------------------------------------------
*/

export const getTeachers = async (req, res, next) => {
  try {
    const {
      search = "",
      status,
      adminId,
      page = 1,
      limit = 20,
    } = req.query;


    /*
    |--------------------------------------------------------------------------
    | Pagination
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
    | Teacher Filter
    |--------------------------------------------------------------------------
    */

    const filter = {
      role: "teacher",
    };


    /*
    |--------------------------------------------------------------------------
    | Status Filter
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
    | Admin Filter
    |--------------------------------------------------------------------------
    */

    if (adminId) {
      filter.adminOwner = adminId;
    }


    /*
    |--------------------------------------------------------------------------
    | Search
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
    | Get Teachers
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
    | Summary Counts
    |--------------------------------------------------------------------------
    */

    const [
      totalTeachers,
      totalStudents,
      filteredTeacherTotal,
    ] = await Promise.all([
      Usercbt.countDocuments({
        role: "teacher",
      }),

      Usercbt.countDocuments({
        role: "student",
      }),

      Usercbt.countDocuments(filter),
    ]);


    /*
    |--------------------------------------------------------------------------
    | Teacher IDs
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
    | totalStudents:
    |   Every student belonging to the teacher.
    |
    | paidStudents:
    |   Student has a softwareToken AND
    |   that token has status "active".
    |
    |--------------------------------------------------------------------------
    */

    const studentCounts =
      teacherIds.length
        ? await Usercbt.aggregate([
            /*
            |--------------------------------------------------------------------------
            | Find students belonging to these teachers
            |--------------------------------------------------------------------------
            */

            {
              $match: {
                role: "student",

                teacherOwner: {
                  $in: teacherIds,
                },
              },
            },


            /*
            |--------------------------------------------------------------------------
            | Find student's SoftwareToken
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
            | Count Students
            |--------------------------------------------------------------------------
            */

            {
              $group: {
                _id: "$teacherOwner",

                /*
                |--------------------------------------------------------------------------
                | ALL STUDENTS
                |--------------------------------------------------------------------------
                */

                totalStudents: {
                  $sum: 1,
                },


                /*
                |--------------------------------------------------------------------------
                | PAID STUDENTS
                |--------------------------------------------------------------------------
                |
                | IMPORTANT:
                | SoftwareToken uses:
                |
                | "unused"
                | "active"
                | "used"
                | "expired"
                | "revoked"
                |
                | So we MUST check "active"
                | and NOT "Active".
                |
                |--------------------------------------------------------------------------
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
    | Create Fast Lookup Map
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
    | Format Teachers
    |--------------------------------------------------------------------------
    */

    const result = teachers.map(
      (teacher) => {
        const teacherId =
          teacher._id.toString();


        /*
        |--------------------------------------------------------------------------
        | Student Counts
        |--------------------------------------------------------------------------
        */

        const counts =
          studentMap.get(teacherId) || {
            totalStudents: 0,
            paidStudents: 0,
          };


        /*
        |--------------------------------------------------------------------------
        | Clean Teacher
        |--------------------------------------------------------------------------
        */

        const cleanedTeacher =
          cleanTeacher(teacher);


        /*
        |--------------------------------------------------------------------------
        | Admin Information
        |--------------------------------------------------------------------------
        */

        let admin = null;

        if (teacher.adminOwner) {
          admin = {
            _id:
              teacher.adminOwner._id,

            firstName:
              teacher.adminOwner.firstName ||
              "",

            middleName:
              teacher.adminOwner.middleName ||
              null,

            lastName:
              teacher.adminOwner.lastName ||
              null,

            email:
              teacher.adminOwner.email ||
              "",

            phone:
              teacher.adminOwner.phone ||
              null,

            avatar:
              teacher.adminOwner.avatar ||
              null,

            role:
              teacher.adminOwner.role ||
              "admin",
          };
        }


        /*
        |--------------------------------------------------------------------------
        | Final Teacher Object
        |--------------------------------------------------------------------------
        */

        return {
          ...cleanedTeacher,

          /*
          |--------------------------------------------------------------------------
          | IMPORTANT COUNTS
          |--------------------------------------------------------------------------
          */

          totalStudents:
            counts.totalStudents,

          paidStudents:
            counts.paidStudents,

          /*
          |--------------------------------------------------------------------------
          | Admin
          |--------------------------------------------------------------------------
          */

          admin,
        };
      }
    );


    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      teachers: result,

      summary: {
        totalTeachers,

        totalStudents,
      },

      pagination: {
        page: currentPage,

        limit: currentLimit,

        total:
          filteredTeacherTotal,

        totalPages:
          Math.ceil(
            filteredTeacherTotal /
              currentLimit
          ),
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









/*
|--------------------------------------------------------------------------
| GET /api/superadmin/teachers/:teacherId
|
| Get one Teacher + Students
|--------------------------------------------------------------------------
*/

export const getTeacher = async (
  req,
  res,
  next
) => {
  try {
    const {
      teacherId,
    } = req.params;


    /*
     * Validate ID
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
     * Find Teacher
     */
    const teacher =
      await Usercbt.findOne({
        _id: teacherId,
        role: "teacher",
      }).select(
        "-password -refreshToken -emailVerificationToken -resetPasswordToken"
      );


    /*
     * Teacher not found
     */
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }


    /*
     * Get Admin
     *
     * adminOwner points to
     * the Admin who owns the Teacher.
     */
    let admin = null;

    if (teacher.adminOwner) {
      admin =
        await Usercbt.findOne({
          _id:
            teacher.adminOwner,
          role: "admin",
        }).select(
          "-password -refreshToken -emailVerificationToken -resetPasswordToken"
        );
    }


    /*
     * Get Students
     *
     * Students belonging
     * directly to this Teacher.
     */
    const students =
      await Usercbt.find({
        role: "student",

        teacherOwner:
          teacher._id,
      })
        .select(
          "-password -refreshToken -emailVerificationToken -resetPasswordToken"
        )
        .sort({
          createdAt: -1,
        });


    /*
     * Return response
     */
    return res.json({
      success: true,

      teacher:
        cleanTeacher(
          teacher
        ),

      admin: admin
        ? cleanTeacher(admin)
        : null,

      students:
        students.map(
          cleanTeacher
        ),

      totalStudents:
        students.length,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| GET /api/superadmin/teachers/:teacherId/students
|
| Get students belonging to one Teacher
|--------------------------------------------------------------------------
*/

export const getTeacherStudents =
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        teacherId,
      } = req.params;

      /*
       * Validate Teacher ID
       */
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
       * Make sure Teacher exists
       */
      const teacher =
        await Usercbt.findOne({
          _id: teacherId,
          role: "teacher",
        }).select("_id firstName lastName email adminOwner");


      if (!teacher) {
        return res.status(404).json({
          success: false,
          message:
            "Teacher not found",
        });
      }


      /*
       * Find Students
       */
      const students =
        await Usercbt.find({
          role: "student",

          teacherOwner:
            teacher._id,
        })
          .select(
            "-password -refreshToken -emailVerificationToken -resetPasswordToken"
          )
          .sort({
            createdAt: -1,
          });


      /*
       * Response
       */
      return res.json({
        success: true,

        teacher,

        students:
          students.map(
            cleanTeacher
          ),

        totalStudents:
          students.length,
      });
    } catch (error) {
      next(error);
    }
  };


/*
|--------------------------------------------------------------------------
| PUT /api/superadmin/teachers/:teacherId
|
| Update Teacher
|--------------------------------------------------------------------------
*/






/*
|--------------------------------------------------------------------------
| Helper
|--------------------------------------------------------------------------
*/

const cleanStudent = (student) => {
  const data = student.toObject
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

    ExamYear: data.ExamYear,

    location: data.location,

    role: data.role,

    status: data.status,

    lastLogin: data.lastLogin,

    emailVerified: data.emailVerified,

    subscriptionStatus:
      data.subscriptionStatus,

    createdBy: data.createdBy,
    createdByRole: data.createdByRole,

    adminOwner:
      data.adminOwner || null,

    teacherOwner:
      data.teacherOwner || null,

    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};


/*
|--------------------------------------------------------------------------
| GET /api/superadmin/students
|
| Get all Students
|--------------------------------------------------------------------------
*/


export const getStudents = async (req, res, next) => {
  try {
    const {
      search = "",
      status,
      examYear,
      teacherId,
      adminId,
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
    */

    const filter = {
      role: "student",
    };


    /*
    |--------------------------------------------------------------------------
    | ACCOUNT STATUS
    |--------------------------------------------------------------------------
    */

    if (status) {
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
          message: "Invalid exam year",
        });
      }

      filter.ExamYear = year;
    }


    /*
    |--------------------------------------------------------------------------
    | TEACHER
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
          message: "Invalid teacher ID",
        });
      }

      filter.teacherOwner = teacherId;
    }


    /*
    |--------------------------------------------------------------------------
    | ADMIN
    |--------------------------------------------------------------------------
    */

    if (adminId) {
      if (
        !mongoose.Types.ObjectId.isValid(
          adminId
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid admin ID",
        });
      }

      filter.adminOwner = adminId;
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
      const searchRegex = new RegExp(
        search.trim().replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        ),
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

      if (
        !allowedTokenStatuses.includes(
          String(tokenStatus).toLowerCase()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid token status",
        });
      }

      const normalizedTokenStatus =
        String(tokenStatus).toLowerCase();


      /*
      |--------------------------------------------------------------------------
      | STUDENTS WITH NO TOKEN
      |--------------------------------------------------------------------------
      */

      if (
        normalizedTokenStatus === "none"
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
      | STUDENTS WITH A SPECIFIC TOKEN STATUS
      |--------------------------------------------------------------------------
      */

      else if (
        normalizedTokenStatus !== "all"
      ) {

        const tokenUsers =
          await SoftwareToken.find({
            status:
              normalizedTokenStatus,
          }).select(
            "owner activatedBy"
          );


        const studentIds = [
          ...new Set(
            tokenUsers
              .flatMap((token) => [
                token.owner,
                token.activatedBy,
              ])
              .filter(Boolean)
              .map((id) =>
                id.toString()
              )
          ),
        ];


        /*
        |--------------------------------------------------------------------------
        | No matching students
        |--------------------------------------------------------------------------
        */

        if (!studentIds.length) {
          return res.json({
            success: true,

            students: [],

            summary:
              await getStudentTokenSummary(),

            pagination: {
              page: currentPage,
              limit: currentLimit,
              total: 0,
              totalPages: 0,
            },
          });
        }


        filter._id = {
          $in: studentIds,
        };
      }
    }


    /*
    |--------------------------------------------------------------------------
    | PAGINATED STUDENTS
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

        .limit(currentLimit),


      /*
      |--------------------------------------------------------------------------
      | FILTERED STUDENT TOTAL
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments(
        filter
      ),


      /*
      |--------------------------------------------------------------------------
      | GLOBAL STUDENTS
      |
      | NOT affected by pagination.
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        role: "student",
      }),


      /*
      |--------------------------------------------------------------------------
      | GLOBAL TEACHERS
      |
      | NOT affected by pagination.
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        role: "teacher",
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
          |
          | Example:
          |
          | ABCD-****-****-X7PQ
          |
          |--------------------------------------------------------------------------
          */

          let maskedToken = null;


          if (token.token) {

            const parts =
              token.token.split("-");


            if (parts.length >= 4) {

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
                )}${token.token.slice(-4)}`;
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
        | RETURN STUDENT
        |--------------------------------------------------------------------------
        */

        return {
          ...cleanedStudent,


          /*
          |--------------------------------------------------------------------------
          | SOFTWARE TOKEN
          |--------------------------------------------------------------------------
          */

          softwareToken,


          /*
          |--------------------------------------------------------------------------
          | TEACHER
          |--------------------------------------------------------------------------
          */

          teacher:
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
              : null,


          /*
          |--------------------------------------------------------------------------
          | ADMIN
          |--------------------------------------------------------------------------
          */

          admin:
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
              : null,
        };
      }
    );


    /*
    |--------------------------------------------------------------------------
    | GLOBAL TOKEN SUMMARY
    |--------------------------------------------------------------------------
    */

    const tokenSummary =
      await getStudentTokenSummary();


    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.json({
      success: true,

      /*
      |--------------------------------------------------------------------------
      | PAGINATED STUDENTS
      |--------------------------------------------------------------------------
      */

      students: result,


      /*
      |--------------------------------------------------------------------------
      | GLOBAL SUMMARY
      |
      | These numbers are NOT affected by pagination.
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
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| TOKEN SUMMARY HELPER
|--------------------------------------------------------------------------
|
| This is GLOBAL.
|
| Pagination does not affect these numbers.
|
|--------------------------------------------------------------------------
*/

async function getStudentTokenSummary() {

  const [
    totalTokens,
    activeTokens,
    unusedTokens,
    usedTokens,
    expiredTokens,
    revokedTokens,
    studentsWithToken,
    studentsWithoutToken,
  ] = await Promise.all([

    /*
    |--------------------------------------------------------------------------
    | TOTAL TOKENS
    |--------------------------------------------------------------------------
    */

    SoftwareToken.countDocuments({}),


    /*
    |--------------------------------------------------------------------------
    | ACTIVE TOKENS
    |--------------------------------------------------------------------------
    */

    SoftwareToken.countDocuments({
      status: "active",
    }),


    /*
    |--------------------------------------------------------------------------
    | UNUSED TOKENS
    |--------------------------------------------------------------------------
    */

    SoftwareToken.countDocuments({
      status: "unused",
    }),


    /*
    |--------------------------------------------------------------------------
    | USED TOKENS
    |--------------------------------------------------------------------------
    */

    SoftwareToken.countDocuments({
      status: "used",
    }),


    /*
    |--------------------------------------------------------------------------
    | EXPIRED TOKENS
    |--------------------------------------------------------------------------
    */

    SoftwareToken.countDocuments({
      status: "expired",
    }),


    /*
    |--------------------------------------------------------------------------
    | REVOKED TOKENS
    |--------------------------------------------------------------------------
    */

    SoftwareToken.countDocuments({
      status: "revoked",
    }),


    /*
    |--------------------------------------------------------------------------
    | STUDENTS WITH TOKEN
    |--------------------------------------------------------------------------
    */

    Usercbt.countDocuments({
      role: "student",

      softwareToken: {
        $ne: null,
      },
    }),


    /*
    |--------------------------------------------------------------------------
    | STUDENTS WITHOUT TOKEN
    |--------------------------------------------------------------------------
    */

    Usercbt.countDocuments({
      role: "student",

      $or: [
        {
          softwareToken: null,
        },
        {
          softwareToken: {
            $exists: false,
          },
        },
      ],
    }),
  ]);


  return {
    totalTokens,
    activeTokens,
    unusedTokens,
    usedTokens,
    expiredTokens,
    revokedTokens,
    studentsWithToken,
    studentsWithoutToken,
  };
}



/*
|--------------------------------------------------------------------------
| GET /api/superadmin/students/:studentId
|
| Get one Student
|--------------------------------------------------------------------------
*/

export const getStudent = async (
  req,
  res,
  next
) => {
  try {
    const {
      studentId,
    } = req.params;


    /*
    |--------------------------------------------------------------------------
    | VALIDATE ID
    |--------------------------------------------------------------------------
    */

    if (
      !mongoose.Types.ObjectId.isValid(
        studentId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid student ID",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | FIND STUDENT
    |--------------------------------------------------------------------------
    */

    const student =
      await Usercbt.findOne({
        _id: studentId,
        role: "student",
      })

        .select(
          "-password -refreshToken -emailVerificationToken -resetPasswordToken"
        )

        /*
        |--------------------------------------------------------------------
        | TEACHER
        |--------------------------------------------------------------------
        */

        .populate({
          path: "teacherOwner",

          select:
            "firstName middleName lastName email avatar phone role adminOwner",
        })

        /*
        |--------------------------------------------------------------------
        | ADMIN
        |--------------------------------------------------------------------
        */

        .populate({
          path: "adminOwner",

          select:
            "firstName middleName lastName email avatar phone role",
        });


    /*
    |--------------------------------------------------------------------------
    | STUDENT NOT FOUND
    |--------------------------------------------------------------------------
    */

    if (!student) {
      return res.status(404).json({
        success: false,
        message:
          "Student not found",
      });
    }


    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.json({
      success: true,

      student:
        cleanStudent(
          student
        ),

      teacher:
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
            }
          : null,

      admin:
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
          : null,
    });
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| GET /api/superadmin/students/:studentId/exam-year
|
| Get Student Exam Year
|--------------------------------------------------------------------------
*/

export const getStudentExamYear =
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        studentId,
      } = req.params;


      if (
        !mongoose.Types.ObjectId.isValid(
          studentId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid student ID",
        });
      }


      const student =
        await Usercbt.findOne({
          _id: studentId,
          role: "student",
        }).select(
          "_id firstName middleName lastName email ExamYear"
        );


      if (!student) {
        return res.status(404).json({
          success: false,
          message:
            "Student not found",
        });
      }


      return res.json({
        success: true,

        student: {
          _id:
            student._id,

          firstName:
            student.firstName,

          middleName:
            student.middleName,

          lastName:
            student.lastName,

          email:
            student.email,

          ExamYear:
            student.ExamYear,
        },
      });
    } catch (error) {
      next(error);
    }
  };


/*
|--------------------------------------------------------------------------
| GET /api/superadmin/students/:studentId
|
| Get Students belonging to one Teacher
|--------------------------------------------------------------------------
*/

export const getStudentsByTeacher =
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        teacherId,
      } = req.params;


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
          message:
            "Invalid teacher ID",
        });
      }


      /*
      |--------------------------------------------------------------------------
      | MAKE SURE TEACHER EXISTS
      |--------------------------------------------------------------------------
      */

      const teacher =
        await Usercbt.findOne({
          _id: teacherId,
          role: "teacher",
        }).select(
          "_id firstName middleName lastName email adminOwner"
        );


      if (!teacher) {
        return res.status(404).json({
          success: false,
          message:
            "Teacher not found",
        });
      }


      /*
      |--------------------------------------------------------------------------
      | GET STUDENTS
      |--------------------------------------------------------------------------
      */

      const students =
        await Usercbt.find({
          role: "student",

          teacherOwner:
            teacher._id,
        })

          .select(
            "-password -refreshToken -emailVerificationToken -resetPasswordToken"
          )

          .populate({
            path: "adminOwner",

            select:
              "firstName middleName lastName email avatar phone role",
          })

          .sort({
            createdAt: -1,
          });


      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

      return res.json({
        success: true,

        teacher,

        students:
          students.map(
            cleanStudent
          ),

        totalStudents:
          students.length,
      });
    } catch (error) {
      next(error);
    }
  };



