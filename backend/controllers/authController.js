import User from "../models/User.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";

// Initialize Google Client
const client = new OAuth2Client();

// Helper: Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Helper: Send Email (Internal function)
const sendEmail = async (email, subject, html) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"AI Companion" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html,
  });
};

const getGoogleAudienceList = () => {
  const rawAudienceList = process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || "";

  return rawAudienceList
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

// ✅ 1. Register User (Normal Email/Pass)
export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const normalizedEmail = email?.toLowerCase()?.trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      authProvider: "local", // Mark as Local Login
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 2. Login User (Normal Email/Pass)
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = email?.toLowerCase()?.trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Ensure user exists AND has a password (Google users might not have one)
    if (user && user.password && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 3. Google Login (Handles Auto-Registration)
export const googleLogin = async (req, res) => {
  const { token } = req.body;

  try {
    if (!token) {
      return res.status(400).json({ message: "Google token is missing" });
    }

    const audience = getGoogleAudienceList();
    if (!audience.length) {
      return res.status(500).json({ message: "Google auth is not configured on server" });
    }

    // Verify Token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience,
    });

    const payload = ticket.getPayload();
    const { name, email, sub: googleId, email_verified: emailVerified } = payload;

    if (!email || !googleId) {
      return res.status(400).json({ message: "Google token payload is incomplete" });
    }

    if (!emailVerified) {
      return res.status(400).json({ message: "Google email is not verified" });
    }

    const normalizedEmail = email.toLowerCase();
    const derivedName = name || normalizedEmail.split("@")[0];

    // Check if user exists
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // User exists: Link Google ID if missing
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    } else {
      // User does NOT exist: AUTO-REGISTER them
      user = await User.create({
        name: derivedName,
        email: normalizedEmail,
        googleId,
        authProvider: "google", // Mark as Google Login
      });
    }

    // Whether new or existing, return Token to log them in
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(400).json({
      message: "Google authentication failed",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ 4. Send OTP
export const sendOtp = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP to DB (Expires in 10 mins)
    user.resetOtp = otp;
    user.resetOtpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    // Send Email
    await sendEmail(
      email,
      "Your Verification Code",
      `<h3>Your OTP is: <b style="color:blue;">${otp}</b></h3><p>Valid for 10 minutes.</p>`,
    );

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 5. Verify OTP
export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.resetOtp !== otp || user.resetOtpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.resetOtpVerified = true;
    await user.save();

    res.status(200).json({ message: "OTP Verified" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 6. Reset Password
export const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.resetOtpVerified) {
      return res.status(400).json({ message: "OTP not verified" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Reset back to local provider if they are setting a password
    if (user.authProvider === "google") {
      user.authProvider = "local";
    }

    // Clear OTP fields
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    user.resetOtpVerified = false;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
