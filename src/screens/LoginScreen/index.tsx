'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { supabase } from '@/src/supabase/client';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import {
  ContentWrap,
  DemoCredentialsWrap,
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
  const { profile, loading: sessionLoading } = useSessionUser();

  const [email, setEmail] = useState('user@example.com');
  const [password, setPassword] = useState('demo123');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!profile) return;
    if (profile.account_status !== 'ACTIVE') return;

    router.replace(profile.role === 'ADMIN' ? '/admin' : '/dashboard');
  }, [profile, sessionLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser();

    if (getUserError || !user) {
      setMessage('Login succeeded, but the session user could not be loaded.');
      setSubmitting(false);
      return;
    }

    const { data: dbProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, account_status')
      .eq('id', user.id)
      .single();

    if (profileError || !dbProfile) {
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

    router.replace(dbProfile.role === 'ADMIN' ? '/admin' : '/dashboard');
    router.refresh();
    setSubmitting(false);
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
                Peptide Production Allocation Platform
              </Typography>

              <Typography
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
                Sign in with your Supabase account to access batches, orders,
                wishlist demand, addresses, and admin operations.
              </Typography>
            </Box>

            <Stack spacing={2}>
              <InfoTile>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>
                  What this app supports
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Role-based access for admin and user accounts, protected company
                  ordering flows, wishlist tracking, and production batch management.
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

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Demo credentials
              </Typography>

              <DemoCredentialsWrap>
                <InfoTile>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    User
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    user@example.com
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    demo123
                  </Typography>
                </InfoTile>

                <InfoTile>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Admin
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    admin@example.com
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    demo123
                  </Typography>
                </InfoTile>
              </DemoCredentialsWrap>
            </Box>
          </Stack>
        </WelcomePanel>

        <LoginCard>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
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
            />

            <StyledTextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
            />

            {message ? <Alert severity="error">{message}</Alert> : null}

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
  Don&apos;t have an account?{' '}
  <Link href="/sign-up" style={{ fontWeight: 700 }}>
    Create one
  </Link>
</Typography>
          </LoginForm>
        </LoginCard>
      </ContentWrap>
    </PageRoot>
  );
}
