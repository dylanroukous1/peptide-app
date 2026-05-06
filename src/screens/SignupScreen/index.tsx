'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { supabase } from '@/src/supabase/client';
import {
  ContentWrap,
  InfoTile,
  PageRoot,
  SignupCard,
  SignupForm,
  StyledTextField,
  TwoColumnGrid,
  WelcomePanel,
} from './styles';

export default function SignupScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMessage('');
    setSuccessMessage('');

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password should be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    setSuccessMessage(
      'Account created. Please confirm your email and wait as an admin must activate your account and assign a company before you can use the app.'
    );

    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setSubmitting(false);
  };

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
                Create your account
              </Typography>

              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mt: 2, maxWidth: 560 }}
              >
                Sign up as a partner user. Your profile will be created automatically in
                Supabase and can then be activated by an admin.
              </Typography>
            </Box>

            <Stack spacing={2}>
              <InfoTile>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  What happens after signup
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Your auth account is created first, then your profile row is inserted by
                  the trigger you already added.
                </Typography>
              </InfoTile>

              <InfoTile>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  Approval required
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  New accounts start as <strong>PENDING</strong>. An admin must set the
                  account to <strong>ACTIVE</strong> and assign a company before ordering
                  and wishlist screens will work.
                </Typography>
              </InfoTile>
            </Stack>
          </Stack>
        </WelcomePanel>

        <SignupCard>
          <Typography variant="h5" fontWeight={800}>
            Sign up
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Create a new user account for the platform.
          </Typography>

          <SignupForm onSubmit={handleSignup}>
            <TwoColumnGrid>
              <StyledTextField
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                fullWidth
                required
              />

              <StyledTextField
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                fullWidth
                required
              />
            </TwoColumnGrid>

            <StyledTextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              required
            />

            <StyledTextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
            />

            <StyledTextField
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              fullWidth
              required
            />

            {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
            {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

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
                'Create Account'
              )}
            </Button>

            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Already have an account?{' '}
              <Link href="/login" style={{ fontWeight: 700 }}>
                Go to login
              </Link>
            </Typography>
          </SignupForm>
        </SignupCard>
      </ContentWrap>
    </PageRoot>
  );
}