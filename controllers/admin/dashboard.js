
import mongoose from "mongoose";

import Usercbt from "../../model/Users.js";
import Payment from "../../model/Payment.js";
import SoftwareToken from "../../model/SoftwareToken.js";

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const getFullName = (user) => {
  if (!user) return "Unknown User";

  return [
    user.firstName,
    user.middleName,
    user.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || user.email || "Unknown User";
};

const getInitials = (name = "") => {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

const calculatePercentageChange = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Number(
    (((current - previous) / previous) * 100).toFixed(1)
  );
};

/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
|--------------------------------------------------------------------------
|
| GET /admin/dashboard
|
| IMPORTANT:
|
| This is the NORMAL ADMIN dashboard.
|
| It does NOT count the entire website.
|
| Everything is scoped using:
|
|     adminOwner = logged in admin
|
|--------------------------------------------------------------------------
*/

export const getAdminDashboard = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | GET CURRENT ADMIN
    |--------------------------------------------------------------------------
    |
    | Your existing auth middleware should already set req.user.
    |
    */

    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user not found",
      });
    }

    const adminId = req.user._id;

    /*
    |--------------------------------------------------------------------------
    | VERIFY ADMIN ROLE
    |--------------------------------------------------------------------------
    |
    | This is NOT an authentication function.
    |
    | It simply prevents a student/teacher from requesting admin dashboard
    | data if your route is accidentally exposed.
    |
    */

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin dashboard access required",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | OBJECT ID
    |--------------------------------------------------------------------------
    */

    const adminObjectId = new mongoose.Types.ObjectId(
      String(adminId)
    );

    const now = new Date();

    /*
    |--------------------------------------------------------------------------
    | MONTH DATES
    |--------------------------------------------------------------------------
    */

    const currentMonthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );

    /*
    |--------------------------------------------------------------------------
    | ADMIN'S TEACHERS
    |--------------------------------------------------------------------------
    |
    | A teacher belongs to this admin when:
    |
    | role = teacher
    | adminOwner = adminId
    |
    */

    const teacherFilter = {
      role: "teacher",
      adminOwner: adminObjectId,
    };

    /*
    |--------------------------------------------------------------------------
    | ADMIN'S STUDENTS
    |--------------------------------------------------------------------------
    |
    | This includes:
    |
    | 1. Students registered directly by admin
    |
    | 2. Students registered by teachers under this admin
    |
    */

    const studentFilter = {
      role: "student",
      adminOwner: adminObjectId,
    };

    /*
    |--------------------------------------------------------------------------
    | DIRECT STUDENTS
    |--------------------------------------------------------------------------
    |
    | Students directly registered by this admin.
    |
    */

    const directStudentFilter = {
      role: "student",
      adminOwner: adminObjectId,
      createdBy: adminObjectId,
      createdByRole: "admin",
    };

    /*
    |--------------------------------------------------------------------------
    | TEACHER STUDENTS
    |--------------------------------------------------------------------------
    |
    | Students belonging to teachers.
    |
    */

    const teacherStudentFilter = {
      role: "student",
      adminOwner: adminObjectId,
      teacherOwner: {
        $ne: null,
      },
    };

    /*
    |--------------------------------------------------------------------------
    | USER COUNTS
    |--------------------------------------------------------------------------
    */

    const [
      totalTeachers,
      totalStudents,
      directStudents,
      teacherStudents,

      teachersThisMonth,
      teachersLastMonth,

      studentsThisMonth,
      studentsLastMonth,

      directStudentsThisMonth,
      teacherStudentsThisMonth,

      /*
      |--------------------------------------------------------------------------
      | RECENT TEACHERS
      |--------------------------------------------------------------------------
      */

      recentTeachers,

      /*
      |--------------------------------------------------------------------------
      | RECENT STUDENTS
      |--------------------------------------------------------------------------
      */

      recentStudents,

      /*
      |--------------------------------------------------------------------------
      | ADMIN
      |--------------------------------------------------------------------------
      */

      adminUser,
    ] = await Promise.all([
      Usercbt.countDocuments(teacherFilter),

      Usercbt.countDocuments(studentFilter),

      Usercbt.countDocuments(directStudentFilter),

      Usercbt.countDocuments(teacherStudentFilter),

      /*
      |--------------------------------------------------------------------------
      | TEACHER MONTH CHANGE
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        ...teacherFilter,
        createdAt: {
          $gte: currentMonthStart,
        },
      }),

      Usercbt.countDocuments({
        ...teacherFilter,
        createdAt: {
          $gte: previousMonthStart,
          $lt: currentMonthStart,
        },
      }),

      /*
      |--------------------------------------------------------------------------
      | STUDENT MONTH CHANGE
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        ...studentFilter,
        createdAt: {
          $gte: currentMonthStart,
        },
      }),

      Usercbt.countDocuments({
        ...studentFilter,
        createdAt: {
          $gte: previousMonthStart,
          $lt: currentMonthStart,
        },
      }),

      /*
      |--------------------------------------------------------------------------
      | DIRECT STUDENTS THIS MONTH
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        ...directStudentFilter,
        createdAt: {
          $gte: currentMonthStart,
        },
      }),

      /*
      |--------------------------------------------------------------------------
      | TEACHER STUDENTS THIS MONTH
      |--------------------------------------------------------------------------
      */

      Usercbt.countDocuments({
        ...teacherStudentFilter,
        createdAt: {
          $gte: currentMonthStart,
        },
      }),

      /*
      |--------------------------------------------------------------------------
      | RECENT TEACHERS
      |--------------------------------------------------------------------------
      */

      Usercbt.find(teacherFilter)
        .sort({
          createdAt: -1,
        })
        .limit(5)
        .select(
          "_id firstName middleName lastName email phone avatar status createdAt commissionPercentage"
        )
        .lean(),

      /*
      |--------------------------------------------------------------------------
      | RECENT STUDENTS
      |--------------------------------------------------------------------------
      */

      Usercbt.find(studentFilter)
        .sort({
          createdAt: -1,
        })
        .limit(5)
        .select(
          "_id firstName middleName lastName email phone avatar status createdAt teacherOwner softwareToken createdBy createdByRole"
        )
        .populate({
          path: "teacherOwner",
          select: "firstName middleName lastName email",
        })
        .lean(),

      /*
      |--------------------------------------------------------------------------
      | ADMIN ACCOUNT
      |--------------------------------------------------------------------------
      */

      Usercbt.findById(adminObjectId)
        .select(
          "_id firstName middleName lastName email avatar walletBalance commissionPercentage status"
        )
        .lean(),
    ]);

    /*
    |--------------------------------------------------------------------------
    | ADMIN STUDENT IDS
    |--------------------------------------------------------------------------
    |
    | We need these IDs to find the software tokens belonging to this
    | admin's students.
    |--------------------------------------------------------------------------
    */

    const studentRecords = await Usercbt.find(studentFilter)
      .select("_id softwareToken")
      .lean();

    const studentIds = studentRecords.map(
      (student) => student._id
    );

    /*
    |--------------------------------------------------------------------------
    | STUDENT TOKEN IDS
    |--------------------------------------------------------------------------
    */

    const studentTokenIds = studentRecords
      .map((student) => student.softwareToken)
      .filter(Boolean);

    /*
    |--------------------------------------------------------------------------
    | TOKEN INVENTORY
    |--------------------------------------------------------------------------
    |
    | There are two sides:
    |
    | 1. Admin-owned unused inventory
    |
    |    SoftwareToken.owner = admin
    |
    | 2. Tokens activated/attached to this admin's students
    |
    |    SoftwareToken.owner = student
    |
    |    OR
    |
    |    Usercbt.softwareToken = token
    |
    |--------------------------------------------------------------------------
    */

    const adminInventoryTokenFilter = {
      owner: adminObjectId,
    };

    const studentTokenFilter =
      studentIds.length > 0
        ? {
            $or: [
              {
                owner: {
                  $in: studentIds,
                },
              },

              ...(studentTokenIds.length > 0
                ? [
                    {
                      _id: {
                        $in: studentTokenIds,
                      },
                    },
                  ]
                : []),
            ],
          }
        : null;

    /*
    |--------------------------------------------------------------------------
    | TOKEN COUNTS
    |--------------------------------------------------------------------------
    |
    | We use sets of IDs so a token cannot accidentally be counted twice.
    |--------------------------------------------------------------------------
    */

    let adminTokens = [];

    if (studentTokenFilter) {
      adminTokens = await SoftwareToken.find({
        $or: [
          adminInventoryTokenFilter,
          studentTokenFilter,
        ],
      })
        .select(
          "_id owner status plan amount paymentReference activatedBy activatedAt expiresAt"
        )
        .lean();
    } else {
      adminTokens = await SoftwareToken.find(
        adminInventoryTokenFilter
      )
        .select(
          "_id owner status plan amount paymentReference activatedBy activatedAt expiresAt"
        )
        .lean();
    }

    /*
    |--------------------------------------------------------------------------
    | REMOVE DUPLICATES
    |--------------------------------------------------------------------------
    */

    const uniqueTokenMap = new Map();

    for (const token of adminTokens) {
      uniqueTokenMap.set(
        String(token._id),
        token
      );
    }

    const scopedTokens = Array.from(
      uniqueTokenMap.values()
    );

    /*
    |--------------------------------------------------------------------------
    | TOKEN STATS
    |--------------------------------------------------------------------------
    */

    const tokenStats = {
      total: scopedTokens.length,
      unused: 0,
      active: 0,
      used: 0,
      expired: 0,
      revoked: 0,
    };

    for (const token of scopedTokens) {
      const status = token.status;

      /*
      |--------------------------------------------------------------------------
      | ACTIVE
      |--------------------------------------------------------------------------
      |
      | We consider an active token active only when:
      |
      | status = active
      |
      | AND:
      |
      | expiresAt is null
      | OR
      | expiresAt is still in the future
      |
      */

      if (
        status === "active" &&
        (
          !token.expiresAt ||
          new Date(token.expiresAt) > now
        )
      ) {
        tokenStats.active++;
        continue;
      }

      if (status === "unused") {
        tokenStats.unused++;
        continue;
      }

      if (status === "used") {
        tokenStats.used++;
        continue;
      }

      if (status === "expired") {
        tokenStats.expired++;
        continue;
      }

      if (status === "revoked") {
        tokenStats.revoked++;
        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | ACTIVE TOKEN WITH EXPIRED DATE
      |--------------------------------------------------------------------------
      |
      | If your database still says "active" but expiresAt has passed,
      | show it under expired for dashboard purposes.
      |
      */

      if (
        status === "active" &&
        token.expiresAt &&
        new Date(token.expiresAt) <= now
      ) {
        tokenStats.expired++;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | ACTIVE SUBSCRIPTIONS
    |--------------------------------------------------------------------------
    */

    const activeSubscriptions =
      tokenStats.active;

    /*
    |--------------------------------------------------------------------------
    | RECENT TEACHERS FORMAT
    |--------------------------------------------------------------------------
    */

    const formattedRecentTeachers =
      recentTeachers.map((teacher) => {
        const name = getFullName(teacher);

        return {
          id: teacher._id,
          name,
          email: teacher.email || "",
          phone: teacher.phone || "",
          avatar: teacher.avatar || null,
          initials: getInitials(name),
          status: teacher.status || "Active",
          commissionPercentage:
            teacher.commissionPercentage || 0,
          joinedAt: teacher.createdAt,
        };
      });

    /*
    |--------------------------------------------------------------------------
    | RECENT STUDENTS FORMAT
    |--------------------------------------------------------------------------
    */

    const formattedRecentStudents =
      recentStudents.map((student) => {
        const name = getFullName(student);

        let status = student.status || "Active";

        if (
          status === "Active" &&
          student.softwareToken
        ) {
          status = "Active";
        }

        return {
          id: student._id,

          name,

          email: student.email || "",

          phone: student.phone || "",

          avatar: student.avatar || null,

          initials: getInitials(name),

          status,

          teacher: student.teacherOwner
            ? getFullName(student.teacherOwner)
            : "Direct Student",

          teacherId:
            student.teacherOwner?._id || null,

          registeredBy:
            student.createdByRole || "admin",

          joinedAt: student.createdAt,

          hasSoftwareToken:
            Boolean(student.softwareToken),
        };
      });

    /*
    |--------------------------------------------------------------------------
    | REVENUE
    |--------------------------------------------------------------------------
    |
    | Only payments belonging to this admin's students are included.
    |
    | Payment.payer = student
    |--------------------------------------------------------------------------
    */

    let paymentStudentFilter = {
      payer: {
        $in: studentIds,
      },
    };

    /*
    |--------------------------------------------------------------------------
    | SUCCESSFUL PAYMENTS
    |--------------------------------------------------------------------------
    */

    const successfulPaymentFilter = {
      ...paymentStudentFilter,
      status: "SUCCESS",
      verified: true,
    };

    /*
    |--------------------------------------------------------------------------
    | REVENUE TOTAL
    |--------------------------------------------------------------------------
    */

    const revenueResult = await Payment.aggregate([
      {
        $match: successfulPaymentFilter,
      },

      {
        $group: {
          _id: null,

          total: {
            $sum: "$amount",
          },

          count: {
            $sum: 1,
          },
        },
      },
    ]);

    const totalRevenueKobo =
      revenueResult[0]?.total || 0;

    const totalRevenue =
      totalRevenueKobo / 100;

    const successfulPaymentCount =
      revenueResult[0]?.count || 0;

    /*
    |--------------------------------------------------------------------------
    | CURRENT MONTH REVENUE
    |--------------------------------------------------------------------------
    */

    const currentMonthRevenueResult =
      await Payment.aggregate([
        {
          $match: {
            ...successfulPaymentFilter,

            createdAt: {
              $gte: currentMonthStart,
            },
          },
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: "$amount",
            },
          },
        },
      ]);

    const currentMonthRevenueKobo =
      currentMonthRevenueResult[0]?.total || 0;

    const currentMonthRevenue =
      currentMonthRevenueKobo / 100;

    /*
    |--------------------------------------------------------------------------
    | PREVIOUS MONTH REVENUE
    |--------------------------------------------------------------------------
    */

    const previousMonthRevenueResult =
      await Payment.aggregate([
        {
          $match: {
            ...successfulPaymentFilter,

            createdAt: {
              $gte: previousMonthStart,
              $lt: currentMonthStart,
            },
          },
        },

        {
          $group: {
            _id: null,

            total: {
              $sum: "$amount",
            },
          },
        },
      ]);

    const previousMonthRevenueKobo =
      previousMonthRevenueResult[0]?.total || 0;

    const previousMonthRevenue =
      previousMonthRevenueKobo / 100;

    /*
    |--------------------------------------------------------------------------
    | REVENUE GROWTH
    |--------------------------------------------------------------------------
    */

    const revenueGrowth =
      calculatePercentageChange(
        currentMonthRevenue,
        previousMonthRevenue
      );

    /*
    |--------------------------------------------------------------------------
    | RECENT PAYMENTS
    |--------------------------------------------------------------------------
    |
    | We intentionally show all payment statuses here.
    |
    | This lets Admin see:
    |
    | SUCCESS
    | PENDING
    | FAILED
    | CANCELLED
    | etc.
    |--------------------------------------------------------------------------
    */

    let recentPayments = [];

    if (studentIds.length > 0) {
      recentPayments = await Payment.find({
        payer: {
          $in: studentIds,
        },
      })
        .sort({
          createdAt: -1,
        })
        .limit(8)
        .populate({
          path: "payer",
          select:
            "firstName middleName lastName email",
        })
        .populate({
          path: "softwareToken",
          select:
            "plan token status expiresAt",
        })
        .lean();
    }

    /*
    |--------------------------------------------------------------------------
    | FORMAT PAYMENTS
    |--------------------------------------------------------------------------
    */

    const formattedRecentPayments =
      recentPayments.map((payment) => {
        const payer = payment.payer;

        const studentName = payer
          ? getFullName(payer)
          : "Unknown Student";

        let plan =
          payment.metadata?.plan ||
          payment.softwareToken?.plan ||
          payment.subscriptionType ||
          "Payment";

        if (
          plan === "SOFTWARE_TOKEN"
        ) {
          plan = "Software Token";
        }

        let status = "Pending";

        switch (payment.status) {
          case "SUCCESS":
            status = "Successful";
            break;

          case "FAILED":
            status = "Failed";
            break;

          case "CANCELLED":
            status = "Cancelled";
            break;

          case "EXPIRED":
            status = "Expired";
            break;

          case "PROCESSING":
            status = "Processing";
            break;

          case "REFUNDED":
            status = "Refunded";
            break;

          case "PARTIALLY_REFUNDED":
            status = "Partially Refunded";
            break;

          case "PENDING":
            status = "Pending";
            break;

          default:
            status =
              payment.status || "Pending";
        }

        return {
          id: payment._id,

          student: studentName,

          email: payer?.email || "",

          amount:
            (payment.amount || 0) / 100,

          currency:
            payment.currency || "NGN",

          plan,

          status,

          paymentMethod:
            payment.paymentMethod ||
            "UNKNOWN",

          reference:
            payment.gatewayReference ||
            payment.txRef ||
            null,

          date:
            payment.paidAt ||
            payment.createdAt,
        };
      });

    /*
    |--------------------------------------------------------------------------
    | TOP TEACHERS
    |--------------------------------------------------------------------------
    |
    | Only teachers belonging to this admin.
    |--------------------------------------------------------------------------
    */

    const topTeachersRaw =
      await Usercbt.aggregate([
        {
          $match: {
            role: "student",

            adminOwner:
              adminObjectId,

            teacherOwner: {
              $ne: null,
            },
          },
        },

        {
          $group: {
            _id: "$teacherOwner",

            students: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            students: -1,
          },
        },

        {
          $limit: 5,
        },

        {
          $lookup: {
            from: "usercbts",

            localField: "_id",

            foreignField: "_id",

            as: "teacher",
          },
        },

        {
          $unwind: {
            path: "$teacher",

            preserveNullAndEmptyArrays:
              true,
          },
        },

        {
          $project: {
            _id: 1,

            students: 1,

            firstName:
              "$teacher.firstName",

            middleName:
              "$teacher.middleName",

            lastName:
              "$teacher.lastName",

            email:
              "$teacher.email",
          },
        },
      ]);

    /*
    |--------------------------------------------------------------------------
    | TOP TEACHERS WITH PAID STUDENTS
    |--------------------------------------------------------------------------
    */

    const topTeachers = [];

    for (const teacher of topTeachersRaw) {
      const teacherId = teacher._id;

      const teacherStudents =
        await Usercbt.find({
          role: "student",

          adminOwner:
            adminObjectId,

          teacherOwner:
            teacherId,
        })
          .select("_id")
          .lean();

      const teacherStudentIds =
        teacherStudents.map(
          (student) => student._id
        );

      let paidStudents = 0;

      if (teacherStudentIds.length > 0) {
        paidStudents =
          await Payment.distinct(
            "payer",
            {
              payer: {
                $in: teacherStudentIds,
              },

              status: "SUCCESS",

              verified: true,
            }
          );
      }

      const studentCount =
        teacher.students || 0;

      const conversion =
        studentCount > 0
          ? Number(
              (
                (paidStudents.length /
                  studentCount) *
                100
              ).toFixed(1)
            )
          : 0;

      const name = getFullName(
        teacher
      );

      topTeachers.push({
        id: teacherId,

        name,

        email: teacher.email || "",

        students: studentCount,

        paid: paidStudents.length,

        conversion,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | STUDENT GROWTH
    |--------------------------------------------------------------------------
    |
    | Last 7 months.
    |--------------------------------------------------------------------------
    */

    const sevenMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 6,
      1
    );

    const studentGrowthRaw =
      await Usercbt.aggregate([
        {
          $match: {
            role: "student",

            adminOwner:
              adminObjectId,

            createdAt: {
              $gte: sevenMonthsAgo,
            },
          },
        },

        {
          $group: {
            _id: {
              year: {
                $year: "$createdAt",
              },

              month: {
                $month: "$createdAt",
              },
            },

            newStudents: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            "_id.year": 1,

            "_id.month": 1,
          },
        },
      ]);

    const studentGrowth =
      studentGrowthRaw.map((item) => {
        const date = new Date(
          item._id.year,
          item._id.month - 1,
          1
        );

        return {
          month:
            date.toLocaleString(
              "en-US",
              {
                month: "short",
              }
            ),

          value:
            item.newStudents,

          newStudents:
            item.newStudents,
        };
      });

    /*
    |--------------------------------------------------------------------------
    | MONTHLY REVENUE CHART
    |--------------------------------------------------------------------------
    |
    | Last 7 months.
    |--------------------------------------------------------------------------
    */

    const revenueRaw =
      await Payment.aggregate([
        {
          $match: {
            ...successfulPaymentFilter,

            createdAt: {
              $gte: sevenMonthsAgo,
            },
          },
        },

        {
          $group: {
            _id: {
              year: {
                $year: "$createdAt",
              },

              month: {
                $month: "$createdAt",
              },
            },

            total: {
              $sum: "$amount",
            },
          },
        },

        {
          $sort: {
            "_id.year": 1,

            "_id.month": 1,
          },
        },
      ]);

    const revenueData =
      revenueRaw.map((item) => {
        const date = new Date(
          item._id.year,
          item._id.month - 1,
          1
        );

        return {
          month:
            date.toLocaleString(
              "en-US",
              {
                month: "short",
              }
            ),

          value:
            (item.total || 0) / 100,
        };
      });

    /*
    |--------------------------------------------------------------------------
    | ADMIN NETWORK TOTAL
    |--------------------------------------------------------------------------
    |
    | Users managed by this admin.
    |
    | Admin itself is not included.
    |--------------------------------------------------------------------------
    */

    const totalUsers =
      totalTeachers +
      totalStudents;

    /*
    |--------------------------------------------------------------------------
    | USER GROWTH
    |--------------------------------------------------------------------------
    */

    const teachersChange =
      calculatePercentageChange(
        teachersThisMonth,
        teachersLastMonth
      );

    const studentsChange =
      calculatePercentageChange(
        studentsThisMonth,
        studentsLastMonth
      );

    /*
    |--------------------------------------------------------------------------
    | WALLET
    |--------------------------------------------------------------------------
    |
    | Your model contains legacy walletBalance.
    |
    | We expose it for the current dashboard.
    |--------------------------------------------------------------------------
    */

    const walletBalance =
      adminUser?.walletBalance || 0;

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      data: {
        /*
        |--------------------------------------------------------------------------
        | MAIN STATS
        |--------------------------------------------------------------------------
        */

        stats: {
          totalUsers,

          totalTeachers,

          totalStudents,

          directStudents,

          teacherStudents,

          activeSubscriptions,

          totalRevenue,

          walletBalance,

          changes: {
            teachers:
              teachersChange,

            students:
              studentsChange,

            directStudents:
              directStudentsThisMonth,

            teacherStudents:
              teacherStudentsThisMonth,
          },
        },

        /*
        |--------------------------------------------------------------------------
        | SOFTWARE TOKEN STATS
        |--------------------------------------------------------------------------
        */

        tokenStats,

        /*
        |--------------------------------------------------------------------------
        | ADMIN
        |--------------------------------------------------------------------------
        */

        admin: adminUser
          ? {
              id: adminUser._id,

              name:
                getFullName(adminUser),

              email:
                adminUser.email || "",

              avatar:
                adminUser.avatar || null,

              walletBalance,

              commissionPercentage:
                adminUser.commissionPercentage ||
                0,

              status:
                adminUser.status ||
                "Active",
            }
          : null,

        /*
        |--------------------------------------------------------------------------
        | TEACHERS
        |--------------------------------------------------------------------------
        */

        recentTeachers:
          formattedRecentTeachers,

        topTeachers,

        /*
        |--------------------------------------------------------------------------
        | STUDENTS
        |--------------------------------------------------------------------------
        */

        recentStudents:
          formattedRecentStudents,

        studentGrowth,

        /*
        |--------------------------------------------------------------------------
        | REVENUE
        |--------------------------------------------------------------------------
        */

        revenue: {
          total:
            totalRevenue,

          currentMonth:
            currentMonthRevenue,

          previousMonth:
            previousMonthRevenue,

          growth:
            revenueGrowth,

          data:
            revenueData,
        },

        /*
        |--------------------------------------------------------------------------
        | PAYMENTS
        |--------------------------------------------------------------------------
        */

        recentPayments:
          formattedRecentPayments,

        paymentStats: {
          successful:
            successfulPaymentCount,
        },
      },
    });
  } catch (error) {
    console.error(
      "ADMIN DASHBOARD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load admin dashboard",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};

