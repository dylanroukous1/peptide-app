'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import {
  EmptyWrap,
  FormGrid,
  MetaGrid,
  PageGrid,
  RequestCard,
  RequestList,
  SectionCard,
  StyledTextField,
} from './styles';

type PeptideRow = {
  id: string;
  name: string;
  default_unit_price: number;
  is_active: boolean;
};

type WishlistRow = {
  id: string;
  peptide_id: string;
  requested_quantity: number;
  target_allocation: number | null;
  status: string;
  desired_timeline: string | null;
  user_notes: string | null;
  internal_notes: string | null;
  confirmed_at: string | null;
  converted_batch_id: string | null;
  created_at: string;
  peptide?: {
    name: string;
  } | null;
};

const userNavItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Wishlist', href: '/wishlist' },
  { label: 'Peptides', href: '/peptides' },
  { label: 'My Orders', href: '/my-orders' },
  { label: 'Account', href: '/account' },
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function UserWishlistScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [requests, setRequests] = useState<WishlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [draft, setDraft] = useState({
    peptideId: '',
    requestedQuantity: '',
    desiredTimeline: '',
    userNotes: '',
  });

  useEffect(() => {
    if (sessionLoading) return;

    if (!profile) {
      router.replace('/login');
      return;
    }

    if (profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
      router.replace('/login');
      return;
    }

    const loadWishlistPage = async () => {
      setLoading(true);
      setErrorMessage('');

      const { data: peptideRows, error: peptidesError } = await supabase
        .from('peptides')
        .select('id, name, default_unit_price, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (peptidesError) {
        setErrorMessage(peptidesError.message);
        setLoading(false);
        return;
      }

      const { data: requestRows, error: requestsError } = await supabase
        .from('wishlist_requests')
        .select(`
          id,
          peptide_id,
          requested_quantity,
          target_allocation,
          status,
          desired_timeline,
          user_notes,
          internal_notes,
          confirmed_at,
          converted_batch_id,
          created_at,
          peptide:peptides(name)
        `)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (requestsError) {
        setErrorMessage(requestsError.message);
        setLoading(false);
        return;
      }

      const normalizedRequests: WishlistRow[] = (requestRows || []).map((row) => ({
        ...row,
        peptide: Array.isArray(row.peptide) ? row.peptide[0] : row.peptide,
      }));

      setPeptides(peptideRows || []);
      setRequests(normalizedRequests);
      setLoading(false);
    };

    loadWishlistPage();
  }, [profile, router, sessionLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile) return;

    setMessage('');
    setErrorMessage('');

    const quantity = Number(draft.requestedQuantity || 0);

    if (!draft.peptideId || !quantity || quantity <= 0) {
      setErrorMessage('Please select a peptide and enter a valid ideal quantity.');
      return;
    }

    setSubmitting(true);

    const { data, error } = await supabase
      .from('wishlist_requests')
      .insert({
        company_id: profile.company_id,
        user_id: profile.id,
        peptide_id: draft.peptideId,
        requested_quantity: quantity,
        target_allocation: null,
        status: 'OPEN',
        desired_timeline: draft.desiredTimeline || null,
        user_notes: draft.userNotes || null,
        internal_notes: null,
      })
      .select(`
        id,
        peptide_id,
        requested_quantity,
        target_allocation,
        status,
        desired_timeline,
        user_notes,
        internal_notes,
        confirmed_at,
        converted_batch_id,
        created_at,
        peptide:peptides(name)
      `)
      .single();

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    const normalized: WishlistRow = {
      ...data,
      peptide: Array.isArray(data.peptide) ? data.peptide[0] : data.peptide,
    };

    setRequests((prev) => [normalized, ...prev]);
    setDraft({
      peptideId: '',
      requestedQuantity: '',
      desiredTimeline: '',
      userNotes: '',
    });
    setMessage('Wishlist request submitted successfully.');
    setSubmitting(false);
  };

  if (sessionLoading || loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          backgroundColor: '#F8FAFC',
        }}
      >
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography color="text.secondary">Loading wishlist...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Wishlist Planning"
      subtitle="Submit ideal demand before production scheduling"
      navItems={userNavItems}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <PageGrid>
          <SectionCard>
            <Typography variant="h5" fontWeight={800}>
              Submit Wishlist Request
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Share your ideal peptide demand so production planning can reflect real partner interest.
            </Typography>

            <FormGrid onSubmit={handleSubmit}>
              <StyledTextField
                select
                label="Peptide"
                value={draft.peptideId}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, peptideId: e.target.value }))
                }
                fullWidth
                required
              >
                <MenuItem value="">Select peptide</MenuItem>
                {peptides.map((peptide) => (
                  <MenuItem key={peptide.id} value={peptide.id}>
                    {peptide.name}
                  </MenuItem>
                ))}
              </StyledTextField>

              <StyledTextField
                label="Ideal Quantity"
                type="number"
                value={draft.requestedQuantity}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, requestedQuantity: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="Desired Timeline"
                value={draft.desiredTimeline}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, desiredTimeline: e.target.value }))
                }
                fullWidth
                placeholder="Example: next production cycle"
              />

              <StyledTextField
                label="Notes"
                value={draft.userNotes}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, userNotes: e.target.value }))
                }
                multiline
                minRows={4}
                fullWidth
                placeholder="Any ideal delivery or allocation notes"
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                sx={{
                  minHeight: 52,
                  borderRadius: 4,
                  textTransform: 'none',
                  fontWeight: 700,
                }}
                fullWidth
              >
                {submitting ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  'Submit Wishlist'
                )}
              </Button>
            </FormGrid>
          </SectionCard>

          <SectionCard>
            <Typography variant="h5" fontWeight={800}>
              My Wishlist Requests
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Review your submitted demand history and current allocation status.
            </Typography>

            {requests.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" fontWeight={700}>
                  No wishlist requests yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Submit your first ideal demand request to help shape upcoming production.
                </Typography>
              </EmptyWrap>
            ) : (
              <RequestList>
                {requests.map((request) => (
                  <RequestCard key={request.id}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={800}>
                          {request.peptide?.name || 'Peptide'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {Number(request.requested_quantity).toLocaleString()} units
                        </Typography>
                      </Box>

                      <StatusChip status={request.status} />
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Desired Timeline
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {request.desired_timeline || '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Submitted
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {formatDate(request.created_at)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Target Allocation
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {request.target_allocation
                            ? `${Number(request.target_allocation).toLocaleString()} units`
                            : '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Confirmed At
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {formatDate(request.confirmed_at)}
                        </Typography>
                      </Box>
                    </MetaGrid>

                    {request.user_notes ? (
                      <Box sx={{ mt: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Notes
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {request.user_notes}
                        </Typography>
                      </Box>
                    ) : null}
                  </RequestCard>
                ))}
              </RequestList>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}