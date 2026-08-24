import Usertp from "../model/Users.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sgMail, SENDGRID_SENDER } from "../config/sendgridConfig.js";
import { sendEmail } from "../service/emailService.js";
import { renderOtpTemplateHtml } from "../template/verifyEmail.js";
import { ForgotPasswordTemplate } from "../template/passwordReset.js";
import axios from 'axios';
import {  bravo_sendEmail } from "../service/bravoemail.js";
import Wallet from "../model/Wallet.js";
/* ============================= CONTROLLER FUNCTIONS ============================= */

export const handleNewUsers = async (req, res) => {
  try {
    const { firstName, lastName, password, email, phone } = req.body;

    // ============================= VALIDATION =============================
    if (!firstName || !lastName || !password || !email) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    // ============================= GENERATE OTP =============================
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // ============================= CHECK EXISTING USER =============================
    const existingUser = await Usertp.findOne({ email }).exec();

    if (existingUser) {
      // User exists but not verified
      if (!existingUser.emailVerified) {
        existingUser.emailVerificationToken = otp;
        await existingUser.save();
       
      const emailRes = await bravo_sendEmail({
        to: existingUser.email,
        subject: "Your Abanise Verification Code",
        html: renderOtpTemplateHtml({
          name: `${existingUser.firstName} ${existingUser.lastName}`,
          otp,
          expiryMinutes: 15
        })
      })

    
            
        return res.status(200).json({
          success: true,
          message: "Verification code re-sent. Please check your email."
        });
      }

      // User already verified
      return res.status(409).json({
        success: false,
        message: "Email already registered. Please login."
      });
    }

    // ============================= HASH PASSWORD =============================
    const hashedPwd = await bcrypt.hash(password, 10);

    // ============================= CREATE USER =============================
    const newUser = await Usertp.create({
      firstName,
      lastName,
      email,
      phone,
      password: hashedPwd,
      emailVerificationToken: otp,
      emailVerified: false
    });

    // ============================= SEND VERIFICATION EMAIL =============================
    await bravo_sendEmail({
      to: newUser.email,
      subject: "Your Abanise Verification Code",
      html: renderOtpTemplateHtml({
        name: `${newUser.firstName} ${newUser.lastName}`,
        otp,
        expiryMinutes: 15
      })
    });
    // await bravo_sendEmail({
    //   to: newUser.email,
    //   name: `${newUser.firstName} ${newUser.lastName}`,
    //   subject: "Your TruePeople Verification Code",
    //   htmlContent: renderOtpTemplateHtml({
    //     name: `${newUser.firstName} ${newUser.lastName}`,
    //     otp,
    //     expiryMinutes: 15
    //   })
    // });
  

    // ============================= RESPONSE =============================
    return res.status(201).json({
      success: true,
      message: "Account created successfully. Please verify your email."
    });

  } catch (error) {
    // console.error(error);

    return res.status(500).json({
      success: false,
      message: "Server error. Please try again."
    });
  }
};


//Post /resend-otp

export const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const user = await Usertp.findOne({ email }).exec();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // If already verified, just send the refresh token
    if (user.emailVerified) {
      const refreshToken = jwt.sign(
        { id: user._id },
        process.env.REFRESH_TOKEN_SECRETY,
        { expiresIn: "1d" }
      );

      user.refreshToken = refreshToken;
      await user.save();

      res.cookie('jwt', refreshToken, {
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          maxAge: 24 * 60 * 60 * 1000,
      })

      return res.status(200).json({
        data: user,
        success: true,
        message: "Already verified, refresh token issued",
      });
    }

    // Check OTP
    if (user.emailVerificationToken !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // OTP matches → verify email
    user.emailVerified = true;
    user.emailVerificationToken = undefined;

    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: user._id  },
      process.env.REFRESH_TOKEN_SECRETY,
      { expiresIn: "1d" }
    );

    user.refreshToken = refreshToken;
    await user.save();

    // Set cookie
    res.cookie('jwt', refreshToken, {
    httpOnly: true,
     secure: true,
     sameSite: 'none',
     maxAge: 24 * 60 * 60 * 1000,
    })

    return res.status(200).json({
      data: user,
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again.",
    });
  }
};



//Post /resend-otp
export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Find user
    const user = await Usertp.findOne({ email }).exec();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email already verified' });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationToken = otp;
    await user.save();
   
    const emailRes = await bravo_sendEmail({
        to: user.email,
        subject: "Your Abanise Verification Code",
        html: renderOtpTemplateHtml({
          name: `${user.firstName} ${user.lastName}`,
          otp,
          expiryMinutes: 15
        })
      })
    // Send email
    // await sendEmail({
    //   to: user.email,
    //   from: process.env.SENDGRID_SENDER,
    //   subject: 'Your TruePeople Verification Code',
    //   html: renderOtpTemplateHtml({
    //     name: `${user.firstName} ${user.lastName}`,
    //     otp,
    //     expiryMinutes: 15
    //   }),
    // });

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully. Check your email.'
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};


// Request Passwords Link

const generateToken = (length = 25) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";

  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return token;
};



export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    if (!process.env.RESET_PASSWORD_SECRET) {
      
      return res.status(500).json({
        success: false,
        message: "Server configuration error"
      });
    }

    const user = await Usertp.findOne({ email }).exec();

    // Always return same response to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a reset link has been sent."
      });
    }

    // Create reset token
    const resetToken = generateToken(25);

    // Save token to DB
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();
    

     const emailRes = await bravo_sendEmail({
        to: user.email,
        subject: "Your Abanise Verification Code",
        html: ForgotPasswordTemplate(user, resetToken)
      })
    // Send reset email
    // await sendEmail({
    //   to: user.email,
    //   from: process.env.SENDGRID_SENDER,
    //   subject: "Reset Your Password",
    //   html: ForgotPasswordTemplate(user, resetToken)
    // });

    return res.status(200).json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent."
    });

  } catch (error) {
    console.error("Password reset request error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later."
    });
  }
};




export const resetPassword = async (req, res) => {
  try {
    // token from header
    const token = req.headers["x-reset-token"];

    // new password from body
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        message: "Reset token and new password are required"
      });
    }

    // find user with this token
    const user = await Usertp.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    }).exec();

    if (!user) {
      return res.status(401).json({
        message: "Invalid or expired reset token"
      });
    }

    // hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;

    // remove reset token
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully"
    });

  } catch (error) {
    

    return res.status(500).json({
      message: "Server error"
    });
  }
};




export const verifyResetToken = async (req, res) => {
  try {
    const token = req.headers["x-reset-token"];

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required"
      });
    }

    const user = await Usertp.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    }).exec();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired reset token"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Token is valid"
    });

  } catch (error) {
    

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};



export const protectPages = async (req, res) => {
  const { jwt: refreshToken } = req.cookies;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRETY
    );

    const foundUser = await Usertp.findOne({
      _id: decoded.id,
      refreshToken,
    }).select("-password");

    if (!foundUser) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    const wallet = await Wallet.findOne({
      owner: foundUser._id,
      ownerType: "USER",
    }).select("balance currency status");

    return res.status(200).json({
      success: true,
      data: {
        ...foundUser.toObject(),
        wallet,
      },
    });
  } catch (err) {
    return res.status(403).json({
      success: false,
      message:
        err instanceof jwt.TokenExpiredError
          ? "Token expired"
          : "Invalid token",
    });
  }
};

