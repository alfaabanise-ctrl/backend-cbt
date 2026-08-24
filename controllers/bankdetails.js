import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Usertp from "../model/Users.js";
import BankAccount from "../model/Bankaccount.js";
import Kyc from "../model/kyc.js";
export const saveAccount = async (req, res) => {
  try {
    const user = req.user;

    const {
      bankName,
      bankCode,
      accountNumber,
      accountName,
    } = req.body;
    
    // ===========================
    // Validation
    // ===========================

    if (
      !bankName ||
      !bankCode ||
      !accountNumber ||
      !accountName
    ) {
      return res.status(400).json({
        success: false,
        message: "All bank account fields are required.",
      });
    }

    // ===========================
    // Find existing account
    // ===========================

    let account = await BankAccount.findOne({
      user: user._id,
    });

    // ===========================
    // Prevent editing if verified
    // ===========================
    
    
    if (account && account.verified) {
      return res.status(403).json({
        success: false,
        message:
          "Your bank account has already been verified and cannot be edited. Please contact support if you need to change it.",
      });
    }

    // ===========================
    // Create account
    // ===========================

    if (!account) {
      account = new BankAccount({
        user: user._id,
      });
    }

    // ===========================
    // Save account details
    // ===========================

    account.bankName = bankName;
    account.bankCode = bankCode;
    account.accountNumber = accountNumber;
    account.accountName = accountName;

    // Waiting for admin approval
    account.verified = false;
    account.status = "PENDING";

    // Clear previous verification data
    account.verifiedBy = null;
    account.verifiedAt = null;
    
    account.rejectionReason = null;

    await account.save();

    return res.status(200).json({
      success: true,
      message:
        "Bank account submitted successfully. It is awaiting admin verification.",
      data: account,
    });

  } catch (error) {
    console.error("Save Bank Account:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save bank account.",
    });
  }
};

export const getBankAccount = async (req, res) => {
  try {
    const account = await BankAccount.findOne({
      user: req.user._id,
   
    });
      // account.status = "PENDING";
      // account.verified = false;
      // await account.save();
    return res.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch bank account.",
    });
  }
};




// ADMIN FUNCTION 
export const getBankAndKycForVerify = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user
    const user = await Usertp.findById(userId)
      .select("firstName lastName email phone profileImage");
   
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Find KYC
    const kyc = await Kyc.findOne({
     userId,
    });

    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: "KYC record not found.",
      });
    }
   
    
    // Find Bank Account
    const bank = await BankAccount.findOne({
      user: userId,
    });

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: "Bank account not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
        kyc,
        bank,
      },
    });

  } catch (error) {
    console.error("Get Bank & KYC:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch verification details.",
    });
  }
};



export const getAllBankAccounts = async (req, res) => {
  try {

    const { status, search } = req.query;

    const query = {};

    // Filter by status
    if (status) {
      query.status = status.toUpperCase();
    }

    let accounts = await BankAccount.find(query)
      .populate({
        path: "user",
        select: "firstName lastName email profileImage",
      })
      .sort({ createdAt: -1 });

    // Search
    if (search) {
      const keyword = search.toLowerCase();

      accounts = accounts.filter((account) => {
        const user = account.user || {};

        return (
          account.bankName?.toLowerCase().includes(keyword) ||
          account.accountName?.toLowerCase().includes(keyword) ||
          account.accountNumber?.includes(keyword) ||
          user.firstName?.toLowerCase().includes(keyword) ||
          user.lastName?.toLowerCase().includes(keyword) ||
          user.email?.toLowerCase().includes(keyword)
        );
      });
    }

    return res.status(200).json({
      success: true,
      total: accounts.length,
      data: accounts,
    });

  } catch (error) {
    console.error("Get Bank Accounts:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bank accounts.",
    });
  }
};



export const updateBankAccountStatus = async (req, res) => {
  try {
    // const admin = req.user;
    
    const { id } = req.params;
    const { status, reason } = req.body;
    console.log(status,reason );
    
    // Only allow these statuses
    if (!["ACTIVE", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status.",
      });
    }
    
    console.log(status,reason, '2' );
    const account = await BankAccount.findById(id);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Bank account not found.",
      });
    }
 
    // Prevent updating already verified accounts
    if (account.status === "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "This bank account has already been verified.",
      });
    }
     
    account.status = status;
    account.verified = status === "ACTIVE";

    // account.verifiedBy = admin._id;
    // account.verifiedAt = new Date();
    // account.verified = true
  
   
    
      if (status === "ACTIVE") {
        account.rejectionReason = null;
      } else if (status === "REJECTED") {
        account.rejectionReason = reason || "No reason provided.";
      }
    await account.save();

    return res.status(200).json({
      success: true,
      message:
        status === "ACTIVE"
          ? "Bank account verified successfully."
          : "Bank account rejected successfully.",
      data: account,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to update bank account.",
    });
  }
};