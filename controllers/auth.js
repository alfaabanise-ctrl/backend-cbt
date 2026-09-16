import User from "../model/Users.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sgMail, SENDGRID_SENDER } from "../config/sendgridConfig.js";
import { sendEmail } from "../service/emailService.js";
import { renderOtpTemplateHtml } from "../template/verifyEmail.js";
import { ForgotPasswordTemplate } from "../template/passwordReset.js";
import axios from 'axios';
import { bravo_sendEmail } from "../service/bravoemail.js";
import Wallet from "../model/Wallet.js";
import SoftwareToken from "../model/SoftwareToken.js";
import { validateUserCreation } from "../validation/userValidator.js";

import { generateSoftwareTokenforuser } from "../service/softwareToken.service.js";

// export const handleNewUsers = async (req, res) => {
//   try {
//     const {
//       firstName,
//       lastName,
//       password,
//       email,
//       phone,
//       role,
//     } = req.body;

//     // =====================================================
//     // VALIDATE USER CREATION PERMISSION
//     // =====================================================

//     const validation = validateUserCreation(req.user, role);

//     if (!validation.valid) {
//       return res.status(validation.status).json({
//         success: false,
//         message: validation.message,
//       });
//     }

//     const creatorRole = validation.creatorRole;
//     const newUserRole = validation.newUserRole;

//     // =====================================================
//     // BASIC VALIDATION
//     // =====================================================

//     if (!firstName || !lastName || !password || !email) {
//       return res.status(400).json({
//         success: false,
//         message: "All fields are required.",
//       });
//     }

//     // =====================================================
//     // NORMALIZE EMAIL
//     // =====================================================

//     const normalizedEmail = email.trim().toLowerCase();

//     // =====================================================
//     // GENERATE OTP
//     // =====================================================

//     const otp = Math.floor(
//       100000 + Math.random() * 900000
//     ).toString();

//     // =====================================================
//     // CHECK EXISTING USER
//     // =====================================================

//     const existingUser = await User
//       .findOne({ email: normalizedEmail })
//       .exec();

//     if (existingUser) {

//       // User exists but email is NOT verified
//       if (!existingUser.emailVerified) {

//         existingUser.emailVerificationToken = otp;

//         await existingUser.save();

//         await bravo_sendEmail({
//           to: existingUser.email,
//           subject: "Your Abanise Verification Code",
//           html: renderOtpTemplateHtml({
//             name: `${existingUser.firstName} ${existingUser.lastName}`,
//             otp,
//             expiryMinutes: 15,
//           }),
//         });

//         return res.status(200).json({
//           success: true,
//           message:
//             "Verification code re-sent. Please check your email.",
//           verificationRequired: true,
//         });
//       }

//       // User already exists and is verified
//       return res.status(409).json({
//         success: false,
//         message: "Email already registered. Please login.",
//       });
//     }

//     // =====================================================
//     // HASH PASSWORD
//     // =====================================================

//     const hashedPwd = await bcrypt.hash(password, 10);

//     // =====================================================
//     // CREATE USER
//     // =====================================================

//     const newUser = await User.create({
//       firstName: firstName.trim(),
//       lastName: lastName.trim(),
//       email: normalizedEmail,
//       phone: phone?.trim() || null,
//       password: hashedPwd,

//       role: newUserRole,

//       emailVerificationToken: otp,
//       emailVerified: false,

//       // Who created this account
//       createdBy: req.user._id || req.user.id,
//       createdByRole: creatorRole,
//     });

//     // =====================================================
//     // SEND VERIFICATION EMAIL
//     // =====================================================

//     await bravo_sendEmail({
//       to: newUser.email,
//       subject: "Your Abanise Verification Code",
//       html: renderOtpTemplateHtml({
//         name: `${newUser.firstName} ${newUser.lastName}`,
//         otp,
//         expiryMinutes: 15,
//       }),
//     });

//     // =====================================================
//     // RESPONSE
//     // =====================================================

//     return res.status(201).json({
//       success: true,
//       message:
//         "Account created successfully. Please verify the email.",
//       verificationRequired: true,
//       user: {
//         id: newUser._id,
//         firstName: newUser.firstName,
//         lastName: newUser.lastName,
//         email: newUser.email,
//         phone: newUser.phone,
//         role: newUser.role,
//       },
//     });

//   } catch (error) {
//     console.error("handleNewUsers error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Server error. Please try again.",
//     });
//   }
// };
/* ============================= CONTROLLER FUNCTIONS ============================= */

export const handleNewUsers = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      password,
      email,
      phone,
      role,
    } = req.body;

    // =========================================================
    // BASIC VALIDATION
    // =========================================================

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !password ||
      !email?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "First name, last name, email and password are required.",
      });
    }

    // =========================================================
    // NORMALIZE EMAIL
    // =========================================================

    const normalizedEmail = email.trim().toLowerCase();



    let newUserRole = "superadmin";

    let createdBy = null;
    let createdByRole = null;
    let adminOwner = null;
    let teacherOwner = null;

    // =========================================================
    // PUBLIC REGISTRATION
    // =========================================================

    if (!role) {


      console.log(role,
        "Public registration:",
        normalizedEmail
      );
    }

    // =========================================================
    // PRIVATE / MANAGED REGISTRATION
    // =========================================================

    else {


      if (!req.user) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication is required to create an account with a specified role.",
        });
      }

      // -------------------------------------------------------
      // Validate who is creating this account
      // -------------------------------------------------------

      const validation = await validateUserCreation(
        req.user,
        role
      );

      // -------------------------------------------------------
      // Never allow undefined/invalid status codes
      // -------------------------------------------------------
       
        
      if (!validation?.valid) {
        const status =
          Number.isInteger(validation?.status) &&
            validation.status >= 100 &&
            validation.status <= 599
            ? validation.status
            : 403;

        return res.status(status).json({
          success: false,
          message:
            validation?.message ||
            "You are not authorized to create this user.",
        });
      }

      // -------------------------------------------------------
      // Get normalized ownership information
      // -------------------------------------------------------

      newUserRole = validation.newUserRole;

      createdBy = validation.createdBy;
      createdByRole = validation.createdByRole;

      adminOwner = validation.adminOwner;
      teacherOwner = validation.teacherOwner;

      // -------------------------------------------------------
      // Make sure validator returned a role
      // -------------------------------------------------------

      if (!newUserRole) {
        return res.status(400).json({
          success: false,
          message:
            "Unable to determine the new user's role.",
        });
      }

      console.log(
        "Private account creation:",
        {
          creator: req.user._id,
          creatorRole: req.user.role,
          newUserRole,
        }
      );
    }

    // =========================================================
    // CHECK EXISTING USER
    // =========================================================

    const existingUser = await User.findOne({
      email: normalizedEmail,
    }).exec();

    // =========================================================
    // GENERATE OTP
    // =========================================================

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();
    console.log(otp);

    // =========================================================
    // EXISTING USER
    // =========================================================

    if (existingUser) {

      // -------------------------------------------------------
      // EXISTING BUT NOT VERIFIED
      // -------------------------------------------------------

      if (!existingUser.emailVerified) {
        existingUser.emailVerificationToken = otp;

        await existingUser.save();

        await bravo_sendEmail({
          to: existingUser.email,

          subject:
            "Your Abanise Verification Code",

          html: renderOtpTemplateHtml({
            name:
              `${existingUser.firstName} ${existingUser.lastName}`,

            otp,

            expiryMinutes: 15,
          }),
        });

        return res.status(200).json({
          success: true,

          message:
            "Verification code re-sent. Please check your email.",
        });
      }

      // -------------------------------------------------------
      // EXISTING AND VERIFIED
      // -------------------------------------------------------

      return res.status(409).json({
        success: false,

        message:
          "Email already registered. Please login.",
      });
    }

    // =========================================================
    // HASH PASSWORD
    // =========================================================

    const hashedPwd = await bcrypt.hash(
      password,
      10
    );

    // =========================================================
    // CREATE USER
    // =========================================================

    const newUser = await User.create({
      firstName: firstName.trim(),

      lastName: lastName.trim(),

      email: normalizedEmail,

      phone: phone?.trim() || null,

      password: hashedPwd,

      // -------------------------------------------------------
      // Public registration = student
      // Private registration = validated role
      // -------------------------------------------------------

      role: newUserRole,

      emailVerificationToken: otp,

      emailVerified: false,

      // =====================================================
      // OWNERSHIP
      // =====================================================

      createdBy,

      createdByRole,

      adminOwner,

      teacherOwner,
    });

    console.log(
      "Created user:",
      newUser._id.toString()
    );

    // =========================================================
    // SEND VERIFICATION EMAIL
    // =========================================================

    await bravo_sendEmail({
      to: newUser.email,

      subject:
        "Your Abanise Verification Code",

      html: renderOtpTemplateHtml({
        name:
          `${newUser.firstName} ${newUser.lastName}`,

        otp,

        expiryMinutes: 15,
      }),
    });

    // =========================================================
    // SUCCESS RESPONSE
    // =========================================================

    return res.status(201).json({
      success: true,

      message:
        "Account created successfully. Please verify your email.",

      user: {
        id: newUser._id,

        firstName: newUser.firstName,

        lastName: newUser.lastName,

        email: newUser.email,

        role: newUser.role,
      },
    });

  } catch (error) {

    // =========================================================
    // ERROR HANDLING
    // =========================================================

    console.error(
      "handleNewUsers error:",
      error
    );

    // =========================================================
    // DUPLICATE KEY
    // =========================================================

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,

        message:
          "Email already registered. Please login.",
      });
    }

    // =========================================================
    // MONGOOSE VALIDATION ERROR
    // =========================================================

    if (error?.name === "ValidationError") {
      const messages = Object.values(
        error.errors || {}
      )
        .map((err) => err.message)
        .filter(Boolean);

      return res.status(400).json({
        success: false,

        message:
          messages.length > 0
            ? messages.join(", ")
            : "Invalid user information.",
      });
    }

    // =========================================================
    // DEFAULT SERVER ERROR
    // =========================================================

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Server error. Please try again.",
    });
  }
};




//Post /resend-otp




export const verifyEmail = async (req, res) => {
  try {
    const {
      email,
      code,
      isPrivate = false,
    } = req.body;

    // =========================================================
    // NORMALIZE PRIVATE MODE
    // =========================================================
    //
    // Prevent:
    // isPrivate = "false"
    //
    // because Boolean("false") === true.
    // =========================================================

    const privateVerification =
      isPrivate === true ||
      isPrivate === "true";

    // =========================================================
    // BASIC VALIDATION
    // =========================================================

    if (!email?.trim() || !code?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // =========================================================
    // NORMALIZE EMAIL
    // =========================================================

    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedCode =
      String(code).trim();

    // =========================================================
    // FIND USER
    // =========================================================

    const user = await User.findOne({
      email: normalizedEmail,
    }).exec();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // =========================================================
    // ALREADY VERIFIED
    // =========================================================
    //
    // If the email has already been verified:
    //
    // PRIVATE:
    //   Do not generate another token.
    //   Do not issue a refresh token.
    //
    // PUBLIC:
    //   Issue the refresh token.
    // =========================================================

    if (user.emailVerified) {

      // -------------------------------------------------------
      // PRIVATE VERIFICATION
      // -------------------------------------------------------

      if (privateVerification) {
        return res.status(200).json({
          success: true,

          data: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
          },

          message:
            "Email already verified.",
        });
      }

      // -------------------------------------------------------
      // PUBLIC VERIFICATION
      // -------------------------------------------------------

      const refreshSecret =
        process.env.REFRESH_TOKEN_SECRETY;

      if (!refreshSecret) {
        throw new Error(
          "REFRESH_TOKEN_SECRETY is not configured."
        );
      }

      const refreshToken = jwt.sign(
        {
          id: user._id,
        },
        refreshSecret,
        {
          expiresIn: "1d",
        }
      );

      user.refreshToken = refreshToken;

      await user.save();

      // -------------------------------------------------------
      // SET COOKIE
      // -------------------------------------------------------

      res.cookie("jwt", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.status(200).json({
        success: true,

        data: user,

        message:
          "Already verified, refresh token issued",
      });
    }

    // =========================================================
    // CHECK OTP
    // =========================================================

    if (
      user.emailVerificationToken !==
      normalizedCode
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // =========================================================
    // VERIFY EMAIL
    // =========================================================

    user.emailVerified = true;

    user.emailVerificationToken = undefined;

    // =========================================================
    // BONUS SOFTWARE TOKEN
    // =========================================================
    //
    // Only Admin and Teacher receive a bonus token.
    //
    // Students do not automatically receive one.
    //
    // We generate it only during the FIRST successful
    // verification.
    // =========================================================

    let bonusToken = null;

    const userRole =
      String(user.role || "").toLowerCase();

    if (
      userRole === "admin" ||
      userRole === "teacher"
    ) {

      // -------------------------------------------------------
      // CHECK EXISTING TOKEN
      // -------------------------------------------------------

      const existingToken =
        await SoftwareToken.findOne({
          owner: user._id,
        }).exec();

      // -------------------------------------------------------
      // GENERATE ONE BONUS TOKEN
      // -------------------------------------------------------

      if (!existingToken) {

        bonusToken =
          await generateSoftwareTokenforuser({
            user,

            features: [],

            expiresAt: null,

            deviceLimit: 1,
          });

        console.log(
          `Bonus software token generated for ${userRole}:`,
          bonusToken.token
        );
      }
    }

    // =========================================================
    // SAVE USER
    // =========================================================

    await user.save();

    // =========================================================
    // PRIVATE VERIFICATION
    // =========================================================
    //
    // Private users such as Admin/Teacher are created by
    // another authenticated account.
    //
    // We verify the email but don't automatically create
    // a login session here.
    // =========================================================

    if (privateVerification) {

      return res.status(200).json({
        success: true,

        message:
          "Email verified successfully.",

        data: {
          id: user._id,

          firstName: user.firstName,

          lastName: user.lastName,

          email: user.email,

          role: user.role,

          emailVerified:
            user.emailVerified,
        },

        // Admin/Teacher gets the bonus token.
        // Student receives null.
        bonusToken: bonusToken
          ? {
              id: bonusToken._id,

              token: bonusToken.token,

              status: bonusToken.status,

              deviceLimit:
                bonusToken.deviceLimit,

              expiresAt:
                bonusToken.expiresAt,
            }
          : null,
      });
    }

    // =========================================================
    // PUBLIC USER REFRESH TOKEN
    // =========================================================

    const refreshSecret =
      process.env.REFRESH_TOKEN_SECRETY;

    if (!refreshSecret) {
      throw new Error(
        "REFRESH_TOKEN_SECRETY is not configured."
      );
    }

    const refreshToken = jwt.sign(
      {
        id: user._id,
      },
      refreshSecret,
      {
        expiresIn: "1d",
      }
    );

    user.refreshToken = refreshToken;

    await user.save();

    // =========================================================
    // SET COOKIE
    // =========================================================

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000,
    });

    // =========================================================
    // PUBLIC RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,

      message:
        "Email verified successfully.",

      data: user,

      // Normally null for public students.
      // Included in case your public flow ever creates
      // another eligible role.
      bonusToken: bonusToken
        ? {
            id: bonusToken._id,

            token: bonusToken.token,

            status: bonusToken.status,

            deviceLimit:
              bonusToken.deviceLimit,

            expiresAt:
              bonusToken.expiresAt,
          }
        : null,
    });

  } catch (error) {

    // =========================================================
    // ERROR LOG
    // =========================================================

    console.error(
      "verifyEmail error:",
      error
    );

    // =========================================================
    // DUPLICATE KEY
    // =========================================================

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,

        message:
          "A software token or account record already exists.",
      });
    }

    // =========================================================
    // MONGOOSE VALIDATION ERROR
    // =========================================================

    if (
      error?.name === "ValidationError"
    ) {
      const messages =
        Object.values(
          error.errors || {}
        )
          .map(
            (err) => err.message
          )
          .filter(Boolean);

      return res.status(400).json({
        success: false,

        message:
          messages.length
            ? messages.join(", ")
            : "Invalid account information.",
      });
    }

    // =========================================================
    // DEFAULT ERROR
    // =========================================================

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Server error. Please try again.",
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
    const user = await User.findOne({ email }).exec();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if already verified
     if (user.emailVerified || user.password)  {
      return res.status(400).json({ success: false, message: 'Email already verified' });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(otp);
    
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

    const user = await User.findOne({ email }).exec();

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
    const user = await User.findOne({
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

    const user = await User.findOne({
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

    const foundUser = await User.findOne({
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
