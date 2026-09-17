
import Usercbt from "../../model/Users.js";

import SoftwareToken from "../../model/SoftwareToken.js";

import Payment from "../../model/Payment.js";



/*
|--------------------------------------------------------------------------
| SUPER ADMIN DASHBOARD
|--------------------------------------------------------------------------
*/

export const getSuperAdminDashboard = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | AUTHENTICATION
    |--------------------------------------------------------------------------
    */

    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const currentUser = await Usercbt.findById(userId)
      .select("_id role firstName middleName lastName email")
      .lean();

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!["admin", "superadmin"].includes(currentUser.role)) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DATE RANGE
    |--------------------------------------------------------------------------
    */

    const now = new Date();

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
    | USER STATISTICS
    |--------------------------------------------------------------------------
    */

    const [
      totalUsers,
      totalStudents,
      totalTeachers,
      totalAdmins,
      activeUsers,
      inactiveUsers,
      suspendedUsers,
    ] = await Promise.all([
      // EVERY USER
      Usercbt.countDocuments({}),

      // STUDENTS
      Usercbt.countDocuments({
        role: "student",
      }),

      // TEACHERS
      Usercbt.countDocuments({
        role: "teacher",
      }),

      // ADMINS
      Usercbt.countDocuments({
        role: {
          $in: ["admin", "superadmin"],
        },
      }),

      // ACTIVE USERS
      Usercbt.countDocuments({
        status: "Active",
      }),

      // INACTIVE USERS
      Usercbt.countDocuments({
        status: "Inactive",
      }),

      // SUSPENDED USERS
      Usercbt.countDocuments({
        status: "Suspended",
      }),
    ]);

    /*
    |--------------------------------------------------------------------------
    | NEW USERS THIS MONTH
    |--------------------------------------------------------------------------
    */

    const [
      newUsersThisMonth,
      newStudentsThisMonth,
      newTeachersThisMonth,
    ] = await Promise.all([
      Usercbt.countDocuments({
        createdAt: {
          $gte: currentMonthStart,
        },
      }),

      Usercbt.countDocuments({
        role: "student",

        createdAt: {
          $gte: currentMonthStart,
        },
      }),

      Usercbt.countDocuments({
        role: "teacher",

        createdAt: {
          $gte: currentMonthStart,
        },
      }),
    ]);

    /*
    |--------------------------------------------------------------------------
    | SOFTWARE TOKEN STATISTICS
    |--------------------------------------------------------------------------
    */

    const [
      totalTokens,
      unusedTokens,
      activeTokens,
      usedTokens,
      expiredTokens,
      revokedTokens,
    ] = await Promise.all([
      SoftwareToken.countDocuments({}),

      SoftwareToken.countDocuments({
        status: "unused",
      }),

      SoftwareToken.countDocuments({
        status: "active",
      }),

      SoftwareToken.countDocuments({
        status: "used",
      }),

      SoftwareToken.countDocuments({
        status: "expired",
      }),

      SoftwareToken.countDocuments({
        status: "revoked",
      }),
    ]);

    /*
    |--------------------------------------------------------------------------
    | REAL-TIME EXPIRED TOKEN CHECK
    |--------------------------------------------------------------------------
    |
    | If a token says "active" but expiresAt is already past,
    | count it separately as currently expired.
    |
    */

    const currentlyExpiredActiveTokens =
      await SoftwareToken.countDocuments({
        status: "active",

        expiresAt: {
          $ne: null,
          $lte: now,
        },
      });

    /*
    |--------------------------------------------------------------------------
    | ACTUALLY ACTIVE TOKENS
    |--------------------------------------------------------------------------
    |
    | Active AND expiry has not passed.
    |
    */

    const currentlyActiveTokens =
      await SoftwareToken.countDocuments({
        status: "active",

        $or: [
          {
            expiresAt: null,
          },

          {
            expiresAt: {
              $gt: now,
            },
          },
        ],
      });

    /*
    |--------------------------------------------------------------------------
    | PAYMENT STATISTICS
    |--------------------------------------------------------------------------
    |
    | Only SUCCESS + VERIFIED payments count as revenue.
    |
    */

    const successfulPaymentFilter = {
      status: "SUCCESS",
      verified: true,
    };

    /*
    |--------------------------------------------------------------------------
    | TOTAL REVENUE
    |--------------------------------------------------------------------------
    */

    const totalRevenueResult =
      await Payment.aggregate([
        {
          $match: successfulPaymentFilter,
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

    const totalRevenueKobo =
      totalRevenueResult[0]?.total || 0;

    const totalRevenue =
      totalRevenueKobo / 100;

    /*
    |--------------------------------------------------------------------------
    | TOKEN REVENUE
    |--------------------------------------------------------------------------
    */

    const tokenRevenueResult =
      await Payment.aggregate([
        {
          $match: {
            ...successfulPaymentFilter,

            $or: [
              {
                paymentPurpose:
                  "TOKEN_PURCHASE",
              },

              {
                subscriptionType:
                  "SOFTWARE_TOKEN",
              },
            ],
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

    const tokenRevenueKobo =
      tokenRevenueResult[0]?.total || 0;

    const tokenRevenue =
      tokenRevenueKobo / 100;

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

            paidAt: {
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

            paidAt: {
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

    const calculateGrowth = (
      current,
      previous
    ) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }

      return Number(
        (
          ((current - previous) / previous) *
          100
        ).toFixed(1)
      );
    };

    const revenueGrowth = calculateGrowth(
      currentMonthRevenue,
      previousMonthRevenue
    );

    /*
    |--------------------------------------------------------------------------
    | TOKEN PLAN BREAKDOWN
    |--------------------------------------------------------------------------
    */

    const tokenPlanStats =
      await SoftwareToken.aggregate([
        {
          $group: {
            _id: "$plan",

            total: {
              $sum: 1,
            },

            revenue: {
              $sum: "$amount",
            },
          },
        },

        {
          $sort: {
            total: -1,
          },
        },
      ]);

    const tokenPlans = tokenPlanStats.map(
      (item) => ({
        plan: item._id,

        total: item.total,

        revenue: Number(
          ((item.revenue || 0) / 100).toFixed(2)
        ),
      })
    );

    /*
    |--------------------------------------------------------------------------
    | TOKEN STATUS BREAKDOWN
    |--------------------------------------------------------------------------
    */

    const tokenStatusStats =
      await SoftwareToken.aggregate([
        {
          $group: {
            _id: "$status",

            total: {
              $sum: 1,
            },
          },
        },
      ]);

    const tokenStatuses = {
      unused: 0,
      active: 0,
      used: 0,
      expired: 0,
      revoked: 0,
    };

    for (const item of tokenStatusStats) {
      if (
        Object.prototype.hasOwnProperty.call(
          tokenStatuses,
          item._id
        )
      ) {
        tokenStatuses[item._id] =
          item.total;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | RECENT TOKEN PURCHASES
    |--------------------------------------------------------------------------
    */

    const recentTokenPurchases =
      await SoftwareToken.find({})
        .sort({
          createdAt: -1,
        })
        .limit(10)
        .populate({
          path: "owner",

          select:
            "firstName middleName lastName email",
        })
        .lean();

    const formattedTokenPurchases =
      recentTokenPurchases.map(
        (token) => ({
          id: token._id,

          token: token.token,

          plan: token.plan,

          amount: Number(
            ((token.amount || 0) / 100).toFixed(2)
          ),

          status: token.status,

          paymentReference:
            token.paymentReference,

          createdAt:
            token.createdAt,

          activatedAt:
            token.activatedAt,

          expiresAt:
            token.expiresAt,

          owner: token.owner
            ? {
                id: token.owner._id,

                name: [
                  token.owner.firstName,
                  token.owner.middleName,
                  token.owner.lastName,
                ]
                  .filter(Boolean)
                  .join(" "),

                email:
                  token.owner.email,
              }
            : null,
        })
      );

    /*
    |--------------------------------------------------------------------------
    | RECENT PAYMENTS
    |--------------------------------------------------------------------------
    */

    const recentPaymentsRaw =
      await Payment.find(
        successfulPaymentFilter
      )
        .sort({
          paidAt: -1,
          createdAt: -1,
        })
        .limit(10)
        .populate({
          path: "payer",

          select:
            "firstName middleName lastName email",
        })
        .lean();

    const recentPayments =
      recentPaymentsRaw.map(
        (payment) => ({
          id: payment._id,

          txRef: payment.txRef,

          gatewayReference:
            payment.gatewayReference,

          student: payment.payer
            ? [
                payment.payer.firstName,
                payment.payer.middleName,
                payment.payer.lastName,
              ]
                .filter(Boolean)
                .join(" ")
            : "Unknown User",

          email:
            payment.payer?.email || "",

          amount: Number(
            ((payment.amount || 0) / 100).toFixed(2)
          ),

          currency:
            payment.currency || "NGN",

          paymentMethod:
            payment.paymentMethod,

          paymentPurpose:
            payment.paymentPurpose,

          subscriptionType:
            payment.subscriptionType,

          status: payment.status,

          verified:
            payment.verified,

          paidAt:
            payment.paidAt,

          createdAt:
            payment.createdAt,
        })
      );

    /*
    |--------------------------------------------------------------------------
    | REVENUE - LAST 7 MONTHS
    |--------------------------------------------------------------------------
    */

    const revenueStart = new Date(
      now.getFullYear(),
      now.getMonth() - 6,
      1
    );

    const revenueAggregation =
      await Payment.aggregate([
        {
          $match: {
            ...successfulPaymentFilter,

            paidAt: {
              $gte: revenueStart,
              $lte: now,
            },
          },
        },

        {
          $group: {
            _id: {
              year: {
                $year: "$paidAt",
              },

              month: {
                $month: "$paidAt",
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

    const revenueData = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth() - i,
        1
      );

      const year =
        date.getFullYear();

      const month =
        date.getMonth() + 1;

      const found =
        revenueAggregation.find(
          (item) =>
            item._id.year === year &&
            item._id.month === month
        );

      revenueData.push({
        month: date.toLocaleString(
          "en-US",
          {
            month: "short",
          }
        ),

        value: found
          ? Number(
              (
                found.total / 100
              ).toFixed(2)
            )
          : 0,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | STUDENT GROWTH
    |--------------------------------------------------------------------------
    */

    const studentGrowth = [];

    for (let i = 6; i >= 0; i--) {
      const start = new Date(
        now.getFullYear(),
        now.getMonth() - i,
        1
      );

      const end = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        1
      );

      const count =
        await Usercbt.countDocuments({
          role: "student",

          createdAt: {
            $gte: start,
            $lt: end,
          },
        });

      studentGrowth.push({
        month: start.toLocaleString(
          "en-US",
          {
            month: "short",
          }
        ),

        value: count,
      });
    }

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
        | USERS
        |--------------------------------------------------------------------------
        */

        users: {
          total: totalUsers,

          students: totalStudents,

          teachers: totalTeachers,

          admins: totalAdmins,

          active: activeUsers,

          inactive: inactiveUsers,

          suspended: suspendedUsers,

          newThisMonth:
            newUsersThisMonth,

          newStudentsThisMonth:
            newStudentsThisMonth,

          newTeachersThisMonth:
            newTeachersThisMonth,
        },

        /*
        |--------------------------------------------------------------------------
        | DASHBOARD STATS
        |--------------------------------------------------------------------------
        */

        stats: {
          totalUsers,

          totalStudents,

          totalTeachers,

          totalAdmins,

          activeUsers,

          activeSubscriptions:
            currentlyActiveTokens,

          totalTokens,

          activeTokens:
            currentlyActiveTokens,

          unusedTokens,

          usedTokens,

          expiredTokens,

          revokedTokens,

          currentlyExpiredActiveTokens,

          totalRevenue,

          tokenRevenue,

          changes: {
            revenue:
              revenueGrowth,
          },
        },

        /*
        |--------------------------------------------------------------------------
        | TOKENS
        |--------------------------------------------------------------------------
        */

        tokens: {
          total: totalTokens,

          unused: unusedTokens,

          active: activeTokens,

          currentlyActive:
            currentlyActiveTokens,

          used: usedTokens,

          expired: expiredTokens,

          revoked: revokedTokens,

          currentlyExpired:
            currentlyExpiredActiveTokens,

          statuses: tokenStatuses,

          plans: tokenPlans,
        },

        /*
        |--------------------------------------------------------------------------
        | REVENUE
        |--------------------------------------------------------------------------
        */

        revenue: {
          total: totalRevenue,

          tokenRevenue,

          currentMonth:
            currentMonthRevenue,

          previousMonth:
            previousMonthRevenue,

          growth:
            revenueGrowth,

          data: revenueData,
        },

        /*
        |--------------------------------------------------------------------------
        | STUDENT GROWTH
        |--------------------------------------------------------------------------
        */

        studentGrowth,

        /*
        |--------------------------------------------------------------------------
        | RECENT DATA
        |--------------------------------------------------------------------------
        */

        recentStudents:
          await Usercbt.find({
            role: "student",
          })
            .sort({
              createdAt: -1,
            })
            .limit(5)
            .select(
              "_id firstName middleName lastName email status createdAt avatar avatar_public_id"
            )
            .lean(),

        recentPayments,

        recentTokenPurchases,

        formattedTokenPurchases,
      },
    });
  } catch (error) {
    console.error(
      "SUPER ADMIN DASHBOARD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load super admin dashboard",

      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};


