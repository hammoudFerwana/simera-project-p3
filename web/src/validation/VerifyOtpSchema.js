
import * as yup from "yup";

export const verifyOtpSchema = yup.object({
  code: yup
    .string()
    .required("Verification code is required")
    .matches(/^[0-9]{6}$/, "Code must be exactly 6 digits"),
});
