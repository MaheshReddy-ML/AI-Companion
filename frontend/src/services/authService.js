import api from "./api";

// Register
export const registerUser = async (data) => {
  const res = await api.post("/auth/register", data);
  return res.data;
};

// Login
export const loginUser = async (data) => {
  const res = await api.post("/auth/login", data);
  return res.data;
};

// ✅ Google Login (NEW)
export const googleLogin = async (token) => {
  const res = await api.post("/auth/google", { token });
  return res.data;
};

// Send OTP
export const sendOtp = async (data) => {
  const res = await api.post("/auth/send-otp", data);
  return res.data;
};

// Verify OTP
export const verifyOtp = async (data) => {
  const res = await api.post("/auth/verify-otp", data);
  return res.data;
};

// Reset password
export const resetPassword = async (data) => {
  const res = await api.post("/auth/reset-password", data);
  return res.data;
};