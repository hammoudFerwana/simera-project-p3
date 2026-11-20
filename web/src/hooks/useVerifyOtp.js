
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import axiosInstance from "../api/axiosInstance";

export default function useVerifyOtp() {
  const [serverErrors, setServerErrors] = useState([]);
  const navigate = useNavigate();

  const verifyMutation = useMutation({
    mutationFn: async (values) => {
      return await axiosInstance.post("/auth/verify-otp", values);
    },

    onMutate: () => {
      setServerErrors([]);
    },

    onSuccess: () => {
      Swal.fire({
        icon: "success",
        title: "Email Verified!",
        text: "Your email has been verified successfully.",
        confirmButtonText: "Continue",
      }).then(() => {
        navigate("/auth/login");
      });
    },

    onError: (err) => {
      const errors = err.response?.data?.errors;

      if (errors && typeof errors === "object") {
        setServerErrors(
          Array.isArray(errors) ? errors : Object.values(errors)
        );
        return;
      }

      setServerErrors([
        "Something went wrong. Please try again.",
      ]);
    },
  });

  return { serverErrors, verifyMutation };
}
