const mongoose = require("mongoose");

const CodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["active", "expired"], default: "active" },
});

module.exports = mongoose.model("Code", CodeSchema);
