const express = require("express");
const Booking = require("../models/booking");
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendBookingConfirmationEmail, sendGuestCredentialsEmail } = require("../services/email");

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Extract token from "Bearer <token>"

  if (!token) {
    req.user = null; // No token, treat as guest
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded token data to request
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// Create booking
router.post("/book", authenticateToken, async (req, res) => {
  try {
    const {
      hotelId,
      checkin,
      checkout,
      guests,
      rooms,
      totalPrice,
      guestInfo,
    } = req.body;

    // Validate required fields
    if (!hotelId || !checkin || !checkout || !guests || !rooms || !totalPrice) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let userId = req.user ? req.user.id : null;
    let generatedGuestPassword;

    // For guest users (no token or invalid token), create a new user in the User collection
    if (!req.user) {
      if (!guestInfo || !guestInfo.firstName || !guestInfo.lastName || !guestInfo.email || !guestInfo.phone) {
        return res.status(400).json({ error: "Guest information is required for non-logged-in users" });
      }

      // Check if user already exists
      const normalizedEmail = guestInfo.email.trim().toLowerCase();
      let user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        // Create new guest user
        generatedGuestPassword = crypto.randomBytes(9).toString("base64url");
        const hashedPassword = await bcrypt.hash(generatedGuestPassword, 12);
        user = new User({
          email: normalizedEmail,
          password: hashedPassword,
          phone: guestInfo.phone,
          name: `${guestInfo.firstName} ${guestInfo.lastName}`,
          emailVerified: true,
          status: "reserved",
          checkIn: new Date(checkin),
          checkOut: new Date(checkout),
          room: rooms[0]?.roomnumber,
        });
        await user.save();
      }
      userId = user._id;
    }

    let authenticatedGuestInfo;
    if (req.user) {
      const account = await User.findById(req.user.id).select("name email phone");
      if (!account) return res.status(401).json({ error: "Authenticated account not found" });
      const nameParts = String(account.name || "").trim().split(/\s+/);
      authenticatedGuestInfo = {
        title: guestInfo?.title || "Mr.",
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" "),
        email: account.email,
        phone: account.phone,
        country: guestInfo?.country,
        address: guestInfo?.address,
        city: guestInfo?.city,
        zipCode: guestInfo?.zipCode,
        specialRequests: guestInfo?.specialRequests,
        purposeOfStay: guestInfo?.purposeOfStay || "leisure",
        identificationType: guestInfo?.identificationType,
        identificationNumber: guestInfo?.identificationNumber,
      };
    }

    const bookingData = {
      userId,
      guestInfo: req.user ? authenticatedGuestInfo : guestInfo,
      hotelId,
      checkin,
      checkout,
      guests,
      rooms,
      totalPrice,
    };

    const booking = new Booking(bookingData);
    await booking.save();

    // Populate userId if present
    const populatedBooking = await Booking.findById(booking._id).populate("userId", "email phone name");
    if (!req.user && guestInfo?.email) {
      try {
        await sendBookingConfirmationEmail({
          email: guestInfo.email.trim().toLowerCase(),
          name: `${guestInfo.firstName} ${guestInfo.lastName}`,
          booking: populatedBooking,
        });
        if (generatedGuestPassword) {
          await sendGuestCredentialsEmail({
            email: guestInfo.email.trim().toLowerCase(),
            name: `${guestInfo.firstName} ${guestInfo.lastName}`,
            password: generatedGuestPassword,
            booking: populatedBooking,
          });
        }
      } catch (emailError) {
        console.error("Booking confirmation email error:", emailError);
      }
    }
    res.status(201).json(populatedBooking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all bookings for the logged-in user or guest (by email)
router.get("/", authenticateToken, async (req, res) => {
  try {
    let bookings;
    if (req.user) {
      // Fetch bookings for logged-in user
      bookings = await Booking.find({ userId: req.user.id }).populate("userId", "email phone name");
    } else {
      // For guest users, require email query parameter
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ error: "Email is required for guest bookings" });
      }
      bookings = await Booking.find({ "guestInfo.email": email }).populate("userId", "email phone name");
    }
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const bookings = await Booking.find().populate("userId", "email phone name");
    // Transform bookings to include a consistent 'name' field
    const formattedBookings = bookings.map((booking) => {
      const name = booking.userId?.name || 
                   (booking.guestInfo ? `${booking.guestInfo.firstName || ''} ${booking.guestInfo.lastName || ''}`.trim() : 'Unknown Guest');
                   return {
        ...booking._doc, // Spread the booking document
        name, // Add computed name field
      };
    });
    res.json(formattedBookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add another room to an upcoming booking without re-entering guest details.
router.put("/:id/rooms", authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role === "staff") return res.status(403).json({ message: "Guest authentication required" });
    const { room, totalPrice } = req.body || {};
    if (!room?.roomId || !room?.roomType || !Number.isFinite(Number(room.price))) {
      return res.status(400).json({ message: "A valid room is required" });
    }
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.id });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status === "cancelled" || new Date(booking.checkout) <= new Date()) {
      return res.status(400).json({ message: "Only upcoming bookings can be updated" });
    }

    const existingRoom = booking.rooms.find((item) => item.roomId === String(room.roomId));
    if (existingRoom) existingRoom.quantity += Number(room.quantity || 1);
    else booking.rooms.push({ ...room, roomId: String(room.roomId), quantity: Number(room.quantity || 1), price: Number(room.price) });
    booking.totalPrice = Number(totalPrice) || booking.rooms.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    await booking.save();
    return res.json(await Booking.findById(booking._id).populate("userId", "email phone name"));
  } catch (err) {
    return res.status(500).json({ message: "Unable to update booking" });
  }
});

// Get booking by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("userId", "email phone name");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Restrict access: Only allow the user who created the booking or guests with matching email
    if (req.user && booking.userId && booking.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized access to this booking" });
    }
    if (!req.user && booking.guestInfo && booking.guestInfo.email !== req.query.email) {
      return res.status(403).json({ message: "Unauthorized access to this booking" });
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;