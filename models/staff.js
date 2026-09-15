const mongoose = require("mongoose");

const StaffSchema = new mongoose.Schema({
  name: { type: String, required: true },
  position: { type: String, required: true },
  department: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  status: { type: String, default: "active" },
  shifts: { type: String, default: "Day" },
  hireDate: { type: Date, required: true },
  salary: { type: String, required: true },
  password: { type: String, required: true }, // Hashed password
  role: { type: String, default: "staff" },
  mustChangePassword: { type: Boolean, default: true },
  credentialsSentAt: { type: Date },
});

module.exports = mongoose.model("Staff", StaffSchema);
