import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Paper,
  Alert
} from '@mui/material';

import { Link as RouterLink } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';

import { loginSchema } from '../../validation/LoginSchema';
import useLogin from '../../hooks/useLogin';

export default function Login() {
  const { loginMutation, serverError } = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: yupResolver(loginSchema),
    mode: 'onBlur'
  });

  const onSubmit = async (values) => {
    await loginMutation.mutateAsync(values);
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
            Welcome Back
          </Typography>

          <Typography
            variant="body1"
            sx={{
              color: 'text.secondary',
              fontWeight: 350
            }}
          >
            Sign in to your Simera account.
          </Typography>
        </Box>

        {/* Login Form */}
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

          <Button
            fullWidth
            variant="contained"
            type="submit"
            size="large"
            disabled={loginMutation.isPending}
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
            {loginMutation.isPending ? (
              <CircularProgress size={23} color="inherit" />
            ) : (
              'Sign In'
            )}
          </Button>
          {serverError && (
            <Alert
              severity="error"
              variant="outlined"
              sx={{
                borderRadius: 2,
                fontSize: '0.875rem'
              }}
            >
              {serverError}
            </Alert>
          )}
        </Box>

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
            Don't have an account?{' '}
            <Box
              component={RouterLink}
              to="/auth/register"
              sx={{
                color: 'primary.main',
                fontWeight: 600,
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline'
                }
              }}
            >
              Create Account
            </Box>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
