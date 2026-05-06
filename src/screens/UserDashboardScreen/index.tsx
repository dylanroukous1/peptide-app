'use client';

import { useEffect, useMemo, useState } from 'react';
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
import AppSnackbar from '@/src/commons/AppSnackBar';
import { supabase } from '@/src/supabase/client';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import {
  BatchCard,
  BatchFormCard,
  BatchInfoGrid,
  BatchLayout,
  BatchList,
  EmptyWrap,
  FormGrid,
  SectionCard,
  StyledTextField,
  StatCard,
  StatsGrid,
  SummaryBox,
} from './styles';

type BatchTier = {
  id: string;
  batch_id: string;
  min_qty: number;
  unit_price: number;
};

type BatchRow = {
  id: string;
  peptide_id: string;
  batch_code: string;
  batch_date: string;
  total_quantity: number;
  reserved_quantity: number;
  approved_quantity: number;
  moq: number;
  unit_price: number;
  eta_date: string | null;
  public_notes: string | null;
  status: string;
  peptide?: {
    name: string;
  } | null;
  tiers?: BatchTier[];
};

type AddressRow = {
  id: string;
  label: string | null;
  line1: string;
  city: string;
  is_default: boolean;
};

type DraftOrder = {
  requestedQuantity?: string;
  addressId?: string;
  userNotes?: string;
};

type ToastState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
};

const userNavItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Wishlist', href: '/wishlist' },
  { label: 'Peptides', href: '/peptides' },
  { label: 'My Orders', href: '/my-orders' },
  { label: 'Account', href: '/account' },
];

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function getRemainingUnits(batch: BatchRow) {
  return (
    Number(batch.total_quantity || 0) -
    Number(batch.reserved_quantity || 0) -
    Number(batch.approved_quantity || 0)
  );
}

function getTieredUnitPrice(batch: BatchRow, quantity: number) {
  const tiers = [...(batch.tiers || [])].sort((a, b) => a.min_qty - b.min_qty);
  if (!tiers.length) return Number(batch.unit_price || 0);

  return tiers.reduce((price, tier) => {
    return quantity >= Number(tier.min_qty) ? Number(tier.unit_price) : price;
  }, Number(batch.unit_price || 0));
}

function getNextTier(batch: BatchRow, quantity: number) {
  const tiers = [...(batch.tiers || [])].sort((a, b) => a.min_qty - b.min_qty);
  return tiers.find((tier) => quantity < Number(tier.min_qty)) || null;
}

function pricingTierLabel(batch: BatchRow) {
  const tiers = [...(batch.tiers || [])].sort((a, b) => a.min_qty - b.min_qty);
  if (!tiers.length) {
    return `${Number(batch.moq).toLocaleString()}+ @ ${money(batch.unit_price)}`;
  }

  return tiers
    .map((tier) => `${Number(tier.min_qty).toLocaleString()}+ @ ${money(tier.unit_price)}`)
    .join(' · ');
}

export default function UserDashboardScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [draftOrders, setDraftOrders] = useState<Record<string, DraftOrder>>({});
  const [loading, setLoading] = useState(true);
  const [submittingBatchId, setSubmittingBatchId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: '',
    severity: 'success',
  });

  const showToast = (
    toastMessage: string,
    severity: 'success' | 'error' | 'info' | 'warning' = 'success'
  ) => {
    setToast({
      open: true,
      message: toastMessage,
      severity,
    });
  };

  const loadDashboard = async () => {
    if (!profile) return;

    setLoading(true);
    setErrorMessage('');

    const { data: batchRows, error: batchesError } = await supabase
      .from('batches')
      .select(`
        id,
        peptide_id,
        batch_code,
        batch_date,
        total_quantity,
        reserved_quantity,
        approved_quantity,
        moq,
        unit_price,
        eta_date,
        public_notes,
        status,
        peptide:peptides(name)
      `)
      .eq('status', 'OPEN')
      .order('batch_date', { ascending: false });

    if (batchesError) {
      setErrorMessage(batchesError.message);
      setLoading(false);
      return;
    }

    const batchIds = (batchRows || []).map((batch) => batch.id);

    let tiersByBatchId: Record<string, BatchTier[]> = {};

    if (batchIds.length) {
      const { data: tierRows, error: tiersError } = await supabase
        .from('batch_pricing_tiers')
        .select('id, batch_id, min_qty, unit_price')
        .in('batch_id', batchIds)
        .order('min_qty', { ascending: true });

      if (tiersError) {
        setErrorMessage(tiersError.message);
        setLoading(false);
        return;
      }

      tiersByBatchId = (tierRows || []).reduce((acc: Record<string, BatchTier[]>, tier) => {
        if (!acc[tier.batch_id]) acc[tier.batch_id] = [];
        acc[tier.batch_id].push(tier);
        return acc;
      }, {});
    }

    const enrichedBatches: BatchRow[] = (batchRows || []).map((batch) => ({
      ...batch,
      peptide: Array.isArray(batch.peptide) ? batch.peptide[0] : batch.peptide,
      tiers: tiersByBatchId[batch.id] || [],
    }));

    if (!profile.company_id) {
      setBatches(enrichedBatches);
      setAddresses([]);
      setLoading(false);
      return;
    }

    const { data: addressRows, error: addressError } = await supabase
      .from('company_addresses')
      .select('id, label, line1, city, is_default')
      .eq('company_id', profile.company_id)
      .order('is_default', { ascending: false });

    if (addressError) {
      setErrorMessage(addressError.message);
      setLoading(false);
      return;
    }

    setBatches(enrichedBatches);
    setAddresses(addressRows || []);
    setLoading(false);
  };

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

    loadDashboard();
  }, [profile, router, sessionLoading]);

  const stats = useMemo(() => {
    const activeBatches = batches.length;
    const remainingInventory = batches.reduce((sum, batch) => sum + getRemainingUnits(batch), 0);
    const defaultAddressCount = addresses.filter((address) => address.is_default).length;
    const averageStartingPrice =
      batches.length > 0
        ? batches.reduce((sum, batch) => sum + Number(batch.unit_price || 0), 0) / batches.length
        : 0;

    return {
      activeBatches,
      remainingInventory,
      addressCount: addresses.length,
      defaultAddressCount,
      averageStartingPrice,
    };
  }, [addresses, batches]);

  const updateDraft = (batchId: string, field: keyof DraftOrder, value: string) => {
    setDraftOrders((prev) => ({
      ...prev,
      [batchId]: {
        ...prev[batchId],
        [field]: value,
      },
    }));
  };

  const handleSubmitOrder = async (batch: BatchRow) => {
    if (!profile) return;

    if (!profile.company_id) {
      showToast(
        'Your account is active but not yet assigned to a company. Please contact an admin.',
        'error'
      );
      return;
    }

    const draft = draftOrders[batch.id] || {};
    const requestedQuantity = Number(draft.requestedQuantity || 0);
    const defaultAddressId = addresses.find((address) => address.is_default)?.id || '';
    const addressId = draft.addressId || defaultAddressId;
    const userNotes = draft.userNotes || '';
    const remaining = getRemainingUnits(batch);

    if (!requestedQuantity || requestedQuantity < Number(batch.moq)) {
      showToast(
        `Minimum order for ${batch.peptide?.name || 'this batch'} is ${batch.moq} units.`,
        'error'
      );
      return;
    }

    if (requestedQuantity > remaining) {
      showToast(`Only ${remaining.toLocaleString()} units remain for this batch.`, 'error');
      return;
    }

    if (!addressId) {
      showToast('Please select a shipping address.', 'error');
      return;
    }

    setSubmittingBatchId(batch.id);

    const { error } = await supabase.rpc('submit_order_with_reservation', {
      p_batch_id: batch.id,
      p_address_id: addressId,
      p_requested_quantity: requestedQuantity,
      p_user_notes: userNotes || null,
    });

    if (error) {
      showToast(error.message, 'error');
      setSubmittingBatchId(null);
      return;
    }

    setDraftOrders((prev) => ({
      ...prev,
      [batch.id]: {},
    }));

    showToast('Order submitted successfully.', 'success');
    setSubmittingBatchId(null);
    await loadDashboard();
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
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress />
          <Typography color="text.secondary">Loading dashboard...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Partner Ordering Portal"
      subtitle="Available production batches and ordering"
      navItems={userNavItems}
    >
      <Stack spacing={3}>
        <AppSnackbar
          open={toast.open}
          message={toast.message}
          severity={toast.severity}
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        />

        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        {!profile.company_id ? (
          <Alert severity="warning">
            Your account is active, but no company has been assigned yet. An admin must assign
            your company before you can save addresses, submit wishlist requests, or place orders.
          </Alert>
        ) : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Active Batches
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.activeBatches}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Remaining Inventory
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.remainingInventory.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Units available
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Saved Addresses
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.addressCount}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stats.defaultAddressCount} default
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Avg Starting Price
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {money(stats.averageStartingPrice)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Per unit
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h5" fontWeight={800}>
                Available Production Batches
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Review open inventory, pricing tiers, and submit allocation requests.
              </Typography>
            </Box>

            {batches.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" fontWeight={700}>
                  No open batches available
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Once new production inventory is opened by an admin, it will appear here.
                </Typography>
              </EmptyWrap>
            ) : (
              <BatchList>
                {batches.map((batch) => {
                  const draft = draftOrders[batch.id] || {};
                  const requestedQuantity = Number(draft.requestedQuantity || 0);
                  const appliedUnitPrice = requestedQuantity
                    ? getTieredUnitPrice(batch, requestedQuantity)
                    : Number(batch.unit_price || 0);
                  const totalPrice = requestedQuantity * appliedUnitPrice;
                  const nextTier = getNextTier(batch, requestedQuantity);
                  const remaining = getRemainingUnits(batch);
                  const defaultAddressId =
                    addresses.find((address) => address.is_default)?.id || '';

                  return (
                    <BatchCard key={batch.id}>
                      <BatchLayout>
                        <Box>
                          <Stack
                            direction="row"
                            spacing={1.25}
                            alignItems="center"
                            flexWrap="wrap"
                            useFlexGap
                          >
                            <Typography variant="h5" fontWeight={800}>
                              {batch.peptide?.name || 'Peptide'}
                            </Typography>
                            <StatusChip status={batch.status} />
                          </Stack>

                          <BatchInfoGrid>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Batch Code
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {batch.batch_code}
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Batch Date
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {formatDate(batch.batch_date)}
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Total Quantity
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {Number(batch.total_quantity).toLocaleString()} units
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Reserved
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {Number(batch.reserved_quantity).toLocaleString()} units
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Approved
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {Number(batch.approved_quantity).toLocaleString()} units
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Remaining
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {remaining.toLocaleString()} units
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                MOQ
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {Number(batch.moq).toLocaleString()} units
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Starting Price
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {money(batch.unit_price)} / unit
                              </Typography>
                            </Box>

                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                ETA
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {formatDate(batch.eta_date)}
                              </Typography>
                            </Box>

                            <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}>
                              <Typography variant="caption" color="text.secondary">
                                Volume Pricing
                              </Typography>
                              <Typography variant="body1" fontWeight={600}>
                                {pricingTierLabel(batch)}
                              </Typography>
                            </Box>
                          </BatchInfoGrid>

                          {batch.public_notes ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                              {batch.public_notes}
                            </Typography>
                          ) : null}
                        </Box>

                        <BatchFormCard>
                          <Typography variant="subtitle1" fontWeight={800}>
                            Allocate Inventory
                          </Typography>

                          <FormGrid sx={{ mt: 2 }}>
                            <StyledTextField
                              label="Requested Quantity"
                              placeholder={`Minimum ${batch.moq}`}
                              value={draft.requestedQuantity || ''}
                              onChange={(e) =>
                                updateDraft(batch.id, 'requestedQuantity', e.target.value)
                              }
                              fullWidth
                            />

                            <StyledTextField
                              select
                              label="Shipping Address"
                              value={draft.addressId || defaultAddressId}
                              onChange={(e) =>
                                updateDraft(batch.id, 'addressId', e.target.value)
                              }
                              fullWidth
                            >
                              <MenuItem value="">Select address</MenuItem>
                              {addresses.map((address) => (
                                <MenuItem key={address.id} value={address.id}>
                                  {(address.label || 'Address') +
                                    ' · ' +
                                    address.line1 +
                                    ', ' +
                                    address.city}
                                </MenuItem>
                              ))}
                            </StyledTextField>

                            <StyledTextField
                              label="Notes"
                              value={draft.userNotes || ''}
                              onChange={(e) =>
                                updateDraft(batch.id, 'userNotes', e.target.value)
                              }
                              multiline
                              minRows={3}
                              fullWidth
                            />

                            <SummaryBox>
                              <Stack spacing={1}>
                                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Total Quantity
                                  </Typography>
                                  <Typography variant="body2" fontWeight={700}>
                                    {requestedQuantity ? `${requestedQuantity} units` : '—'}
                                  </Typography>
                                </Stack>

                                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Applied Unit Price
                                  </Typography>
                                  <Typography variant="body2" fontWeight={700}>
                                    {requestedQuantity
                                      ? `${money(appliedUnitPrice)} / unit`
                                      : '—'}
                                  </Typography>
                                </Stack>

                                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    Total Price
                                  </Typography>
                                  <Typography variant="body2" fontWeight={700}>
                                    {requestedQuantity ? money(totalPrice) : '—'}
                                  </Typography>
                                </Stack>

                                {nextTier ? (
                                  <Alert severity="info" sx={{ mt: 1 }}>
                                    Order{' '}
                                    {(
                                      Number(nextTier.min_qty) - requestedQuantity
                                    ).toLocaleString()}{' '}
                                    more units to unlock {money(nextTier.unit_price)} / unit.
                                  </Alert>
                                ) : null}
                              </Stack>
                            </SummaryBox>

                            <Button
                              variant="contained"
                              size="large"
                              onClick={() => handleSubmitOrder(batch)}
                              disabled={submittingBatchId === batch.id || !profile.company_id}
                              sx={{
                                minHeight: 50,
                                borderRadius: 4,
                                textTransform: 'none',
                                fontWeight: 700,
                              }}
                              fullWidth
                            >
                              {submittingBatchId === batch.id ? (
                                <CircularProgress size={20} color="inherit" />
                              ) : (
                                'Submit Order'
                              )}
                            </Button>
                          </FormGrid>
                        </BatchFormCard>
                      </BatchLayout>
                    </BatchCard>
                  );
                })}
              </BatchList>
            )}
          </Stack>
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
