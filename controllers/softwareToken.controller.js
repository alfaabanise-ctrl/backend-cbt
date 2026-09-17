import SoftwareToken from "../model/softwareToken.js";

/*
|--------------------------------------------------------------------------
| GET MY PURCHASED TOKENS
|--------------------------------------------------------------------------
|
| GET /api/student/software-tokens
|
| Returns only tokens belonging to the logged-in student.
|
*/

export const getMySoftwareTokens = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const tokens = await SoftwareToken.find({
      owner: userId,
    })
      .sort({
        createdAt: -1,
      })
      .lean();

    const formattedTokens = tokens.map((token) => ({
      id: token._id,

      token: token.token,

      plan: token.plan,

      // Database is Kobo
      amount: Number(token.amount || 0),

      paymentReference:
        token.paymentReference || null,

      status: token.status,

      activatedBy: token.activatedBy,

      activatedAt: token.activatedAt,

      expiresAt: token.expiresAt,

      features: token.features || [],

      deviceLimit: Number(token.deviceLimit || 1),

      deviceCount: Number(token.deviceCount || 0),

      createdAt: token.createdAt,

      updatedAt: token.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Purchased tokens retrieved successfully.",
      tokens: formattedTokens,
      total: formattedTokens.length,
    });
  } catch (error) {
    console.error(
      "❌ Get my software tokens error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve purchased tokens.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};