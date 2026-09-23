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
import AppSnackbar from '@/src/commons/AppSnackBar';
import { useAppToast } from '@/src/hooks/useAppToast';
import {
  ContentWrap,
  InfoTile,
  PageRoot,
  RequestCard,
  RequestForm,
  StyledTextField,
  TwoColumnGrid,
  WelcomePanel,
} from './styles';

export default function AccessRequestScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast, showToast, closeToast } = useAppToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErrorMessage('Please fill in the required fields.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('account_requests').insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      company_name: companyName.trim() || null,
      notes: notes.trim() || null,
      status: 'PENDING',
    });

    if (error) {
      showToast(error.message || 'Failed to submit request.', 'error');
      setSubmitting(false);
      return;
    }

    showToast('Your request has been submitted. An admin will review it.');
    setFirstName('');
    setLastName('');
    setEmail('');
    setCompanyName('');
    setNotes('');
    setSubmitting(false);
  };

  return (
    <PageRoot>
      <ContentWrap>
        <WelcomePanel>
          <Stack spacing={3}>
            <Box>
              <Typography variant="overline" sx={{ letterSpacing: 2, color: 'text.secondary', fontWeight: 700 }}>
                Supplide
              </Typography>
              <Typography
                component="h1"
                variant="h3"
                sx={{ fontWeight: 800, mt: 1.5, lineHeight: 1.1, fontSize: { xs: '2rem', md: '3rem' } }}
              >
                Request access
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 2, maxWidth: 560 }}>
                Use this form if you need an account. An admin will review your request and create the user.
              </Typography>
            </Box>
            <Stack spacing={2}>
              <InfoTile>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>
                  What happens next
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Your request is saved for admin review. If approved, an admin will create your account and assign access.
                </Typography>
              </InfoTile>
              <InfoTile>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>
                  Existing users
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  If you already have credentials, go back to login and sign in directly.
                </Typography>
              </InfoTile>
            </Stack>
          </Stack>
        </WelcomePanel>
        <RequestCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
            Access request
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Send a request to the admin team.
          </Typography>
          <RequestForm onSubmit={handleSubmit}>
            <TwoColumnGrid>
              <StyledTextField label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} fullWidth required />
              <StyledTextField label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} fullWidth required />
            </TwoColumnGrid>
            <StyledTextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required />
            <StyledTextField label="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} fullWidth />
            <StyledTextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={3} />
            {errorMessage ? <Alert id="access-request-error" severity="error">{errorMessage}</Alert> : null}
            <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ mt: 1, minHeight: 52, borderRadius: 4, textTransform: 'none', fontWeight: 700 }} fullWidth>
              {submitting ? <CircularProgress size={22} color="inherit" /> : 'Submit Request'}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Back to{' '}
              <Link href="/login" style={{ fontWeight: 700 }}>
                login
              </Link>
            </Typography>
          </RequestForm>
        </RequestCard>
      </ContentWrap>
      <AppSnackbar {...toast} onClose={closeToast} />
    </PageRoot>
  );
}
