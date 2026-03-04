import { Routes, Route, Navigate } from "react-router-dom";
import { useContext } from "react";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import OTPVerify from "./pages/OTPVerify";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";

import { AuthContext } from "./context/AuthContext";

export default function App() {
  const { user } = useContext(AuthContext);
  const dashboardKey = user?.id || user?._id || user?.email || user?.username || "dashboard";

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-otp" element={<OTPVerify />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected route */}
      <Route
        path="/dashboard"
        element={user ? <Dashboard key={dashboardKey} /> : <Navigate to="/login" />}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
