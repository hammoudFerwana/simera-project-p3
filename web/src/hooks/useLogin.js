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
        navigate("/admin/candidates", { replace: true });
      } else if (user.role === "candidate") {
        navigate("/candidate", { replace: true });
      }
    },

    onError: (error) => {
      const data = error.response?.data;

      if (
        error.response?.status === 403 &&
        data?.reason === "verification_required"
      ) {
        navigate("/auth/verify-otp", {
          state: { email: data.email },
        });
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