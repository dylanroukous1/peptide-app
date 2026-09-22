'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { supabase } from '@/src/supabase/client';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import {
  ContentWrap,
  InfoTile,
  LoginCard,
  LoginForm,
  PageRoot,
  StyledTextField,
  WelcomePanel,
} from './styles';
import Link from 'next/link';

export default function LoginScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading, syncSession } = useSessionUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!profile) return;
    if (profile.account_status !== 'ACTIVE') return;

    router.replace(profile.role === 'ADMIN' ? '/admin/orders' : '/dashboard');
  }, [profile, sessionLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setMessage('Enter your email and password.');
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    const dbProfile = await syncSession();
    if (!dbProfile) {
      setMessage('Your account profile could not be found.');
      setSubmitting(false);
      return;
    }

    if (dbProfile.account_status !== 'ACTIVE') {
      setMessage(`This account is ${dbProfile.account_status.toLowerCase()}.`);
      await supabase.auth.signOut();
      setSubmitting(false);
      return;
    }

    router.replace(dbProfile.role === 'ADMIN' ? '/admin/orders' : '/dashboard');
  };

  if (sessionLoading) {
    return (
      <PageRoot>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress />
          <Typography variant="body1" color="text.secondary">
            Checking session...
          </Typography>
        </Stack>
      </PageRoot>
    );
  }

  return (
    <PageRoot>
      <ContentWrap>
        <WelcomePanel>
          <Stack spacing={3}>
            <Box>
              <Typography
                variant="overline"
                sx={{ letterSpacing: 2, color: 'text.secondary', fontWeight: 700 }}
              >
                Supplide
              </Typography>

              <Typography
                component="h1"
                variant="h3"
                sx={{
                  fontWeight: 800,
                  mt: 1.5,
                  lineHeight: 1.1,
                  fontSize: { xs: '2rem', md: '3rem' },
                }}
              >
                Secure partner and admin access
              </Typography>

              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mt: 2, maxWidth: 560 }}
              >
                Sign in to Supplide to access product pricing,
                orders, shipping addresses, and administration tools.
              </Typography>
            </Box>

            <Stack spacing={2}>
              <InfoTile>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>
                  What this app supports
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Role-based access for administrators and partners, protected company
                  ordering flows, order tracking, and catalog management.
                </Typography>
              </InfoTile>

              <InfoTile>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>
                  Account status rules
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Only profiles marked as <strong>ACTIVE</strong> can enter the app.
                  Newly created accounts may remain <strong>PENDING</strong> until
                  approved.
                </Typography>
              </InfoTile>
            </Stack>
          </Stack>
        </WelcomePanel>

        <LoginCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
            Sign in
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Enter your account credentials to continue.
          </Typography>

          <LoginForm onSubmit={handleLogin}>
            <StyledTextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              autoComplete="email"
              required
              error={Boolean(message)}
              aria-describedby={message ? 'login-error' : undefined}
            />

            <StyledTextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
              required
              error={Boolean(message)}
              aria-describedby={message ? 'login-error' : undefined}
            />

            {message ? <Alert id="login-error" severity="error">{message}</Alert> : null}

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
              sx={{
                mt: 1,
                minHeight: 52,
                borderRadius: 4,
                textTransform: 'none',
                fontWeight: 700,
              }}
              fullWidth
            >
              {submitting ? (
                <CircularProgress size={22} color="inherit" />
              ) : (
                'Login'
              )}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Need access?{' '}
              <Link href="/access-request" style={{ fontWeight: 700 }}>
                Request an account
              </Link>
            </Typography>
          </LoginForm>
        </LoginCard>
      </ContentWrap>
      <Snackbar
        open={submitting}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" role="status" aria-live="polite" icon={<CircularProgress size={18} color="inherit" />}>
          Signing you in…
        </Alert>
      </Snackbar>
    </PageRoot>
  );
}
