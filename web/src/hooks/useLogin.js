
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { loginApi } from "../api/axiosAuthInstance";

const useLogin = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: loginApi,

    onSuccess: (response) => {
      const user = response.user;

      queryClient.setQueryData(["currentUser"], user);

      if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else if (user.role === "candidate") {
        navigate("/candidate", { replace: true });
      }
    },
  });

  const serverError = loginMutation.error
    ? loginMutation.error.response?.status === 401
      ? "Email or password is incorrect"
      : loginMutation.error.response?.data?.message ||
        "Something went wrong. Please try again."
    : null;

  return {
    loginMutation,
    serverError,
  };
};

export default useLogin;
