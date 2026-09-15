const mongoose = require("mongoose");

const pendingRegistrationSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phone: { type: String, required: true },
  name: String,
  verificationCodeHash: { type: String, required: true },
  verificationCodeExpiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 },
});

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema);
