
import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Paper,
} from "@mui/material";

import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useLocation } from "react-router-dom";

import { verifyOtpSchema } from "../../validation/VerifyOtpSchema.js";
import useVerifyOtp from "../../hooks/useVerifyOtp.js";
import useResendOtp from "../../hooks/useResendOtp.js";

export default function VerifyOTP() {
  const location = useLocation();
  const email = location.state?.email || "";

  const {
  resendMutation,
  serverErrors: resendErrors,
} = useResendOtp();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(verifyOtpSchema),
    mode: "onBlur",
  });

  const { verifyMutation, serverErrors } = useVerifyOtp();

  const onSubmit = async (values) => {
    await verifyMutation.mutateAsync({
      email,
      code: values.code,
    });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
        py: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 420,
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.07)",
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <MarkEmailReadOutlinedIcon
            sx={{
              fontSize: 55,
              color: "primary.main",
              mb: 1,
            }}
          />

          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: "primary.main",
              letterSpacing: "-0.8px",
              mb: 1.5,
            }}
          >
            Verify Your Email
          </Typography>

          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              fontWeight: 350,
              lineHeight: 1.5,
            }}
          >
            Enter the 6-digit verification code sent to your email.
          </Typography>

          {email && (
            <Typography
              variant="body2"
              sx={{ mt: 1, fontWeight: 600 }}
            >
              {email}
            </Typography>
          )}
        </Box>

        {/* Server Errors */}
        {serverErrors.length > 0 && (
          <Box
            mb={3}
            p={2}
            borderRadius={2}
            bgcolor="error.lighter"
          >
            {serverErrors.map((error, index) => (
              <Typography key={index} color="error" variant="body2">
                {typeof error === "string" ? error : error.message}
              </Typography>
            ))}
          </Box>
        )}

        {/* Verification Form */}
        <Box
          component="form"
          onSubmit={handleSubmit(onSubmit)}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          }}
        >
          <TextField
            fullWidth
            label="Verification Code"
            placeholder="Enter 6-digit code"
            inputProps={{
              maxLength: 6,
              inputMode: "numeric",
            }}
            {...register("code")}
            error={!!errors.code}
            helperText={errors.code?.message}
          />

          <Button
            fullWidth
            variant="contained"
            type="submit"
            size="large"
            disabled={verifyMutation.isPending || !email}
            sx={{
              mt: 1,
              height: 50,
              borderRadius: 2,
              fontSize: "1rem",
              fontWeight: 600,
              textTransform: "none",
              boxShadow: "none",
              "&:hover": {
                boxShadow: "none",
              },
            }}
          >
            {verifyMutation.isPending ? (
              <CircularProgress size={23} color="inherit" />
            ) : (
              "Verify Email"
            )}
          </Button>
        </Box>

        {/* Resend Code */}
        <Box
          sx={{
            mt: 2.5,
            pt: 3,
            borderTop: "1px solid",
            borderColor: "divider",
            textAlign: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Didn't receive the code?
          </Typography>

     <Button
  variant="text"
  sx={{ mt: 0.5, fontWeight: 600, textTransform: "none" }}
  disabled={resendMutation.isPending || !email}
  onClick={() => resendMutation.mutate(email)}
>
  {resendMutation.isPending ? "Sending..." : "Resend Code"}
</Button>
{resendErrors.length > 0 && (
  <Box mt={2}>
    {resendErrors.map((error, index) => (
      <Typography key={index} color="error" variant="body2">
        {typeof error === "string" ? error : error.message}
      </Typography>
    ))}
  </Box>
)}
        </Box>
      </Paper>
    </Box>
  );
}
