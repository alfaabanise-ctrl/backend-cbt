import mongoose from "mongoose";

const inspectionSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Propert",
    required: true
  },

  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usertp",
    required: true
  },

  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usertp",
    required: true
  },

  inspectionDate: {
    type: Date,
    required: true
  },
  isMessaged: {
    type: Boolean,
    default: false
  },
  inspectionTime: {
    type: String,
    required: true
  },

  phone: {
    type: String,
    required: true
  },

  message: {
    type: String,
    default: ""
  },

  status: {
    type: String,
    enum: [
      "unverfy",
      "pending",
      "approved",
      "rejected",
      "completed",
      "cancelled"
    ],
    default: "pending"
  }

}, {
  timestamps: true
});

export default mongoose.model(
  "Inspection",
  inspectionSchema
);