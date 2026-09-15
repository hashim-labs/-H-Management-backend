const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Staff = require("../models/staff");
const { sendStaffCredentialsEmail } = require("../services/email");

const router = express.Router();

// Middleware: JWT Auth
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Authentication token required" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};



// Create staff
router.post("/", async (req, res) => {
  try {
    if (process.env.ADMIN_API_KEY && req.headers["x-admin-key"] !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ message: "Admin authorization required" });
    }
    const { name, position, department, email, phone, status, shifts, hireDate, salary, password } = req.body;
    if (!name || !position || !department || !email || !phone || !hireDate || !salary) {
      return res.status(400).json({ message: "Name, assignment, contact, hire date and salary are required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const temporaryPassword = password || crypto.randomBytes(12).toString("base64url");
    if (temporaryPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);
    const staff = new Staff({ name, position, department, email: normalizedEmail, phone, status, shifts, hireDate, salary, password: hashedPassword, mustChangePassword: true });
    await staff.save();
    let emailSent = false;
    try {
      await sendStaffCredentialsEmail({
        email: normalizedEmail, name, password: temporaryPassword, position, department,
        shifts: shifts || "Day",
        loginUrl: process.env.FRONTEND_URL || "http://localhost:3000/user-dashboard/login",
      });
      staff.credentialsSentAt = new Date();
      await staff.save();
      emailSent = true;
    } catch (emailError) {
      console.error("Staff credentials email error:", emailError);
    }
    const responseStaff = staff.toObject();
    delete responseStaff.password;
    res.status(201).json({ ...responseStaff, emailSent, temporaryPassword: emailSent ? undefined : temporaryPassword });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A staff account already exists for this email" });
    res.status(500).json({ error: err.message });
  }
});

// Get all staff
router.get("/all", async (req, res) => {
  try {
    const staff = await Staff.find().select("-password");
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update staff
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true }).select("-password");
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete staff
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const staff = await Staff.findByIdAndDelete(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
