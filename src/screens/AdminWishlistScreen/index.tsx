'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import {
  ActionGrid,
  EmptyWrap,
  ListCard,
  ListWrap,
  MetaGrid,
  PageGrid,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
} from './styles';

type WishlistRow = {
  id: string;
  peptide_id: string;
  company_id: string;
  user_id: string;
  requested_quantity: number;
  target_allocation: number | null;
  status: string;
  desired_timeline: string | null;
  user_notes: string | null;
  confirmed_at: string | null;
  converted_batch_id: string | null;
  created_at: string;
  peptide?: { name: string } | null;
  company?: { name: string } | null;
  user?: {
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
};

type WishlistSummaryRow = {
  peptideId: string;
  peptideName: string;
  totalRequested: number;
  requestCount: number;
  targetAllocation: number;
  confirmed: boolean;
  status: string;
};

type PeptideRow = {
  id: string;
  name: string;
  default_unit_price: number;
};

const adminNavItems = [
  { label: 'Overview', href: '/admin' },
  { label: 'Wishlist', href: '/admin/wishlist' },
  { label: 'Orders', href: '/admin/orders' },
  { label: 'Peptides', href: '/admin/peptides' },
  { label: 'Batches', href: '/admin/batches' },
  { label: 'Companies', href: '/admin/companies' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Audit', href: '/admin/audit' },
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function AdminWishlistScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [wishlistRows, setWishlistRows] = useState<WishlistRow[]>([]);
  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [message, setMessage] = useState('');
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const loadWishlistData = async () => {
    setLoading(true);
    setErrorMessage('');

    const [
      { data: wishlistData, error: wishlistError },
      { data: peptideData, error: peptideError },
    ] = await Promise.all([
      supabase
        .from('wishlist_requests')
        .select(`
          id,
          peptide_id,
          company_id,
          user_id,
          requested_quantity,
          target_allocation,
          status,
          desired_timeline,
          user_notes,
          confirmed_at,
          converted_batch_id,
          created_at,
          peptide:peptides(name),
          company:companies(name),
          user:profiles(first_name, last_name, email)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('peptides')
        .select('id, name, default_unit_price')
        .order('name', { ascending: true }),
    ]);

    if (wishlistError || peptideError) {
      setErrorMessage(
        wishlistError?.message || peptideError?.message || 'Failed to load wishlist data.'
      );
      setLoading(false);
      return;
    }

    const normalizedWishlist: WishlistRow[] = (wishlistData || []).map((row: any) => ({
      ...row,
      peptide: Array.isArray(row.peptide) ? row.peptide[0] : row.peptide,
      company: Array.isArray(row.company) ? row.company[0] : row.company,
      user: Array.isArray(row.user) ? row.user[0] : row.user,
    }));

    setWishlistRows(normalizedWishlist);
    setPeptides(peptideData || []);

    const initialDrafts: Record<string, string> = {};
    normalizedWishlist.forEach((row) => {
      if (!initialDrafts[row.peptide_id] && row.target_allocation) {
        initialDrafts[row.peptide_id] = String(row.target_allocation);
      }
    });
    setTargetDrafts((prev) => ({ ...initialDrafts, ...prev }));

    setLoading(false);
  };

  useEffect(() => {
    if (sessionLoading) return;

    if (!profile) {
      router.replace('/login');
      return;
    }

    if (profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
      router.replace('/login');
      return;
    }

    loadWishlistData();
  }, [profile, router, sessionLoading]);

  const summaryRows = useMemo<WishlistSummaryRow[]>(() => {
    const summary = new Map<string, WishlistSummaryRow>();

    wishlistRows
      .filter((row) => ['OPEN', 'UNDER_REVIEW', 'CONFIRMED'].includes(row.status))
      .forEach((row) => {
        const current = summary.get(row.peptide_id) || {
          peptideId: row.peptide_id,
          peptideName: row.peptide?.name || 'Peptide',
          totalRequested: 0,
          requestCount: 0,
          targetAllocation: 0,
          confirmed: false,
          status: 'OPEN',
        };

        current.totalRequested += Number(row.requested_quantity || 0);
        current.requestCount += 1;
        current.targetAllocation = Number(row.target_allocation || current.targetAllocation || 0);
        current.confirmed =
          current.targetAllocation > 0 && current.totalRequested >= current.targetAllocation;
        current.status = row.status === 'CONFIRMED' ? 'CONFIRMED' : current.status;

        summary.set(row.peptide_id, current);
      });

    return Array.from(summary.values()).sort((a, b) => b.totalRequested - a.totalRequested);
  }, [wishlistRows]);

  const stats = useMemo(() => {
    const openRequests = wishlistRows.filter((row) =>
      ['OPEN', 'UNDER_REVIEW'].includes(row.status)
    ).length;

    const confirmedRequests = wishlistRows.filter((row) => row.status === 'CONFIRMED').length;

    const totalDemand = wishlistRows
      .filter((row) => ['OPEN', 'UNDER_REVIEW', 'CONFIRMED'].includes(row.status))
      .reduce((sum, row) => sum + Number(row.requested_quantity || 0), 0);

    const trackedPeptides = summaryRows.length;

    return {
      openRequests,
      confirmedRequests,
      totalDemand,
      trackedPeptides,
    };
  }, [wishlistRows, summaryRows]);

  const updateTargetAllocation = async (peptideId: string) => {
    const target = Number(targetDrafts[peptideId] || 0);

    if (!target || target <= 0) {
      setErrorMessage('Enter a valid target allocation.');
      return;
    }

    setSubmittingKey(`target-${peptideId}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('wishlist_requests')
      .update({
        target_allocation: target,
        status: 'UNDER_REVIEW',
      })
      .eq('peptide_id', peptideId)
      .in('status', ['OPEN', 'UNDER_REVIEW', 'CONFIRMED']);

    if (error) {
      setErrorMessage(error.message);
      setSubmittingKey(null);
      return;
    }

    setMessage('Wishlist target allocation updated.');
    setSubmittingKey(null);
    await loadWishlistData();
  };

  const confirmAllocation = async (item: WishlistSummaryRow) => {
    const target = Number(targetDrafts[item.peptideId] || item.targetAllocation || 0);

    if (!target || target <= 0) {
      setErrorMessage('Set a target allocation before confirming.');
      return;
    }

    if (item.totalRequested < target) {
      setErrorMessage(
        `Current demand is ${item.totalRequested.toLocaleString()} units, below the ${target.toLocaleString()} unit target.`
      );
      return;
    }

    setSubmittingKey(`confirm-${item.peptideId}`);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('wishlist_requests')
      .update({
        status: 'CONFIRMED',
        target_allocation: target,
        confirmed_at: new Date().toISOString(),
      })
      .eq('peptide_id', item.peptideId)
      .in('status', ['OPEN', 'UNDER_REVIEW']);

    if (error) {
      setErrorMessage(error.message);
      setSubmittingKey(null);
      return;
    }

    setMessage('Full allocation confirmed.');
    setSubmittingKey(null);
    await loadWishlistData();
  };

  const createBatchFromWishlist = async (item: WishlistSummaryRow) => {
    const matchingRows = wishlistRows.filter(
      (row) => row.peptide_id === item.peptideId && row.status === 'CONFIRMED'
    );

    const peptide = peptides.find((p) => p.id === item.peptideId);

    if (!peptide || matchingRows.length === 0) {
      setErrorMessage('Confirm wishlist allocation before creating a production batch.');
      return;
    }

    const totalQuantity = matchingRows.reduce(
      (sum, row) => sum + Number(row.requested_quantity || 0),
      0
    );

    setSubmittingKey(`batch-${item.peptideId}`);
    setMessage('');
    setErrorMessage('');

    const batchCode = `${peptide.name.replace(/[^A-Z0-9]/gi, '').toUpperCase()}-WISH-${Date.now()
      .toString()
      .slice(-5)}`;

    const { data: createdBatch, error: batchError } = await supabase
      .from('batches')
      .insert({
        peptide_id: item.peptideId,
        batch_code: batchCode,
        batch_date: new Date().toISOString().slice(0, 10),
        total_quantity: totalQuantity,
        reserved_quantity: 0,
        approved_quantity: 0,
        moq: 1,
        unit_price: peptide.default_unit_price,
        eta_date: null,
        public_notes: 'Created from confirmed wishlist demand.',
        internal_notes: 'Auto-created from wishlist allocation.',
        status: 'OPEN',
      })
      .select('id')
      .single();

    if (batchError || !createdBatch) {
      setErrorMessage(batchError?.message || 'Failed to create batch.');
      setSubmittingKey(null);
      return;
    }

    const { error: tierError } = await supabase.from('batch_pricing_tiers').insert({
      batch_id: createdBatch.id,
      min_qty: 1,
      unit_price: peptide.default_unit_price,
    });

    if (tierError) {
      setErrorMessage(tierError.message);
      setSubmittingKey(null);
      return;
    }

    const { error: wishlistUpdateError } = await supabase
      .from('wishlist_requests')
      .update({
        status: 'CONVERTED_TO_BATCH',
        converted_batch_id: createdBatch.id,
      })
      .eq('peptide_id', item.peptideId)
      .eq('status', 'CONFIRMED');

    if (wishlistUpdateError) {
      setErrorMessage(wishlistUpdateError.message);
      setSubmittingKey(null);
      return;
    }

    setMessage(`Production batch ${batchCode} created successfully.`);
    setSubmittingKey(null);
    await loadWishlistData();
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
          <Typography color="text.secondary">Loading wishlist admin...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Wishlist Demand Management"
      subtitle="Review, confirm, and convert wishlist demand into production"
      navItems={adminNavItems}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Open / Review Requests
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.openRequests}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Confirmed Requests
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.confirmedRequests}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Demand
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.totalDemand.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Units tracked
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Peptides in Demand
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.trackedPeptides}
            </Typography>
          </StatCard>
        </StatsGrid>

        <PageGrid>
          <SectionCard>
            <Typography variant="h5" fontWeight={800}>
              Demand Summary by Peptide
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Set targets, confirm viable demand, and create production batches.
            </Typography>

            {summaryRows.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" fontWeight={700}>
                  No wishlist demand found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  User wishlist requests will appear here once they are submitted.
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap>
                {summaryRows.map((item) => (
                  <ListCard key={item.peptideId}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={800}>
                          {item.peptideName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.requestCount} request{item.requestCount === 1 ? '' : 's'}
                        </Typography>
                      </Box>

                      <StatusChip
                        status={item.confirmed ? 'CONFIRMED' : item.status}
                        label={item.confirmed ? 'Target Met' : undefined}
                      />
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Requested
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {item.totalRequested.toLocaleString()} units
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Target Allocation
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {item.targetAllocation
                            ? `${item.targetAllocation.toLocaleString()} units`
                            : '—'}
                        </Typography>
                      </Box>
                    </MetaGrid>

                    <ActionGrid>
                      <StyledTextField
                        label="Target Allocation"
                        type="number"
                        value={targetDrafts[item.peptideId] ?? String(item.targetAllocation || '')}
                        onChange={(e) =>
                          setTargetDrafts((prev) => ({
                            ...prev,
                            [item.peptideId]: e.target.value,
                          }))
                        }
                        fullWidth
                      />

                      <Button
                        variant="outlined"
                        onClick={() => updateTargetAllocation(item.peptideId)}
                        disabled={submittingKey === `target-${item.peptideId}`}
                        sx={{ minHeight: 56, borderRadius: 4, textTransform: 'none', fontWeight: 700 }}
                      >
                        {submittingKey === `target-${item.peptideId}` ? (
                          <CircularProgress size={18} />
                        ) : (
                          'Save Target'
                        )}
                      </Button>

                      <Button
                        variant="contained"
                        onClick={() => confirmAllocation(item)}
                        disabled={submittingKey === `confirm-${item.peptideId}`}
                        sx={{ minHeight: 56, borderRadius: 4, textTransform: 'none', fontWeight: 700 }}
                      >
                        {submittingKey === `confirm-${item.peptideId}` ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          'Confirm'
                        )}
                      </Button>
                    </ActionGrid>

                    <Button
                      variant="text"
                      onClick={() => createBatchFromWishlist(item)}
                      disabled={submittingKey === `batch-${item.peptideId}`}
                      sx={{ mt: 1.5, px: 0, textTransform: 'none', fontWeight: 700 }}
                    >
                      {submittingKey === `batch-${item.peptideId}` ? (
                        <CircularProgress size={18} />
                      ) : (
                        'Create Batch from Confirmed Demand'
                      )}
                    </Button>
                  </ListCard>
                ))}
              </ListWrap>
            )}
          </SectionCard>

          <SectionCard>
            <Typography variant="h5" fontWeight={800}>
              Individual Wishlist Requests
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Review individual company demand and user notes.
            </Typography>

            {wishlistRows.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" fontWeight={700}>
                  No requests submitted
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Individual requests will appear here once users start submitting them.
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap>
                {wishlistRows.slice(0, 12).map((row) => (
                  <ListCard key={row.id}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={800}>
                          {row.peptide?.name || 'Peptide'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {row.company?.name || 'Company'} · {row.user?.first_name || ''} {row.user?.last_name || ''}
                        </Typography>
                      </Box>

                      <StatusChip status={row.status} />
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Requested Quantity
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {Number(row.requested_quantity || 0).toLocaleString()} units
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Desired Timeline
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {row.desired_timeline || '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Target Allocation
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {row.target_allocation
                            ? `${Number(row.target_allocation).toLocaleString()} units`
                            : '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Submitted
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {formatDate(row.created_at)}
                        </Typography>
                      </Box>
                    </MetaGrid>

                    {row.user_notes ? (
                      <Box sx={{ mt: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Notes
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {row.user_notes}
                        </Typography>
                      </Box>
                    ) : null}
                  </ListCard>
                ))}
              </ListWrap>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}