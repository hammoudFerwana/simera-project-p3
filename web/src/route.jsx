import { createBrowserRouter } from 'react-router-dom';

import AuthLayout from './layouts/AuthLayout';
import Register from './pages/auth/Register';
import Login from './pages/auth/Login';
import VerifyOTP from './pages/auth/VerifyOTP';

const router = createBrowserRouter([
  // Authentication
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      {
        path: 'register',
        element: <Register />
      },
      {
        path: 'login',
        element: <Login />
      },
      {
        path: 'verify-otp',
        element: <VerifyOTP />
      }
    ]
  }
]);
export default router;
