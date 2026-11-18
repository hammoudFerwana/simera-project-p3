import { createBrowserRouter } from 'react-router-dom';

import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';

import Register from './pages/auth/Register';
import Login from './pages/auth/Login';
import VerifyOTP from './pages/auth/VerifyOTP';

import ProtectedRoute from '../src/ProtectedRoute';

import CandidateDashboard from './pages/candidate/CandidateDashboard';
import MyFiles from './pages/candidate/MyFiles';

import Candidates from './pages/admin/Candidates';
import CandidatesProfile from './pages/admin/CandidatesProfile';
import ReviewQueue from './pages/admin/ReviewQueue';
import UnknownSkillsQueue from './pages/admin/UnknownSkillsQueue';
import Landing from './pages/Landing';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Landing />
  },
  // Authentication
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'register', element: <Register /> },
      { path: 'login', element: <Login /> },
      { path: 'verify-otp', element: <VerifyOTP /> }
    ]
  },

  // Candidate
  {
    element: <ProtectedRoute allowedRoles={['candidate']} />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: '/candidate',
            element: <CandidateDashboard />
          },
          {
            path: '/candidate/my-files',
            element: <MyFiles />
          }
        ]
      }
    ]
  },

  // Admin
  {
    element: <ProtectedRoute allowedRoles={['admin']} />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: '/admin/candidates',
            element: <Candidates />
          },
          {
            path: '/admin/candidates/:id',
            element: <CandidatesProfile />
          },
          {
            path: '/admin/review-queue',
            element: <ReviewQueue />
          },
          {
            path: '/admin/unknown-skills',
            element: <UnknownSkillsQueue />
          }
        ]
      }
    ]
  }
]);

export default router;
