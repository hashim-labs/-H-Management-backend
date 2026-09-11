const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Booking = require("../models/booking");

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

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ email, password: hashedPassword, phone, name });
    await user.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Convert user document to plain object and exclude password
    const userData = user.toObject();
    delete userData.password;

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