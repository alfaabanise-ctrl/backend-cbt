import Payment from "../../model/Payment.js";
import Usercbt from "../../model/Users.js";
import SoftwareToken from "../../model/SoftwareToken.js";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const cleanUser = (user) => {
  if (!user) return null;

  const data = user.toObject
    ? user.toObject()
    : user;

  return {
    _id: data._id,
    firstName: data.firstName || "",
    middleName: data.middleName || "",
    lastName: data.lastName || "",
    email: data.email || "",
    phone: data.phone || "",
    avatar: data.avatar || null,
    role: data.role || null,
  };
};

const fullName = (user) => {
  if (!user) return "N/A";

  return [
    user.firstName,
    user.middleName,
    user.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "N/A";
};


/*
|--------------------------------------------------------------------------
| Convert database status to frontend status
|--------------------------------------------------------------------------
*/

const frontendStatus = (payment) => {
  if (
    payment.status === "SUCCESS" &&
    payment.verified === true
  ) {
    return "Successful";
  }

  if (
    payment.status === "REFUNDED" ||
    payment.status === "PARTIALLY_REFUNDED"
  ) {
    return "Refunded";
  }

  if (
    payment.status === "CREATED" ||
    payment.status === "PENDING" ||
    payment.status === "PROCESSING"
  ) {
    return "Pending";
  }

  return "Failed";
};


/*
|--------------------------------------------------------------------------
| Convert payment method
|--------------------------------------------------------------------------
*/

const frontendPaymentMethod = (payment) => {
  const method = payment.paymentMethod;

  switch (method) {
    case "CARD":
      return "Card";

    case "BANK_TRANSFER":
      return "Bank Transfer";

    case "USSD":
      return "USSD";

    case "ACCOUNT":
      return "Bank Transfer";

    case "QR":
      return "Paystack";

    case "MOBILE_MONEY":
      return "Paystack";

    default:
      break;
  }

  /*
  |--------------------------------------------------------------------------
  | Gateway fallback
  |--------------------------------------------------------------------------
  */

  if (payment.gateway === "PAYSTACK") {
    return "Paystack";
  }

  return "Paystack";
};


/*
|--------------------------------------------------------------------------
| Determine subscription plan
|--------------------------------------------------------------------------
|
| Your current Payment schema does not contain a "plan" field.
|
| We therefore check:
|
| 1. metadata.plan
| 2. metadata.subscriptionPlan
| 3. metadata.duration
| 4. token expiry date
|
*/

const getPlan = (payment) => {
  const metadata =
    payment.metadata &&
    typeof payment.metadata === "object"
      ? payment.metadata
      : {};

  const possiblePlan =
    metadata.plan ||
    metadata.subscriptionPlan ||
    metadata.subscription ||
    null;

  if (possiblePlan) {
    const plan = String(possiblePlan).toLowerCase();

    if (plan.includes("month")) {
      return "Monthly";
    }

    if (plan.includes("quarter")) {
      return "Quarterly";
    }

    if (
      plan.includes("year") ||
      plan.includes("annual")
    ) {
      return "Yearly";
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Check duration
  |--------------------------------------------------------------------------
  */

  const duration =
    metadata.duration ||
    metadata.durationMonths ||
    null;

  if (duration) {
    const months = Number(duration);

    if (months === 1) return "Monthly";
    if (months === 3) return "Quarterly";
    if (months >= 12) return "Yearly";
  }

  /*
  |--------------------------------------------------------------------------
  | Calculate from token dates
  |--------------------------------------------------------------------------
  */

  if (
    payment.softwareToken &&
    payment.softwareToken.activatedAt &&
    payment.softwareToken.expiresAt
  ) {
    const start = new Date(
      payment.softwareToken.activatedAt
    );

    const end = new Date(
      payment.softwareToken.expiresAt
    );

    const days =
      (end.getTime() - start.getTime()) /
      (1000 * 60 * 60 * 24);

    if (days <= 45) {
      return "Monthly";
    }

    if (days <= 120) {
      return "Quarterly";
    }

    if (days >= 300) {
      return "Yearly";
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Default
  |--------------------------------------------------------------------------
  */

  return "Yearly";
};


/*
|--------------------------------------------------------------------------
| Format date
|--------------------------------------------------------------------------
*/

const formatDate = (date) => {
  if (!date) return "N/A";

  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "N/A";
  }

  return value.toLocaleString("en-NG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};


/*
|--------------------------------------------------------------------------
| Get referred teacher
|--------------------------------------------------------------------------
*/

const getReferredBy = (student) => {
  if (!student) return "N/A";

  if (student.teacherOwner) {
    return fullName(student.teacherOwner);
  }

  return "N/A";
};


/*
|--------------------------------------------------------------------------
| Get admin
|--------------------------------------------------------------------------
*/

const getAdmin = (student) => {
  if (!student) return "N/A";

  if (student.adminOwner) {
    return fullName(student.adminOwner);
  }

  return "N/A";
};


/*
|--------------------------------------------------------------------------
| GET ALL PAYMENTS
|--------------------------------------------------------------------------
|
| GET /api/payments
|
*/

export const getPayments = async (req, res, next) => {
  try {
    const {
      search = "",
      status,
      paymentMethod,
      plan,
      page = 1,
      limit = 100,
    } = req.query;

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const currentLimit = Math.min(
      Math.max(Number(limit) || 100, 1),
      500
    );

    const skip =
      (currentPage - 1) * currentLimit;


    /*
    |--------------------------------------------------------------------------
    | Payment filter
    |--------------------------------------------------------------------------
    */

    const filter = {};

    if (status) {
      const statusMap = {
        Successful: "SUCCESS",
        Pending: {
          $in: [
            "CREATED",
            "PENDING",
            "PROCESSING",
          ],
        },
        Failed: "FAILED",
        Refunded: {
          $in: [
            "REFUNDED",
            "PARTIALLY_REFUNDED",
          ],
        },
      };

      if (statusMap[status]) {
        filter.status = statusMap[status];
      }
    }


    /*
    |--------------------------------------------------------------------------
    | Find payments
    |--------------------------------------------------------------------------
    */

    const [
      payments,
      total,
    ] = await Promise.all([
      Payment.find(filter)
        .populate({
          path: "payer",
          select:
            "firstName middleName lastName email phone avatar adminOwner teacherOwner role",
          populate: [
            {
              path: "adminOwner",
              select:
                "firstName middleName lastName email",
            },
            {
              path: "teacherOwner",
              select:
                "firstName middleName lastName email",
            },
          ],
        })
        .populate({
          path: "softwareToken",
          select:
            "token status owner activatedBy activatedAt expiresAt features createdAt",
        })
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(currentLimit),

      Payment.countDocuments(filter),
    ]);


    /*
    |--------------------------------------------------------------------------
    | Search / transform
    |--------------------------------------------------------------------------
    */

    let result = payments.map((payment, index) => {
      const student = payment.payer;

      const paymentStatus =
        frontendStatus(payment);

      const method =
        frontendPaymentMethod(payment);

      const subscriptionPlan =
        getPlan(payment);

      return {
        /*
        |--------------------------------------------------------------------------
        | Frontend ID
        |--------------------------------------------------------------------------
        */

        id:
          payment._id?.toString() ||
          `${skip + index + 1}`,

        /*
        |--------------------------------------------------------------------------
        | Student
        |--------------------------------------------------------------------------
        */

        student: fullName(student),

        email:
          student?.email ||
          "",

        phone:
          student?.phone ||
          "",

        avatar:
          student?.avatar ||
          null,

        /*
        |--------------------------------------------------------------------------
        | Payment
        |--------------------------------------------------------------------------
        */

        amount:
          Number(payment.amount) || 0,

        plan:
          subscriptionPlan,

        paymentMethod:
          method,

        /*
        |--------------------------------------------------------------------------
        | Teacher / Agent
        |--------------------------------------------------------------------------
        */

        referredBy:
          getReferredBy(student),

        /*
        |--------------------------------------------------------------------------
        | Admin
        |--------------------------------------------------------------------------
        */

        admin:
          getAdmin(student),

        /*
        |--------------------------------------------------------------------------
        | Date
        |--------------------------------------------------------------------------
        */

        paidAt:
          formatDate(
            payment.paidAt ||
            payment.verificationDate ||
            payment.createdAt
          ),

        /*
        |--------------------------------------------------------------------------
        | Reference
        |--------------------------------------------------------------------------
        */

        reference:
          payment.txRef ||
          payment.gatewayReference ||
          payment.TransactionId ||
          payment._id?.toString(),

        /*
        |--------------------------------------------------------------------------
        | Status
        |--------------------------------------------------------------------------
        */

        status:
          paymentStatus,

        /*
        |--------------------------------------------------------------------------
        | Extra information
        |--------------------------------------------------------------------------
        */

        paymentId:
          payment._id?.toString(),

        txRef:
          payment.txRef,

        gatewayReference:
          payment.gatewayReference,

        transactionId:
          payment.TransactionId,

        gateway:
          payment.gateway,

        verified:
          payment.verified,

        paidAtRaw:
          payment.paidAt,

        createdAt:
          payment.createdAt,

        softwareToken:
          payment.softwareToken
            ? {
                id:
                  payment.softwareToken._id,
                token:
                  payment.softwareToken.token,
                status:
                  payment.softwareToken.status,
                activatedAt:
                  payment.softwareToken.activatedAt,
                expiresAt:
                  payment.softwareToken.expiresAt,
              }
            : null,
      };
    });


    /*
    |--------------------------------------------------------------------------
    | Frontend search
    |--------------------------------------------------------------------------
    |
    | Your frontend already does filtering.
    | This backend search is optional but useful for large data.
    |
    */

    if (search.trim()) {
      const query =
        search.trim().toLowerCase();

      result = result.filter((payment) => {
        return (
          payment.student
            .toLowerCase()
            .includes(query) ||

          payment.email
            .toLowerCase()
            .includes(query) ||

          payment.phone
            .toLowerCase()
            .includes(query) ||

          payment.reference
            .toLowerCase()
            .includes(query) ||

          payment.referredBy
            .toLowerCase()
            .includes(query) ||

          payment.admin
            .toLowerCase()
            .includes(query)
        );
      });
    }


    /*
    |--------------------------------------------------------------------------
    | Frontend filters
    |--------------------------------------------------------------------------
    */

    if (
      paymentMethod &&
      paymentMethod !== "All Methods"
    ) {
      result = result.filter(
        (payment) =>
          payment.paymentMethod ===
          paymentMethod
      );
    }


    if (
      plan &&
      plan !== "All Plans"
    ) {
      result = result.filter(
        (payment) =>
          payment.plan === plan
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Statistics
    |--------------------------------------------------------------------------
    */

    const allPayments = await Payment.find({})
      .select(
        "amount status verified paymentMethod"
      )
      .lean();


    let totalPayments = 0;
    let successfulPayments = 0;
    let pendingPayments = 0;
    let failedPayments = 0;
    let refundedPayments = 0;

    let totalRevenue = 0;
    let pendingRevenue = 0;


    const paymentMethodCounts = {
      Card: 0,
      "Bank Transfer": 0,
      USSD: 0,
      Paystack: 0,
    };


    for (const payment of allPayments) {
      totalPayments++;

      const status =
        frontendStatus(payment);

      const method =
        frontendPaymentMethod(payment);

      if (status === "Successful") {
        successfulPayments++;

        totalRevenue +=
          Number(payment.amount) || 0;
      }

      if (status === "Pending") {
        pendingPayments++;

        pendingRevenue +=
          Number(payment.amount) || 0;
      }

      if (status === "Failed") {
        failedPayments++;
      }

      if (status === "Refunded") {
        refundedPayments++;
      }

      if (
        paymentMethodCounts[
          method
        ] !== undefined
      ) {
        paymentMethodCounts[
          method
        ]++;
      }
    }


    const averagePayment =
      successfulPayments > 0
        ? Math.round(
            totalRevenue /
              successfulPayments
          )
        : 0;


    const successfulPercentage =
      totalPayments > 0
        ? Math.round(
            (successfulPayments /
              totalPayments) *
              100
          )
        : 0;


    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.json({
      success: true,

      payments: result,

      summary: {
        totalPayments,

        successfulPayments,

        pendingPayments,

        failedPayments,

        refundedPayments,

        totalRevenue,

        pendingRevenue,

        averagePayment,

        successfulPercentage,

        paymentMethods:
          paymentMethodCounts,
      },

      pagination: {
        page: currentPage,

        limit: currentLimit,

        total,

        totalPages:
          Math.ceil(
            total /
              currentLimit
          ),
      },
    });

  } catch (error) {
    console.error(
      "getPayments error:",
      error
    );

    next(error);
  }
};