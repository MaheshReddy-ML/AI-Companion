import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";


dotenv.config();

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// 🔹 HEALTH CHECK ROUTE (MUST BE BEFORE OTHER ROUTES)
app.get("/", (req, res) => {
  res.send("✅ Backend is running successfully");
});

// connect database
await connectDB();

// api routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("✅ Backend Connected Successfully");
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
