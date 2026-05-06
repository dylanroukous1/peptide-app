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
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import {
  ActionsGrid,
  BatchCard,
  EmptyWrap,
  FormGrid,
  FullWidthRow,
  ListWrap,
  MetaGrid,
  PageGrid,
  SecondaryActionsRow,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
  TierHelperBox,
} from './styles';

type PeptideRow = {
  id: string;
  name: string;
  default_unit_price: number;
  is_active: boolean;
};

type BatchTierRow = {
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
  internal_notes: string | null;
  status: string;
  created_at?: string;
  peptide?: { name: string } | null;
  tiers?: BatchTierRow[];
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

function parsePricingTiers(value: string, fallbackPrice: number, fallbackMoq: number) {
  const parsed = String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [minQty, unitPrice] = line.split(':').map((part) => part.trim());
      return {
        min_qty: Number(minQty),
        unit_price: Number(unitPrice),
      };
    })
    .filter(
      (tier) =>
        Number.isFinite(tier.min_qty) &&
        Number.isFinite(tier.unit_price) &&
        tier.min_qty > 0 &&
        tier.unit_price > 0
    );

  return parsed.length
    ? parsed
    : [{ min_qty: Number(fallbackMoq || 1), unit_price: Number(fallbackPrice || 0) }];
}

function tiersToText(batch: BatchRow) {
  const tiers = batch.tiers?.length
    ? [...batch.tiers]
    : [{ min_qty: batch.moq || 1, unit_price: batch.unit_price }];

  return tiers
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((tier) => `${tier.min_qty}:${tier.unit_price}`)
    .join('\n');
}

function pricingTierLabel(batch: BatchRow) {
  const tiers = batch.tiers?.length
    ? [...batch.tiers]
    : [{ min_qty: batch.moq || 1, unit_price: batch.unit_price }];

  return tiers
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((tier) => `${Number(tier.min_qty).toLocaleString()}+ @ ${money(tier.unit_price)}`)
    .join(' · ');
}

export default function AdminBatchesScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingBatchId, setSavingBatchId] = useState<string | null>(null);
  const [archivingBatchId, setArchivingBatchId] = useState<string | null>(null);

  const [newBatch, setNewBatch] = useState({
    peptideId: '',
    batchCode: '',
    batchDate: '',
    totalQuantity: '',
    moq: '',
    unitPrice: '',
    etaDate: '',
    publicNotes: '',
  });

  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        peptideId: string;
        unitPrice: string;
        moq: string;
        status: string;
        pricingTiers: string;
      }
    >
  >({});

  const loadBatches = async () => {
    setLoading(true);
    setErrorMessage('');

    const [
      { data: peptideData, error: peptideError },
      { data: batchData, error: batchError },
      { data: tierData, error: tierError },
    ] = await Promise.all([
      supabase
        .from('peptides')
        .select('id, name, default_unit_price, is_active')
        .order('name', { ascending: true }),
      supabase
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
          internal_notes,
          status,
          created_at,
          peptide:peptides(name)
        `)
        .order('batch_date', { ascending: false }),
      supabase
        .from('batch_pricing_tiers')
        .select('id, batch_id, min_qty, unit_price')
        .order('min_qty', { ascending: true }),
    ]);

    if (peptideError || batchError || tierError) {
      setErrorMessage(
        peptideError?.message || batchError?.message || tierError?.message || 'Failed to load batches.'
      );
      setLoading(false);
      return;
    }

    const tiersByBatchId = (tierData || []).reduce<Record<string, BatchTierRow[]>>((acc, row) => {
      if (!acc[row.batch_id]) acc[row.batch_id] = [];
      acc[row.batch_id].push(row);
      return acc;
    }, {});

    const normalizedBatches: BatchRow[] = (batchData || []).map((row: any) => ({
      ...row,
      peptide: Array.isArray(row.peptide) ? row.peptide[0] : row.peptide,
      tiers: tiersByBatchId[row.id] || [],
    }));

    const initialDrafts: Record<
      string,
      {
        peptideId: string;
        unitPrice: string;
        moq: string;
        status: string;
        pricingTiers: string;
      }
    > = {};

    normalizedBatches.forEach((row) => {
      initialDrafts[row.id] = {
        peptideId: row.peptide_id,
        unitPrice: String(row.unit_price),
        moq: String(row.moq),
        status: row.status,
        pricingTiers: tiersToText(row),
      };
    });

    setPeptides(peptideData || []);
    setBatches(normalizedBatches);
    setDrafts(initialDrafts);
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

    loadBatches();
  }, [profile, router, sessionLoading]);

  const stats = useMemo(() => {
    const activeBatches = batches.filter((item) => item.status === 'OPEN').length;
    const archivedBatches = batches.filter((item) => item.status === 'ARCHIVED').length;
    const totalQuantity = batches.reduce((sum, item) => sum + Number(item.total_quantity || 0), 0);
    const remainingQuantity = batches.reduce((sum, item) => {
      return (
        sum +
        (Number(item.total_quantity || 0) -
          Number(item.reserved_quantity || 0) -
          Number(item.approved_quantity || 0))
      );
    }, 0);

    return {
      total: batches.length,
      activeBatches,
      archivedBatches,
      totalQuantity,
      remainingQuantity,
    };
  }, [batches]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !newBatch.peptideId ||
      !newBatch.batchCode ||
      !newBatch.batchDate ||
      !newBatch.totalQuantity ||
      !newBatch.moq ||
      !newBatch.unitPrice
    ) {
      setErrorMessage('Fill in all required batch fields.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { data: createdBatch, error: batchError } = await supabase
      .from('batches')
      .insert({
        peptide_id: newBatch.peptideId,
        batch_code: newBatch.batchCode.trim(),
        batch_date: newBatch.batchDate,
        total_quantity: Number(newBatch.totalQuantity),
        reserved_quantity: 0,
        approved_quantity: 0,
        moq: Number(newBatch.moq),
        unit_price: Number(newBatch.unitPrice),
        eta_date: newBatch.etaDate || null,
        public_notes: newBatch.publicNotes || null,
        internal_notes: null,
        status: 'OPEN',
      })
      .select('id')
      .single();

    if (batchError || !createdBatch) {
      setErrorMessage(batchError?.message || 'Failed to create batch.');
      setSubmitting(false);
      return;
    }

    const { error: tierError } = await supabase.from('batch_pricing_tiers').insert({
      batch_id: createdBatch.id,
      min_qty: Number(newBatch.moq),
      unit_price: Number(newBatch.unitPrice),
    });

    if (tierError) {
      setErrorMessage(tierError.message);
      setSubmitting(false);
      return;
    }

    setNewBatch({
      peptideId: '',
      batchCode: '',
      batchDate: '',
      totalQuantity: '',
      moq: '',
      unitPrice: '',
      etaDate: '',
      publicNotes: '',
    });

    setMessage('New batch created successfully.');
    setSubmitting(false);
    await loadBatches();
  };

  const handleSaveBatch = async (batch: BatchRow) => {
    const draft = drafts[batch.id];
    if (!draft) return;

    const parsedTiers = parsePricingTiers(
      draft.pricingTiers,
      Number(draft.unitPrice || batch.unit_price),
      Number(draft.moq || batch.moq)
    );

    setSavingBatchId(batch.id);
    setMessage('');
    setErrorMessage('');

    const { error: batchError } = await supabase
      .from('batches')
      .update({
        peptide_id: draft.peptideId,
        unit_price: Number(draft.unitPrice),
        moq: Number(draft.moq),
        status: draft.status,
      })
      .eq('id', batch.id);

    if (batchError) {
      setErrorMessage(batchError.message);
      setSavingBatchId(null);
      return;
    }

    const { error: deleteTierError } = await supabase
      .from('batch_pricing_tiers')
      .delete()
      .eq('batch_id', batch.id);

    if (deleteTierError) {
      setErrorMessage(deleteTierError.message);
      setSavingBatchId(null);
      return;
    }

    const { error: insertTierError } = await supabase.from('batch_pricing_tiers').insert(
      parsedTiers.map((tier) => ({
        batch_id: batch.id,
        min_qty: tier.min_qty,
        unit_price: tier.unit_price,
      }))
    );

    if (insertTierError) {
      setErrorMessage(insertTierError.message);
      setSavingBatchId(null);
      return;
    }

    setMessage(`Batch ${batch.batch_code} saved successfully.`);
    setSavingBatchId(null);
    await loadBatches();
  };

  const handleArchiveBatch = async (batch: BatchRow) => {
    setArchivingBatchId(batch.id);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('batches')
      .update({
        status: 'ARCHIVED',
      })
      .eq('id', batch.id);

    if (error) {
      setErrorMessage(error.message);
      setArchivingBatchId(null);
      return;
    }

    setMessage(`Batch ${batch.batch_code} archived successfully.`);
    setArchivingBatchId(null);
    await loadBatches();
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
          <Typography color="text.secondary">Loading batches admin...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Batch Management"
      subtitle="Create, update, price, and archive production batches"
      navItems={adminNavItems}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Batches
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.total}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Open Batches
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.activeBatches}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Archived
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.archivedBatches}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Remaining Inventory
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.remainingQuantity.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              of {stats.totalQuantity.toLocaleString()} total units
            </Typography>
          </StatCard>
        </StatsGrid>

        <PageGrid>
          <SectionCard>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Create New Batch
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Open a new production batch linked to an existing peptide.
            </Typography>

            <FormGrid onSubmit={handleCreateBatch}>
              <StyledTextField
                select
                label="Peptide"
                value={newBatch.peptideId}
                onChange={(e) =>
                  setNewBatch((prev) => ({ ...prev, peptideId: e.target.value }))
                }
                fullWidth
                required
              >
                <MenuItem value="">Select peptide</MenuItem>
                {peptides
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.name}
                    </MenuItem>
                  ))}
              </StyledTextField>

              <StyledTextField
                label="Batch Code"
                value={newBatch.batchCode}
                onChange={(e) =>
                  setNewBatch((prev) => ({ ...prev, batchCode: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="Batch Date"
                type="date"
                value={newBatch.batchDate}
                onChange={(e) =>
                  setNewBatch((prev) => ({ ...prev, batchDate: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
                fullWidth
                required
              />

              <StyledTextField
                label="ETA Date"
                type="date"
                value={newBatch.etaDate}
                onChange={(e) =>
                  setNewBatch((prev) => ({ ...prev, etaDate: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
                fullWidth
              />

              <StyledTextField
                label="Total Quantity"
                type="number"
                value={newBatch.totalQuantity}
                onChange={(e) =>
                  setNewBatch((prev) => ({ ...prev, totalQuantity: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="MOQ"
                type="number"
                value={newBatch.moq}
                onChange={(e) =>
                  setNewBatch((prev) => ({ ...prev, moq: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="Unit Price"
                type="number"
                value={newBatch.unitPrice}
                onChange={(e) =>
                  setNewBatch((prev) => ({ ...prev, unitPrice: e.target.value }))
                }
                fullWidth
                required
              />

              <FullWidthRow>
                <StyledTextField
                  label="Public Notes"
                  value={newBatch.publicNotes}
                  onChange={(e) =>
                    setNewBatch((prev) => ({ ...prev, publicNotes: e.target.value }))
                  }
                  multiline
                  minRows={3}
                  fullWidth
                />
              </FullWidthRow>

              <FullWidthRow>
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
                    width: '100%',
                  }}
                >
                  {submitting ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    'Create Batch'
                  )}
                </Button>
              </FullWidthRow>
            </FormGrid>
          </SectionCard>

          <SectionCard>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Existing Batches
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Update linked peptide, pricing tiers, MOQ, and status.
            </Typography>

            {batches.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  No batches found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Create your first production batch to begin allocation workflows.
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap>
                {batches.map((batch) => (
                  <BatchCard key={batch.id}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          {batch.peptide?.name || 'Peptide'} · {batch.batch_code}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {pricingTierLabel(batch)}
                        </Typography>
                      </Box>

                      <StatusChip status={batch.status} />
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Batch Date
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatDate(batch.batch_date)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          ETA
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatDate(batch.eta_date)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Quantity
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {Number(batch.total_quantity).toLocaleString()} units
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Reserved
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {Number(batch.reserved_quantity).toLocaleString()} units
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Approved
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {Number(batch.approved_quantity).toLocaleString()} units
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Starting Price
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {money(batch.unit_price)} / unit
                        </Typography>
                      </Box>
                    </MetaGrid>

                    <ActionsGrid>
                      <StyledTextField
                        select
                        label="Peptide"
                        value={drafts[batch.id]?.peptideId || batch.peptide_id}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [batch.id]: {
                              ...prev[batch.id],
                              peptideId: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      >
                        {peptides.map((item) => (
                          <MenuItem key={item.id} value={item.id}>
                            {item.name}
                          </MenuItem>
                        ))}
                      </StyledTextField>

                      <StyledTextField
                        label="Unit Price"
                        type="number"
                        value={drafts[batch.id]?.unitPrice || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [batch.id]: {
                              ...prev[batch.id],
                              unitPrice: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      />

                      <StyledTextField
                        label="MOQ"
                        type="number"
                        value={drafts[batch.id]?.moq || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [batch.id]: {
                              ...prev[batch.id],
                              moq: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      />

                      <StyledTextField
                        select
                        label="Status"
                        value={drafts[batch.id]?.status || batch.status}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [batch.id]: {
                              ...prev[batch.id],
                              status: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      >
                        <MenuItem value="OPEN">OPEN</MenuItem>
                        <MenuItem value="CLOSED">CLOSED</MenuItem>
                        <MenuItem value="ARCHIVED">ARCHIVED</MenuItem>
                      </StyledTextField>
                    </ActionsGrid>

                    <TierHelperBox>
                      <Typography variant="caption" color="text.secondary">
                        Pricing tiers format: one per line as <strong>minQty:unitPrice</strong>
                      </Typography>
                    </TierHelperBox>

                    <Box sx={{ mt: 1.5 }}>
                      <StyledTextField
                        label="Pricing Tiers"
                        value={drafts[batch.id]?.pricingTiers || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [batch.id]: {
                              ...prev[batch.id],
                              pricingTiers: e.target.value,
                            },
                          }))
                        }
                        multiline
                        minRows={4}
                        fullWidth
                      />
                    </Box>

                    <SecondaryActionsRow>
                      <Button
                        variant="contained"
                        onClick={() => handleSaveBatch(batch)}
                        disabled={savingBatchId === batch.id}
                        sx={{
                          minHeight: 48,
                          borderRadius: 4,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {savingBatchId === batch.id ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          'Save Batch'
                        )}
                      </Button>

                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => handleArchiveBatch(batch)}
                        disabled={archivingBatchId === batch.id}
                        sx={{
                          minHeight: 48,
                          borderRadius: 4,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {archivingBatchId === batch.id ? (
                          <CircularProgress size={18} />
                        ) : (
                          'Archive Batch'
                        )}
                      </Button>
                    </SecondaryActionsRow>
                  </BatchCard>
                ))}
              </ListWrap>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}
