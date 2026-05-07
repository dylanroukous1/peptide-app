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
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErrorMessage('Please fill in the required fields.');
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
      setErrorMessage(error.message || 'Failed to submit request.');
      setSubmitting(false);
      return;
    }

    setSuccessMessage('Your request has been submitted. An admin will review it.');
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
                Peptide Production Allocation Platform
              </Typography>
              <Typography
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
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
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
            {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
            {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
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
    </PageRoot>
  );
}
