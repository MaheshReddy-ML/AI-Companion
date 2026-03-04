import express from "express";
import { sendMessage, getChats } from "../controllers/chatController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, sendMessage);
router.get("/", protect, getChats);

export default router;
