import mongoose from "mongoose";

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    middleName: {
      type: String,
      default: null,
      trim: true,
    },

    lastName: {
      type: String,
      default: null,
      trim: true,
    },

    avatar: {
      type: String,
      default: null,
    },

    avatar_public_id: {
      type: String,
      default: null,
    },

    authProvider: {
      type: String,
      default: null,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    whatsapp_no: {
      type: String,
      trim: true,
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    ExamYear: {
      type: Number,
      min: 2000,
      max: 2100,
      index: true,

      default: function () {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        return month <= 5 ? year : year + 1;
      },

      required: function () {
        return this.role === "student";
      },
    },

    location: {
      country: {
        type: String,
        default: "Nigeria",
      },

      state: {
        type: String,
        default: "",
      },

      city: {
        type: String,
        default: "",
      },

      address: {
        type: String,
        default: "",
      },
    },

    role: {
      type: String,

      enum: [
        "admin",
        "superadmin",
        "student",
        "teacher",
      ],

      default: "student",
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | USER RELATIONSHIPS
    |--------------------------------------------------------------------------
    */

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
      index: true,
    },

    createdByRole: {
      type: String,

      enum: [
        "admin",
        "superadmin",
        "student",
        "teacher",
      ],

      default: null,
    },

    /*
    |--------------------------------------------------------------------------
    | ADMIN OWNER
    |--------------------------------------------------------------------------
    |
    | Student:
    |    student.adminOwner -> admin
    |
    | Teacher:
    |    teacher.adminOwner -> admin
    |
    */

    adminOwner: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | TEACHER OWNER
    |--------------------------------------------------------------------------
    |
    | Student:
    |
    |    student.teacherOwner -> teacher
    |
    */

    teacherOwner: {
      type: Schema.Types.ObjectId,
      ref: "Usercbt",
      default: null,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | COMMISSION PERCENTAGE
    |--------------------------------------------------------------------------
    |
    | This controls how much this user receives.
    |
    | Example:
    |
    | teacher.commissionPercentage = 17.5
    |
    | admin.commissionPercentage = 7.5
    |
    | Student pays ₦4,000:
    |
    | Teacher = 17.5% = ₦700
    | Admin   = 7.5%  = ₦300
    | Platform = 75%  = ₦3,000
    |
    | Only teacher/admin should normally have
    | a commission percentage.
    |
    */

    commissionPercentage: {
      type: Number,

      min: [0, "Commission percentage cannot be negative"],

      max: [100, "Commission percentage cannot exceed 100"],

      default: 0,

      validate: {
        validator: function (value) {
          return (
            Number.isFinite(value) &&
            value >= 0 &&
            value <= 100
          );
        },

        message:
          "Commission percentage must be between 0 and 100",
      },
    },

    password: {
      type: String,
    },

    refreshToken: {
      type: String,
      default: undefined,
      select: false,
    },

    emailVerificationToken: {
      type: String,
      default: undefined,
      select: false,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },

    resetPasswordToken: {
      type: String,
      select: false,
    },

    googleId: {
      type: String,
      default: null,
    },

    /*
    |--------------------------------------------------------------------------
    | LEGACY BALANCE
    |--------------------------------------------------------------------------
    |
    | Keep this temporarily if existing code uses it.
    |
    | The real wallet balance should come from Wallet.
    |
    */

    walletBalance: {
      type: Number,
      default: 0,
    },

    /*
    |--------------------------------------------------------------------------
    | ACCOUNT STATUS
    |--------------------------------------------------------------------------
    */

    status: {
      type: String,

      enum: [
        "Active",
        "Suspended",
        "Inactive",
      ],

      default: "Active",
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | SOFTWARE TOKEN
    |--------------------------------------------------------------------------
    */

    softwareToken: {
      type: Schema.Types.ObjectId,
      ref: "SoftwareToken",
      default: null,
      index: true,
    },
  },

  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

UserSchema.index({
  role: 1,
  adminOwner: 1,
});

UserSchema.index({
  role: 1,
  teacherOwner: 1,
});

UserSchema.index({
  role: 1,
  commissionPercentage: 1,
});

/*
|--------------------------------------------------------------------------
| MODEL
|--------------------------------------------------------------------------
*/

const Usercbt =
  mongoose.models.Usercbt ||
  mongoose.model(
    "Usercbt",
    UserSchema
  );

export default Usercbt;