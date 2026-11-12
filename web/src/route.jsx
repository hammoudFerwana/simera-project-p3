
import { createBrowserRouter } from "react-router-dom";

import AuthLayout from "./layouts/AuthLayout";
import MainLayout from "./layouts/MainLayout";

import Register from "./pages/auth/Register";
import Login from "./pages/auth/Login";
import VerifyOTP from "./pages/auth/VerifyOTP";

import ProtectedRoute from "../src/ProtectedRoute";

import CandidateDashboard from "./pages/candidate/CandidateDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";

const router = createBrowserRouter([
  // Authentication
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "register", element: <Register /> },
      { path: "login", element: <Login /> },
      { path: "verify-otp", element: <VerifyOTP /> },
    ],
  },

  // Candidate
  {
    element: <ProtectedRoute allowedRoles={["candidate"]} />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: "/candidate",
            element: <CandidateDashboard />,
          },
        ],
      },
    ],
  },

  // Admin
  {
    element: <ProtectedRoute allowedRoles={["admin"]} />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: "/admin",
            element: <AdminDashboard />,
          },
        ],
      },
    ],
  },
]);

export default router;
