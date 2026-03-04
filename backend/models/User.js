import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // 🔐 Password is ONLY required if the authProvider is 'local'
    password: {
      type: String,
      required: function () {
        return this.authProvider === "local";
      },
    },

    // 🌍 Google ID (Used for OAuth)
    googleId: {
      type: String,
      default: null,
    },

    // 🏷️ Identifies how the user registered ('local' or 'google')
    authProvider: {
      type: String,
      required: true,
      default: "local",
      enum: ["local", "google"],
    },

    // 🔐 Password reset OTP fields
    resetOtp: {
      type: String,
      default: null,
    },

    resetOtpExpiry: {
      type: Date,
      default: null,
    },

    resetOtpVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;