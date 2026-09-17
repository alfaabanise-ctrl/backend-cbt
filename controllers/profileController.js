import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import Usercbt from "../model/Users.js";
import Others from "../model/Others.js";

/*
|--------------------------------------------------------------------------
| GET CURRENT USER PROFILE
|--------------------------------------------------------------------------
|
| Returns:
|
| Usercbt + Others
|
|--------------------------------------------------------------------------
*/

export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FIND USER
    |--------------------------------------------------------------------------
    */

    const user = await Usercbt.findById(userId)
      .select("-password -refreshToken -emailVerificationToken -resetPasswordToken")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FIND OTHER DETAILS
    |--------------------------------------------------------------------------
    */

    let details = await Others.findOne({
      user: user._id,
    }).lean();

    /*
    |--------------------------------------------------------------------------
    | CREATE DETAILS DOCUMENT IF IT DOES NOT EXIST
    |--------------------------------------------------------------------------
    */

    if (!details) {
      details = await Others.create({
        user: user._id,
      });

      details = details.toObject();
    }

    /*
    |--------------------------------------------------------------------------
    | COMBINE USER + DETAILS
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      user: {
        ...user,

        details: {
          ...details,
        },
      },
    });
  } catch (error) {
    console.error("GET MY PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load profile",
      error: error.message,
    });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FIND USER
    |--------------------------------------------------------------------------
    */

    const user = await Usercbt.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const {
      firstName,
      middleName,
      lastName,
      phone,
      whatsapp_no,
      ExamYear,
      location,
      details,
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | UPDATE USER FIELDS
    |--------------------------------------------------------------------------
    |
    | DO NOT allow the client to change:
    |
    | role
    | commissionPercentage
    | adminOwner
    | teacherOwner
    | createdBy
    | status
    |
    | Those should remain controlled by your backend/admin.
    |
    |--------------------------------------------------------------------------
    */

    if (firstName !== undefined) {
      user.firstName = String(firstName).trim();
    }

    if (middleName !== undefined) {
      user.middleName = middleName
        ? String(middleName).trim()
        : null;
    }

    if (lastName !== undefined) {
      user.lastName = lastName
        ? String(lastName).trim()
        : null;
    }

    if (phone !== undefined) {
      user.phone = phone
        ? String(phone).trim()
        : null;
    }

    if (whatsapp_no !== undefined) {
      user.whatsapp_no = whatsapp_no
        ? String(whatsapp_no).trim()
        : null;
    }

    if (ExamYear !== undefined) {
      user.ExamYear = Number(ExamYear);
    }

    if (location !== undefined && location !== null) {
      if (location.country !== undefined) {
        user.location.country = String(location.country).trim();
      }

      if (location.state !== undefined) {
        user.location.state = String(location.state).trim();
      }

      if (location.city !== undefined) {
        user.location.city = String(location.city).trim();
      }

      if (location.address !== undefined) {
        user.location.address = String(location.address).trim();
      }
    }

    await user.save();

    /*
    |--------------------------------------------------------------------------
    | UPDATE OTHERS
    |--------------------------------------------------------------------------
    */

    let otherDetails = await Others.findOne({
      user: user._id,
    });

    if (!otherDetails) {
      otherDetails = new Others({
        user: user._id,
      });
    }

    if (details) {
      /*
      |--------------------------------------------------------------------------
      | GENERAL DETAILS
      |--------------------------------------------------------------------------
      */

      if (details.bio !== undefined) {
        otherDetails.bio = String(details.bio).trim();
      }

      if (details.gender !== undefined) {
        otherDetails.gender = details.gender;
      }

      if (details.dateOfBirth !== undefined) {
        otherDetails.dateOfBirth =
          details.dateOfBirth || null;
      }

      if (details.language !== undefined) {
        otherDetails.language =
          String(details.language).trim();
      }

      /*
      |--------------------------------------------------------------------------
      | STUDENT DETAILS
      |--------------------------------------------------------------------------
      */

      if (details.student) {
        if (details.student.examTarget !== undefined) {
          otherDetails.student.examTarget =
            String(details.student.examTarget).trim();
        }

        if (details.student.subjects !== undefined) {
            console.log(details.student.subjects);
            
          otherDetails.subjects =
            Array.isArray(details.student.subjects)
              ? details.student.subjects
              : [];
        }

        if (details.student.schoolName !== undefined) {
          otherDetails.student.schoolName =
            String(details.student.schoolName).trim();
        }

        if (details.student.className !== undefined) {
          otherDetails.student.className =
            String(details.student.className).trim();
        }

        if (details.student.studyLevel !== undefined) {
          otherDetails.student.studyLevel =
            String(details.student.studyLevel).trim();
        }
      }

      /*
      |--------------------------------------------------------------------------
      | TEACHER DETAILS
      |--------------------------------------------------------------------------
      */

      if (details.teacher) {
        if (details.teacher.address !== undefined) {
          otherDetails.teacher.address =
            String(details.teacher.address).trim();
        }

        if (details.teacher.qualification !== undefined) {
          otherDetails.teacher.qualification =
            String(details.teacher.qualification).trim();
        }

        if (details.teacher.experience !== undefined) {
          otherDetails.teacher.experience =
            Number(details.teacher.experience) || 0;
        }

        if (details.teacher.skills !== undefined) {
          otherDetails.teacher.skills =
            Array.isArray(details.teacher.skills)
              ? details.teacher.skills
              : [];
        }

        if (details.teacher.subjects !== undefined) {
          otherDetails.teacher.subjects =
            Array.isArray(details.teacher.subjects)
              ? details.teacher.subjects
              : [];
        }

        if (details.teacher.language !== undefined) {
          otherDetails.teacher.language =
            String(details.teacher.language).trim();
        }

        if (details.teacher.about !== undefined) {
          otherDetails.teacher.about =
            String(details.teacher.about).trim();
        }
      }

      /*
      |--------------------------------------------------------------------------
      | ADMIN DETAILS
      |--------------------------------------------------------------------------
      */

      if (details.admin) {
        if (details.admin.department !== undefined) {
          otherDetails.admin.department =
            String(details.admin.department).trim();
        }

        if (details.admin.adminLevel !== undefined) {
          otherDetails.admin.adminLevel =
            String(details.admin.adminLevel).trim();
        }

        if (details.admin.maintenanceMode !== undefined) {
          otherDetails.admin.maintenanceMode =
            Boolean(details.admin.maintenanceMode);
        }

        if (details.admin.about !== undefined) {
          otherDetails.admin.about =
            String(details.admin.about).trim();
        }
      }

      /*
      |--------------------------------------------------------------------------
      | BANK
      |--------------------------------------------------------------------------
      */

      if (details.bank) {
        if (details.bank.bankName !== undefined) {
          otherDetails.bank.bankName =
            String(details.bank.bankName).trim();
        }

        if (details.bank.accountNumber !== undefined) {
          const accountNumber = String(
            details.bank.accountNumber
          ).replace(/\D/g, "");

          if (
            accountNumber.length !== 10
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Bank account number must contain exactly 10 digits",
            });
          }

          otherDetails.bank.accountNumber =
            accountNumber;
        }

        if (details.bank.accountName !== undefined) {
          otherDetails.bank.accountName =
            String(details.bank.accountName).trim();
        }

        /*
        |----------------------------------------------------------------------
        | Changing bank details requires verification again
        |----------------------------------------------------------------------
        */

        otherDetails.bank.verified = false;
        otherDetails.bank.verifiedAt = null;
      }

      /*
      |--------------------------------------------------------------------------
      | NOTIFICATIONS
      |--------------------------------------------------------------------------
      */

      if (details.notifications) {
        if (
          details.notifications.dailyReminder !==
          undefined
        ) {
          otherDetails.notifications.dailyReminder =
            Boolean(
              details.notifications.dailyReminder
            );
        }

        if (
          details.notifications.streakAlert !==
          undefined
        ) {
          otherDetails.notifications.streakAlert =
            Boolean(
              details.notifications.streakAlert
            );
        }

        if (
          details.notifications.weeklyReport !==
          undefined
        ) {
          otherDetails.notifications.weeklyReport =
            Boolean(
              details.notifications.weeklyReport
            );
        }

        if (
          details.notifications.promoEmails !==
          undefined
        ) {
          otherDetails.notifications.promoEmails =
            Boolean(
              details.notifications.promoEmails
            );
        }
      }

      /*
      |--------------------------------------------------------------------------
      | APPEARANCE
      |--------------------------------------------------------------------------
      */

      if (details.appearance?.theme !== undefined) {
        if (
          ["light", "dark"].includes(
            details.appearance.theme
          )
        ) {
          otherDetails.appearance.theme =
            details.appearance.theme;
        }
      }

      /*
      |--------------------------------------------------------------------------
      | PREFERENCES
      |--------------------------------------------------------------------------
      */

      if (details.preferences) {
        if (
          details.preferences.timezone !==
          undefined
        ) {
          otherDetails.preferences.timezone =
            String(
              details.preferences.timezone
            ).trim();
        }

        if (
          details.preferences.currency !==
          undefined
        ) {
          otherDetails.preferences.currency =
            String(
              details.preferences.currency
            ).trim();
        }
      }
    }

    await otherDetails.save();

    /*
    |--------------------------------------------------------------------------
    | RETURN UPDATED PROFILE
    |--------------------------------------------------------------------------
    */

    const cleanUser = await Usercbt.findById(user._id)
      .select(
        "-password -refreshToken -emailVerificationToken -resetPasswordToken"
      )
      .lean();

    const cleanDetails =
      await Others.findOne({
        user: user._id,
      }).lean();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",

      user: {
        ...cleanUser,
        details: cleanDetails || {},
      },
    });
  } catch (error) {
    console.error("UPDATE MY PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};