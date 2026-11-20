import mongoose from "mongoose";

const examMediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: "" },
    alt: { type: String, default: "" },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    mime: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

const ExamMedia =
  mongoose.models.ExamMedia ||
  mongoose.model("ExamMedia", examMediaSchema);

export default ExamMedia;
