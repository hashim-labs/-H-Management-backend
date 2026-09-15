const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  emailVerified: {
    type: Boolean,
    default: true,
  },
  verificationCodeHash: String,
  verificationCodeExpiresAt: Date,
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  phone: {
    type: String,
    required: true,
  },
  name: String,
  status: String,        // checked-in / checked-out / reserved
  room: String,
  checkIn: Date,
  checkOut: Date,
  loyaltyTier: String,   // Bronze / Silver / Gold / Platinum
  visits: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
