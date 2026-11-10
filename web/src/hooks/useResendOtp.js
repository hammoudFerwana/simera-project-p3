
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import Swal from "sweetalert2";
import axiosInstance from "../api/axiosInstance";

export default function useResendOtp() {
  const [serverErrors, setServerErrors] = useState([]);

  const resendMutation = useMutation({
    mutationFn: async (email) => {
      return await axiosInstance.post("/auth/resend-otp", {
        email,
      });
    },

    onSuccess: () => {
      setServerErrors([]);

      Swal.fire({
        icon: "success",
        title: "Code Sent!",
        text: "A new verification code has been sent to your email.",
        confirmButtonText: "OK",
      });
    },

    onError: (err) => {
      setServerErrors(
        err.response?.data?.errors || [
          err.response?.data?.message ||
            "Failed to resend verification code.",
        ]
      );
    },
  });

  return { serverErrors, resendMutation };
}
