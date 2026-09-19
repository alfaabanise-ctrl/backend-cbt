import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Wallet from "../model/Wallet.js";
import Usercbt from "../model/Users.js";
import Others from "../model/Others.js";


export const getMyProfile = async (req, res) => {
  try {
    const userId =
      req.user?._id ||
      req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    /* ============================================================
     * FIND USER
     * ============================================================ */

    const user =
      await Usercbt.findById(userId)
        .select(
          "-password -refreshToken -emailVerificationToken -resetPasswordToken"
        )
        .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    /* ============================================================
     * FIND OTHER DETAILS
     * ============================================================ */

    let details =
      await Others.findOne({
        user: user._id,
      }).lean();

    /*
     * Create Others document if it does not exist.
     */
    if (!details) {
      details =
        await Others.create({
          user: user._id,
        });

      details = details.toObject();
    }

    /* ============================================================
     * FIND WALLET
     * ============================================================ */

    let wallet = null;

    /*
     * Only admin and teacher have payout wallets.
     */
    let ownerType = null;

    if (user.role === "admin") {
      ownerType = "ADMIN";
    }

    if (user.role === "teacher") {
      ownerType = "TEACHER";
    }

    if (ownerType) {
      wallet =
        await Wallet.findOne({
          owner: user._id,
          ownerType,
        }).lean();
    }

    /* ============================================================
     * BANK DETAILS
     *
     * BANK NOW COMES FROM WALLET
     * NOT Others
     * ============================================================ */

    const bankDetails =
      wallet?.bankDetails || null;

    /* ============================================================
     * RETURN PROFILE
     * ============================================================ */

    return res.status(200).json({
      success: true,

      user: {
        ...user,

        details: {
          ...details,

          /*
           * Override bank details with
           * Wallet.bankDetails.
           *
           * The actual source of truth is Wallet.
           */
          bank: bankDetails,
        },

        /*
         * Keep wallet separate too.
         */
        wallet: wallet,
      },
    });

  } catch (error) {
    console.error(
      "GET MY PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load profile",
      error: error.message,
    });
  }
};

/* ================================================================
 * GET OR CREATE WALLET
 * ================================================================ */

const getOrCreateWallet = async (
  ownerId,
  ownerType,
  session = null
) => {
  let query = Wallet.findOne({
    owner: ownerId,
    ownerType,
  });

  if (session) {
    query = query.session(session);
  }

  let wallet = await query;

  if (wallet) {
    return wallet;
  }

  try {
    const walletData = {
      owner: ownerId,

      ownerType,

      currency: "NGN",

      availableBalance: 0,

      pendingBalance: 0,

      totalEarned: 0,

      totalWithdrawn: 0,

      totalRefunded: 0,

      status: "ACTIVE",

      bankDetails: {
        bankCode: null,
        bankName: null,
        accountNumber: null,
        accountName: null,
        verified: false,
      },

      lastTransactionAt: null,

      lastWithdrawalAt: null,
    };

    const options = session
      ? { session }
      : {};

    const [createdWallet] =
      await Wallet.create(
        [walletData],
        options
      );

    return createdWallet;

  } catch (error) {

    /*
     * Another request may have created
     * the wallet at the same time.
     */
    if (error?.code === 11000) {

      let existingQuery =
        Wallet.findOne({
          owner: ownerId,
          ownerType,
        });

      if (session) {
        existingQuery =
          existingQuery.session(session);
      }

      const existingWallet =
        await existingQuery;

      if (existingWallet) {
        return existingWallet;
      }
    }

    throw error;
  }
};


/* ================================================================
 * UPDATE CURRENT USER PROFILE
 * ================================================================ */

export const updateMyProfile = async (
  req,
  res
) => {

  const session =
    await mongoose.startSession();

  try {

    const userId =
      req.user?._id ||
      req.user?.id;


    /* ============================================================
     * AUTHENTICATION
     * ============================================================ */

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }


    /* ============================================================
     * VALIDATE USER ID
     * ============================================================ */

    if (
      !mongoose.Types.ObjectId.isValid(
        userId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid user ID",
      });
    }


    /* ============================================================
     * BODY
     * ============================================================ */

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


    let responseData;


    /* ============================================================
     * TRANSACTION
     * ============================================================ */

    await session.withTransaction(
      async () => {

        /* ========================================================
         * FIND USER
         * ======================================================== */

        const user =
          await Usercbt.findById(
            userId
          ).session(session);


        if (!user) {
          throw new Error(
            "User not found"
          );
        }


        /* ========================================================
         * USER ROLE
         * ======================================================== */

        const userRole =
          user.role;


        let ownerType = null;


        if (userRole === "teacher") {
          ownerType = "TEACHER";
        }

        if (userRole === "admin") {
          ownerType = "ADMIN";
        }


        /* ========================================================
         * UPDATE USER BASIC DETAILS
         * ======================================================== */

        if (firstName !== undefined) {

          const value =
            String(firstName).trim();

          if (!value) {
            throw new Error(
              "First name is required"
            );
          }

          user.firstName = value;
        }


        if (middleName !== undefined) {

          user.middleName =
            middleName
              ? String(
                  middleName
                ).trim()
              : null;
        }


        if (lastName !== undefined) {

          user.lastName =
            lastName
              ? String(
                  lastName
                ).trim()
              : null;
        }


        if (phone !== undefined) {

          user.phone =
            phone
              ? String(phone).trim()
              : null;
        }


        if (
          whatsapp_no !== undefined
        ) {

          user.whatsapp_no =
            whatsapp_no
              ? String(
                  whatsapp_no
                ).trim()
              : null;
        }


        if (ExamYear !== undefined) {

          if (
            ExamYear === null ||
            ExamYear === ""
          ) {
            user.ExamYear = null;
          } else {

            const year =
              Number(ExamYear);

            if (
              !Number.isFinite(year)
            ) {
              throw new Error(
                "Invalid exam year"
              );
            }

            user.ExamYear = year;
          }
        }


        /* ========================================================
         * LOCATION
         * ======================================================== */

        if (
          location !== undefined &&
          location !== null
        ) {

          if (
            location.country !==
            undefined
          ) {
            user.location.country =
              String(
                location.country
              ).trim();
          }


          if (
            location.state !==
            undefined
          ) {
            user.location.state =
              String(
                location.state
              ).trim();
          }


          if (
            location.city !==
            undefined
          ) {
            user.location.city =
              String(
                location.city
              ).trim();
          }


          if (
            location.address !==
            undefined
          ) {
            user.location.address =
              String(
                location.address
              ).trim();
          }
        }


        await user.save({
          session,
        });


        /* ========================================================
         * FIND / CREATE OTHERS
         * ======================================================== */

        let otherDetails =
          await Others.findOne({
            user: user._id,
          }).session(session);


        if (!otherDetails) {

          otherDetails =
            new Others({
              user: user._id,
            });
        }


        /* ========================================================
         * GENERAL DETAILS
         * ======================================================== */

        if (details) {

          if (
            details.bio !==
            undefined
          ) {
            otherDetails.bio =
              String(
                details.bio
              ).trim();
          }


          if (
            details.gender !==
            undefined
          ) {
            otherDetails.gender =
              details.gender;
          }


          if (
            details.dateOfBirth !==
            undefined
          ) {
            otherDetails.dateOfBirth =
              details.dateOfBirth ||
              null;
          }


          if (
            details.language !==
            undefined
          ) {
            otherDetails.language =
              String(
                details.language
              ).trim();
          }


          /* ======================================================
           * STUDENT
           * ====================================================== */

          if (details.student) {

            if (
              details.student
                .examTarget !==
              undefined
            ) {
              otherDetails.student.examTarget =
                String(
                  details.student
                    .examTarget
                ).trim();
            }


            if (
              details.student
                .subjects !==
              undefined
            ) {
              otherDetails.subjects =
                Array.isArray(
                  details.student
                    .subjects
                )
                  ? [
                      ...details.student
                        .subjects,
                    ]
                  : [];
            }


            if (
              details.student
                .schoolName !==
              undefined
            ) {
              otherDetails.student.schoolName =
                String(
                  details.student
                    .schoolName
                ).trim();
            }


            if (
              details.student
                .className !==
              undefined
            ) {
              otherDetails.student.className =
                String(
                  details.student
                    .className
                ).trim();
            }


            if (
              details.student
                .studyLevel !==
              undefined
            ) {
              otherDetails.student.studyLevel =
                String(
                  details.student
                    .studyLevel
                ).trim();
            }
          }


          /* ======================================================
           * TEACHER
           * ====================================================== */

          if (details.teacher) {

            if (
              details.teacher
                .address !==
              undefined
            ) {
              otherDetails.teacher.address =
                String(
                  details.teacher
                    .address
                ).trim();
            }


            if (
              details.teacher
                .qualification !==
              undefined
            ) {
              otherDetails.teacher.qualification =
                String(
                  details.teacher
                    .qualification
                ).trim();
            }


            if (
              details.teacher
                .experience !==
              undefined
            ) {
              otherDetails.teacher.experience =
                Number(
                  details.teacher
                    .experience
                ) || 0;
            }


            if (
              details.teacher
                .skills !==
              undefined
            ) {
              otherDetails.teacher.skills =
                Array.isArray(
                  details.teacher
                    .skills
                )
                  ? [
                      ...details.teacher
                        .skills,
                    ]
                  : [];
            }


            if (
              details.teacher
                .subjects !==
              undefined
            ) {
              otherDetails.teacher.subjects =
                Array.isArray(
                  details.teacher
                    .subjects
                )
                  ? [
                      ...details.teacher
                        .subjects,
                    ]
                  : [];
            }


            if (
              details.teacher
                .language !==
              undefined
            ) {
              otherDetails.teacher.language =
                String(
                  details.teacher
                    .language
                ).trim();
            }


            if (
              details.teacher
                .about !==
              undefined
            ) {
              otherDetails.teacher.about =
                String(
                  details.teacher
                    .about
                ).trim();
            }
          }


          /* ======================================================
           * ADMIN
           * ====================================================== */

          if (details.admin) {

            if (
              details.admin
                .department !==
              undefined
            ) {
              otherDetails.admin.department =
                String(
                  details.admin
                    .department
                ).trim();
            }


            /*
             * Don't allow the frontend
             * to change adminLevel.
             *
             * If you want it editable,
             * remove this restriction.
             */
            if (
              details.admin
                .adminLevel !==
              undefined
            ) {
              otherDetails.admin.adminLevel =
                String(
                  details.admin
                    .adminLevel
                ).trim();
            }


            if (
              details.admin
                .maintenanceMode !==
              undefined
            ) {
              otherDetails.admin
                .maintenanceMode =
                Boolean(
                  details.admin
                    .maintenanceMode
                );
            }


            if (
              details.admin.about !==
              undefined
            ) {
              otherDetails.admin.about =
                String(
                  details.admin.about
                ).trim();
            }
          }


          /* ======================================================
           * BANK DETAILS
           *
           * IMPORTANT:
           *
           * BANK DETAILS ARE SAVED TO WALLET,
           * NOT Others.
           * ====================================================== */

          if (details.bank) {

            /*
             * Only admin and teacher
             * have payout wallets.
             */

            if (!ownerType) {
              throw new Error(
                "Bank details are only available for admins and teachers"
              );
            }


            /* ----------------------------------------------
             * Validate bank name
             * ---------------------------------------------- */

            const bankName =
              details.bank.bankName !==
              undefined
                ? String(
                    details.bank
                      .bankName
                  ).trim()
                : "";


            if (!bankName) {
              throw new Error(
                "Bank name is required"
              );
            }


            /* ----------------------------------------------
             * Validate account number
             * ---------------------------------------------- */

            const accountNumber =
              details.bank.accountNumber !==
              undefined
                ? String(
                    details.bank
                      .accountNumber
                  ).replace(
                    /\D/g,
                    ""
                  )
                : "";


            if (
              accountNumber.length !==
              10
            ) {
              throw new Error(
                "Bank account number must contain exactly 10 digits"
              );
            }


            /* ----------------------------------------------
             * Validate account name
             * ---------------------------------------------- */

            const accountName =
              details.bank.accountName !==
              undefined
                ? String(
                    details.bank
                      .accountName
                  ).trim()
                : "";


            if (!accountName) {
              throw new Error(
                "Bank account name is required"
              );
            }


            /* ----------------------------------------------
             * GET / CREATE WALLET
             * ---------------------------------------------- */

            const wallet =
              await getOrCreateWallet(
                user._id,
                ownerType,
                session
              );


            /*
             * If bank information changes,
             * verification must be reset.
             */

            const bankChanged =
              wallet.bankDetails?.bankName !==
                bankName ||
              wallet.bankDetails?.accountNumber !==
                accountNumber ||
              wallet.bankDetails?.accountName !==
                accountName;


            wallet.bankDetails = {
              bankCode:
                wallet.bankDetails
                  ?.bankCode || null,

              bankName,

              accountNumber,

              accountName,

              verified:
                bankChanged
                  ? false
                  : Boolean(
                      wallet.bankDetails
                        ?.verified
                    ),

            };


            /*
             * Verification timestamp
             */
            if (bankChanged) {

              wallet.bankDetails.verifiedAt =
                null;

            } else {

              /*
               * Preserve existing timestamp.
               */
              wallet.bankDetails.verifiedAt =
                wallet.bankDetails
                  ?.verifiedAt ||
                null;
            }


            await wallet.save({
              session,
            });


            /*
             * IMPORTANT:
             *
             * Do NOT save bank details
             * to Others.bank anymore.
             *
             * Wallet is now the source
             * of truth for payouts.
             */
          }


          /* ======================================================
           * NOTIFICATIONS
           * ====================================================== */

          if (
            details.notifications
          ) {

            if (
              details.notifications
                .dailyReminder !==
              undefined
            ) {
              otherDetails
                .notifications
                .dailyReminder =
                Boolean(
                  details.notifications
                    .dailyReminder
                );
            }


            if (
              details.notifications
                .streakAlert !==
              undefined
            ) {
              otherDetails
                .notifications
                .streakAlert =
                Boolean(
                  details.notifications
                    .streakAlert
                );
            }


            if (
              details.notifications
                .weeklyReport !==
              undefined
            ) {
              otherDetails
                .notifications
                .weeklyReport =
                Boolean(
                  details.notifications
                    .weeklyReport
                );
            }


            if (
              details.notifications
                .promoEmails !==
              undefined
            ) {
              otherDetails
                .notifications
                .promoEmails =
                Boolean(
                  details.notifications
                    .promoEmails
                );
            }
          }


          /* ======================================================
           * APPEARANCE
           * ====================================================== */

          if (
            details.appearance
              ?.theme !==
            undefined
          ) {

            const theme =
              details.appearance.theme;


            if (
              theme !== "light" &&
              theme !== "dark"
            ) {
              throw new Error(
                "Invalid theme"
              );
            }


            otherDetails
              .appearance
              .theme = theme;
          }


          /* ======================================================
           * PREFERENCES
           * ====================================================== */

          if (
            details.preferences
          ) {

            if (
              details.preferences
                .timezone !==
              undefined
            ) {
              otherDetails.preferences
                .timezone =
                String(
                  details.preferences
                    .timezone
                ).trim();
            }


            if (
              details.preferences
                .currency !==
              undefined
            ) {
              otherDetails.preferences
                .currency =
                String(
                  details.preferences
                    .currency
                ).trim();
            }
          }
        }


        /* ========================================================
         * SAVE OTHERS
         * ======================================================== */

        await otherDetails.save({
          session,
        });


        /* ========================================================
         * GET CLEAN USER
         * ======================================================== */

        const cleanUser =
          await Usercbt.findById(
            user._id
          )
            .select(
              "-password -refreshToken -emailVerificationToken -resetPasswordToken"
            )
            .lean()
            .session(session);


        const cleanDetails =
          await Others.findOne({
            user: user._id,
          })
            .lean()
            .session(session);


        /* ========================================================
         * GET WALLET
         * ======================================================== */

        let cleanWallet = null;


        if (ownerType) {

          cleanWallet =
            await Wallet.findOne({
              owner: user._id,
              ownerType,
            })
              .lean()
              .session(session);
        }


        /* ========================================================
         * RESPONSE
         * ======================================================== */

        responseData = {
          user: {
            ...cleanUser,

            details:
              cleanDetails || {},

            /*
             * Keep wallet separate.
             *
             * This is useful for frontend.
             */
            wallet:
              cleanWallet || null,
          },
        };
      }
    );


    /* ============================================================
     * SUCCESS
     * ============================================================ */

    return res.status(200).json({
      success: true,

      message:
        "Profile updated successfully",

      ...responseData,
    });


  } catch (error) {

    console.error(
      "UPDATE MY PROFILE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to update profile",

      error:
        error.message,
    });

  } finally {

    await session.endSession();
  }
};