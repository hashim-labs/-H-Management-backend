const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Staff = require("../models/staff");
const PendingRegistration = require("../models/pendingRegistration");
const Booking = require("../models/booking");
const crypto = require("crypto");
const { sendVerificationEmail } = require("../services/email");

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Extract token from "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded token data to request
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password, phone, name } = req.body;
    if (!email || !password || !phone) {
      return res.status(400).json({ message: "Email, password & phone required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ message: "User already exists" });

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(crypto.randomInt(100000, 1000000));

    const pendingRegistration = new PendingRegistration({
      email: normalizedEmail,
      password: hashedPassword,
      phone,
      name,
      emailVerified: false,
      verificationCodeHash: crypto.createHash("sha256").update(otp).digest("hex"),
      verificationCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          password: hashedPassword,
          phone,
          name,
          verificationCodeHash: pendingRegistration.verificationCodeHash,
          verificationCodeExpiresAt: pendingRegistration.verificationCodeExpiresAt,
          createdAt: new Date(),
        },
        $setOnInsert: { email: normalizedEmail },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    try {
      await sendVerificationEmail({ email: normalizedEmail, name, otp });
    } catch (emailError) {
      await PendingRegistration.deleteOne({ email: normalizedEmail });
      console.error("Verification email error:", emailError);
      return res.status(503).json({ message: "Unable to send verification email. Please try again later." });
    }

    res.status(201).json({ message: "Verification code sent to your email", email: normalizedEmail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/verify-email", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();
    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "A valid six-digit verification code is required" });
    }

    const pendingRegistration = await PendingRegistration.findOne({ email });
    if (!pendingRegistration) {
      const existing = await User.findOne({ email });
      if (existing?.emailVerified) return res.json({ message: "Email is already verified" });
      return res.status(404).json({ message: "Registration request not found. Please register again." });
    }
    if (!pendingRegistration.verificationCodeExpiresAt || pendingRegistration.verificationCodeExpiresAt < new Date()) {
      return res.status(400).json({ message: "Verification code expired. Request a new code." });
    }

    const hash = crypto.createHash("sha256").update(otp).digest("hex");
    if (hash !== pendingRegistration.verificationCodeHash) {
      return res.status(400).json({ message: "Incorrect verification code" });
    }

    await User.create({
      email: pendingRegistration.email,
      password: pendingRegistration.password,
      phone: pendingRegistration.phone,
      name: pendingRegistration.name,
      emailVerified: true,
    });
    await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
    return res.json({ message: "Email verified successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Unable to verify email" });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const pendingRegistration = await PendingRegistration.findOne({ email });
    if (!pendingRegistration) {
      const existing = await User.findOne({ email });
      if (existing?.emailVerified) return res.json({ message: "Email is already verified" });
      return res.status(404).json({ message: "Registration request not found. Please register again." });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    pendingRegistration.verificationCodeHash = crypto.createHash("sha256").update(otp).digest("hex");
    pendingRegistration.verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pendingRegistration.save();
    await sendVerificationEmail({ email: pendingRegistration.email, name: pendingRegistration.name, otp });
    return res.json({ message: "A new verification code was sent" });
  } catch (err) {
    console.error("Resend verification email error:", err);
    return res.status(503).json({ message: "Unable to send verification email. Please try again later." });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    const staff = user ? null : await Staff.findOne({ email: normalizedEmail });
    if (!user && !staff) return res.status(400).json({ message: "Invalid credentials" });
    const account = user || staff;
    if (staff && staff.status !== "active") return res.status(403).json({ message: "This staff account is not active" });
    if (user && user.emailVerified === false) {
      return res.status(403).json({ message: "Please verify your email before signing in", requiresVerification: true });
    }

    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: account._id, email: account.email, role: staff ? "staff" : "user" }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Convert user document to plain object and exclude password
    const userData = account.toObject();
    delete userData.password;
    userData.role = staff ? "staff" : "user";

    // Return token and all user data
    res.json({
      token,
      user: userData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change password for the authenticated user.
router.put("/password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Unable to change password" });
  }
});

// Admin-only password reset. Keep the service key in backend environment variables.
router.put("/users/:id/password", async (req, res) => {
  try {
    if (!process.env.ADMIN_API_KEY || req.headers["x-admin-key"] !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ message: "Admin authorization required" });
    }

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    return res.json({ message: "Guest password reset successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Unable to reset guest password" });
  }
});

// backend/routes/user.js
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "No authenticated user found" });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const bookings = await Booking.find({ userId: req.user.id }).populate(
      "userId",
      "email phone name"
    );

    const userData = {
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      checkIn: user.checkIn,
      checkOut: user.checkOut,
      room: user.room,
      loyaltyTier: user.loyaltyTier,
      visits: user.visits,
      bookings: bookings.map((booking) => ({
        id: booking._id,
        hotelId: booking.hotelId,
        checkIn: booking.checkin,
        checkOut: booking.checkout,
        guests: booking.guests,
        rooms: booking.rooms,
        totalPrice: booking.totalPrice,
        status: booking.status,
        createdAt: booking.createdAt,
        guestInfo: booking.guestInfo,
      })),
    };

    res.json(userData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;