import mongoose from "mongoose";
const { Schema } = mongoose;

const kycSchema = new Schema(
{
  userId: {
    type: Schema.Types.ObjectId,
    ref: "Usertp",
    required: true,
    unique: true
  },

  // what user selected
  kycType: {
    type: String,
    enum: ["individual", "business"],
    default: "individual",
  },

  /* ================= PERSONAL ================= */

  nin: {
    type: String,
    match: [/^\d{11}$/, "NIN must be 11 digits"],
  },

  phone: {
    type: String,
    match: [/^\d{11}$/, "Phone must be 11 digits"],
  },

  ninImage: {
    url: String,
    public_id: String
  },
  currentStep: String,



  /* ================= FACE ================= */

  faceImage: {
    url: String,
    public_id: String
  },

  faceVector: {
    type: [Number]
  },

  faceVerified: {
    type: Boolean,
    default: false
  },

  /* ================= BUSINESS ================= */

  business: {
    name: String,
    cacNumber: String,
  
    cacImage: {
      url: String,
      public_id: String
    },

      logo: {
      url: String,
      public_id: String
    }
  },
  businessType: String,

  businessVerified: {
    type: Boolean,
    default: false
  },

  /* ================= GLOBAL STATUS ================= */

  status: {
    type: String,
    enum: ["draft", "pending", "approved", "rejected"],
    default: "draft"
  },

  adminNote: String

},
{ timestamps: true }
);

export default mongoose.model("Kyc", kycSchema);