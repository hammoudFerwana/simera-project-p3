import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';

export default function useRegister() {
  const [serverErrors, setServerErrors] = useState([]);
  const navigate = useNavigate();

  const registerMutation = useMutation({
    mutationFn: async (values) => {
      const registerData = Object.fromEntries(
        Object.entries(values).filter(([key]) => key !== 'confirmPassword')
      );
      return await axiosInstance.post('/auth/register', registerData);
    },

    onSuccess: () => {
      navigate('/auth/verify-otp');
    },

    onError: (err) => {
      setServerErrors(err.response?.data?.errors || []);
    }
  });

  return { serverErrors, registerMutation };
}