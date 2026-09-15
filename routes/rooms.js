const express = require("express");
const router = express.Router();
const Room = require("../models/roomModel");
const RoomType = require("../models/roomType");
const { getCachedJson, setCachedJson, deleteCachedKeys } = require("../services/cache");

// Generic error handler
const handleError = (res, error, status = 500) => {
  console.error(error);
  return res.status(status).json({ error: error.message });
};

// ----------------- RoomType APIs -----------------
router.get("/room-types", async (req, res) => {
  try {
    const cached = await getCachedJson("hotel:room-types");
    if (cached) return res.json(cached);
    const roomTypes = await RoomType.find();
    await setCachedJson("hotel:room-types", roomTypes, 300);
    res.json(roomTypes);
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/room-types", async (req, res) => {
  try {
    const roomType = new RoomType(req.body);
    await roomType.save();
    await deleteCachedKeys("hotel:room-types");
    res.status(201).json(roomType);
  } catch (error) {
    handleError(res, error, 400);
  }
});

router.put("/room-types/:id", async (req, res) => {
  try {
    const updated = await RoomType.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ error: "RoomType not found" });
    await deleteCachedKeys("hotel:room-types");
    res.json(updated);
  } catch (error) {
    handleError(res, error, 400);
  }
});

router.delete("/room-types/:id", async (req, res) => {
  try {
    const deleted = await RoomType.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "RoomType not found" });
    await deleteCachedKeys("hotel:room-types");
    res.json({ message: "RoomType deleted successfully" });
  } catch (error) {
    handleError(res, error);
  }
});

// ----------------- Room APIs -----------------
router.get("/rooms", async (req, res) => {
  try {
    const cached = await getCachedJson("hotel:rooms");
    if (cached) return res.json(cached);
    const rooms = await Room.find().populate("roomType"); // populate relation
    await setCachedJson("hotel:rooms", rooms, 60);
    res.json(rooms);
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/rooms", async (req, res) => {
  try {
    const room = new Room(req.body);
    await room.save();
    await deleteCachedKeys("hotel:rooms");
    res.status(201).json(room);
  } catch (error) {
    handleError(res, error, 400);
  }
});

router.put("/rooms/:id", async (req, res) => {
  try {
    const updated = await Room.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ error: "Room not found" });
    await deleteCachedKeys("hotel:rooms");
    res.json(updated);
  } catch (error) {
    handleError(res, error, 400);
  }
});

router.delete("/rooms/:id", async (req, res) => {
  try {
    const deleted = await Room.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Room not found" });
    await deleteCachedKeys("hotel:rooms");
    res.json({ message: "Room deleted successfully" });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
