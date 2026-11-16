import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { logoutApi } from '../api/axiosAuthInstance';

const useLogout = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logoutApi,

    onSuccess: async () => {
      await queryClient.cancelQueries();

      queryClient.clear();

      navigate('/auth/login', { replace: true });
    }
  });
};

export default useLogout;
