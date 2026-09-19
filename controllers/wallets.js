import Wallet from "../model/Wallet.js";
import Usertp from "../model/Users.js";


export const updateWalletBankDetails = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.user._id;

    const {
      bankCode,
      bankName,
      accountNumber,
      accountName,
    } = req.body;


    if (!bankName) {
      return res.status(400).json({
        success: false,
        message: "Bank name is required",
      });
    }

    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: "Account number is required",
      });
    }

    if (!accountName) {
      return res.status(400).json({
        success: false,
        message: "Account name is required",
      });
    }


    const user = await Usertp.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    let ownerType;

    if (user.role === "admin") {
      ownerType = "ADMIN";
    } else if (user.role === "teacher") {
      ownerType = "TEACHER";
    } else {
      return res.status(403).json({
        success: false,
        message:
          "Only admins and teachers can use wallet payout details",
      });
    }


    const wallet = await Wallet.findOneAndUpdate(
      {
        owner: userId,
        ownerType,
      },
      {
        $set: {
          "bankDetails.bankCode":
            bankCode || null,

          "bankDetails.bankName":
            bankName.trim(),

          "bankDetails.accountNumber":
            String(accountNumber).trim(),

          "bankDetails.accountName":
            accountName.trim(),

          "bankDetails.verified":
            false,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );


    return res.json({
      success: true,
      message:
        "Bank account details saved successfully",

      data: {
        bankDetails:
          wallet.bankDetails,
      },
    });

  } catch (error) {
    next(error);
  }
};

export const getWalletBankDetails = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.user._id;

    const user = await Usertp.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }


    let ownerType;

    if (user.role === "admin") {
      ownerType = "ADMIN";
    } else if (user.role === "teacher") {
      ownerType = "TEACHER";
    } else {
      return res.status(403).json({
        success: false,
        message:
          "This user cannot use wallet payout",
      });
    }


    const wallet = await Wallet.findOne({
      owner: userId,
      ownerType,
    });


    if (!wallet) {
      return res.json({
        success: true,
        data: {
          bankDetails: null,
        },
      });
    }


    return res.json({
      success: true,

      data: {
        bankDetails:
          wallet.bankDetails,
      },
    });

  } catch (error) {
    next(error);
  }
};