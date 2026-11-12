import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Paper
} from '@mui/material';

import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';

import { Link as RouterLink } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';

import { registerSchema } from '../../validation/RegisterSchema.js';
import useRegister from '../../hooks/useRegister.js';

export default function Register() {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: yupResolver(registerSchema),
    mode: 'onBlur'
  });

  const { registerMutation, serverErrors } = useRegister();

  const onSubmit = async (values) => {
    await registerMutation.mutateAsync(values);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 3
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 420,
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.07)'
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: 'primary.main',
              letterSpacing: '-0.8px',
              mb: 1.5
            }}
          >
            Create Account
          </Typography>

          <Typography
            variant="body1"
            sx={{
              color: 'text.secondary',
              fontWeight: 350,
              lineHeight: 1.1
            }}
          >
            Get started by creating your Simera account.
          </Typography>
        </Box>

        {/* Server Errors */}
        {serverErrors.length > 0 && (
          <Box mb={3} p={2} borderRadius={2} bgcolor="error.lighter">
            {serverErrors.map((error, index) => (
              <Typography key={index} color="error" variant="body2">
                {typeof error === 'string' ? error : error.message}
              </Typography>
            ))}
          </Box>
        )}

        {/* Registration Form */}
        <Box
          component="form"
          onSubmit={handleSubmit(onSubmit)}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5
          }}
        >
          <TextField
            fullWidth
            label="Email Address"
            type="email"
            {...register('email')}
            error={!!errors.email}
            helperText={errors.email?.message}
          />

          <TextField
            fullWidth
            label="Password"
            type="password"
            {...register('password')}
            error={!!errors.password}
            helperText={errors.password?.message}
          />

          <TextField
            fullWidth
            label="Confirm Password"
            type="password"
            {...register('confirmPassword')}
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword?.message}
          />

          <Button
            fullWidth
            variant="contained"
            type="submit"
            size="large"
            disabled={registerMutation.isPending}
            sx={{
              mt: 1,
              height: 50,
              borderRadius: 2,
              fontSize: '1rem',
              fontWeight: 600,
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                boxShadow: 'none'
              }
            }}
          >
            {registerMutation.isPending ? (
              <CircularProgress size={23} color="inherit" />
            ) : (
              'Create Account'
            )}
          </Button>
        </Box>

        {/* Login Link */}
        <Box
          sx={{
            mt: 2.5,
            pt: 3,
            borderTop: '1px solid',
            borderColor: 'divider',
            textAlign: 'center'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Already have an account?{' '}
            <Box
              component={RouterLink}
              to="/auth/login"
              sx={{
                color: 'primary.main',
                fontWeight: 600,
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline'
                }
              }}
            >
              Sign in
            </Box>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
