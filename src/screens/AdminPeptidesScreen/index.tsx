'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import { adminNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import ScrollableResults from '@/src/components/feedback/ScrollableResults';
import AppSnackbar from '@/src/commons/AppSnackBar';
import { useAppToast } from '@/src/hooks/useAppToast';
import { useSessionStorageState } from '@/src/hooks/useSessionStorageState';
import {
  ActionsGrid,
  ActionButtons,
  EmptyWrap,
  FiltersGrid,
  FormGrid,
  ListWrap,
  MetaGrid,
  PageGrid,
  PeptideCard,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
} from './styles';

type PeptideRow = {
  id: string;
  name: string;
  default_unit_price: number;
  is_active: boolean;
  created_at?: string;
};

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
  return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
}

export default function AdminPeptidesScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingPeptideId, setSavingPeptideId] = useState<string | null>(null);
  const [togglingPeptideId, setTogglingPeptideId] = useState<string | null>(null);
  const [deletePeptide, setDeletePeptide] = useState<PeptideRow | null>(null);
  const [deletingPeptideId, setDeletingPeptideId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [search, setSearch] = useSessionStorageState('admin-peptide-search', '');
  const [statusFilter, setStatusFilter] = useSessionStorageState(
    'admin-peptide-status-filter',
    'ALL'
  );
  const { toast, showToast, closeToast } = useAppToast();

  const [newPeptide, setNewPeptide] = useState({
    name: '',
    defaultUnitPrice: '',
  });

  const [drafts, setDrafts] = useState<
    Record<string, { name: string; defaultUnitPrice: string }>
  >({});

  const loadPeptides = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('peptides')
      .select('id, name, default_unit_price, is_active, created_at')
      .order('name', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = data || [];
    setPeptides(rows);

    const initialDrafts: Record<string, { name: string; defaultUnitPrice: string }> = {};
    rows.forEach((row) => {
      initialDrafts[row.id] = {
        name: row.name,
        defaultUnitPrice: String(row.default_unit_price),
      };
    });
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

    const timer = window.setTimeout(() => void loadPeptides(), 0);
    return () => window.clearTimeout(timer);
  }, [profile, router, sessionLoading]);

  const stats = useMemo(() => {
    const activeCount = peptides.filter((item) => item.is_active).length;
    const inactiveCount = peptides.filter((item) => !item.is_active).length;
    const avgPrice =
      peptides.length > 0
        ? peptides.reduce((sum, item) => sum + Number(item.default_unit_price || 0), 0) /
          peptides.length
        : 0;
    const highestPrice =
      peptides.length > 0
        ? Math.max(...peptides.map((item) => Number(item.default_unit_price || 0)))
        : 0;

    return {
      total: peptides.length,
      activeCount,
      inactiveCount,
      avgPrice,
      highestPrice,
    };
  }, [peptides]);

  const filteredPeptides = useMemo(() => {
    const query = search.trim().toLowerCase();
    return peptides.filter((peptide) => {
      const matchesSearch = !query || peptide.name.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && peptide.is_active) ||
        (statusFilter === 'INACTIVE' && !peptide.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [peptides, search, statusFilter]);

  const handleCreatePeptide = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = newPeptide.name.trim();
    const price = Number(newPeptide.defaultUnitPrice || 0);

    if (!trimmedName || !price || price <= 0) {
      setErrorMessage('Enter a valid peptide name and default unit price.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('peptides')
      .insert({
        name: trimmedName,
        default_unit_price: price,
        is_active: true,
      })
      .select('id, name, default_unit_price, is_active, created_at')
      .single();

    if (error) {
      showToast(error.message, 'error');
      setSubmitting(false);
      return;
    }

    setNewPeptide({ name: '', defaultUnitPrice: '' });
    setPeptides((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
    setDrafts((current) => ({
      ...current,
      [data.id]: { name: data.name, defaultUnitPrice: String(data.default_unit_price) },
    }));
    showToast(`Peptide ${trimmedName} created successfully.`);
    setSubmitting(false);
  };

  const handleSavePeptide = async (peptideId: string) => {
    const draft = drafts[peptideId];
    const trimmedName = draft?.name?.trim() || '';
    const price = Number(draft?.defaultUnitPrice || 0);

    if (!trimmedName || !price || price <= 0) {
      setErrorMessage('Enter a valid peptide name and default unit price before saving.');
      return;
    }

    setSavingPeptideId(peptideId);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('peptides')
      .update({
        name: trimmedName,
        default_unit_price: price,
      })
      .eq('id', peptideId)
      .select('id, name, default_unit_price, is_active, created_at')
      .single();

    if (error) {
      showToast(error.message, 'error');
      setSavingPeptideId(null);
      return;
    }

    showToast(`Peptide ${trimmedName} saved successfully.`);
    setPeptides((current) =>
      current
        .map((item) => (item.id === peptideId ? data : item))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setSavingPeptideId(null);
  };

  const handleTogglePeptide = async (row: PeptideRow) => {
    if (
      row.is_active &&
      !window.confirm(`Deactivate ${row.name}? It will no longer appear in the partner catalog.`)
    ) {
      return;
    }

    setTogglingPeptideId(row.id);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('peptides')
      .update({
        is_active: !row.is_active,
      })
      .eq('id', row.id)
      .select('id, name, default_unit_price, is_active, created_at')
      .single();

    if (error) {
      showToast(error.message, 'error');
      setTogglingPeptideId(null);
      return;
    }

    showToast(
      `Peptide ${row.name} ${row.is_active ? 'deactivated' : 'activated'} successfully.`
    );
    setPeptides((current) => current.map((item) => (item.id === row.id ? data : item)));
    setTogglingPeptideId(null);
  };

  const handleDeletePeptide = async () => {
    if (!deletePeptide || deletingPeptideId) return;

    setDeletingPeptideId(deletePeptide.id);
    setDeleteError('');

    const { error } = await supabase.rpc('admin_delete_peptide', {
      p_peptide_id: deletePeptide.id,
    });

    if (error) {
      setDeleteError(error.message);
      setDeletingPeptideId(null);
      return;
    }

    const deletedId = deletePeptide.id;
    const deletedName = deletePeptide.name;
    setPeptides((current) => current.filter((peptide) => peptide.id !== deletedId));
    setDrafts((current) => {
      const next = { ...current };
      delete next[deletedId];
      return next;
    });
    setDeletePeptide(null);
    setDeletingPeptideId(null);
    showToast(`Peptide ${deletedName} deleted permanently.`);
  };

  if (sessionLoading || loading) {
    return <PageSkeleton label="Loading peptide catalog" />;
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Peptide Management"
      subtitle="Create, update, and manage active peptide catalog entries"
      navItems={adminNavigation}
    >
      <Stack spacing={3}>
        {errorMessage ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => void loadPeptides()}>Retry</Button>}>
            {errorMessage}
          </Alert>
        ) : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Peptides
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.total}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Active
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.activeCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Inactive
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.inactiveCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Average Default Price
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {money(stats.avgPrice)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Highest: {money(stats.highestPrice)}
            </Typography>
          </StatCard>
        </StatsGrid>

        <PageGrid>
          <SectionCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              Create New Peptide
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add a new peptide to the catalog with a default unit price.
            </Typography>

            <FormGrid onSubmit={handleCreatePeptide}>
              <StyledTextField
                label="Peptide Name"
                value={newPeptide.name}
                onChange={(e) =>
                  setNewPeptide((prev) => ({ ...prev, name: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="Default Unit Price"
                type="number"
                slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
                value={newPeptide.defaultUnitPrice}
                onChange={(e) =>
                  setNewPeptide((prev) => ({
                    ...prev,
                    defaultUnitPrice: e.target.value,
                  }))
                }
                fullWidth
                required
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
                  'Create Peptide'
                )}
              </Button>
            </FormGrid>
          </SectionCard>

          <SectionCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              Existing Peptides
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Update pricing, rename entries, or activate and deactivate peptides.
            </Typography>

            <FiltersGrid>
              <StyledTextField
                label="Search products"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                fullWidth
              />
              <StyledTextField
                select
                label="Status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                fullWidth
              >
                <MenuItem value="ALL">All peptides</MenuItem>
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="INACTIVE">Inactive</MenuItem>
              </StyledTextField>
            </FiltersGrid>

            {filteredPeptides.length === 0 ? (
              <EmptyWrap>
                <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
                  {peptides.length === 0 ? 'No peptides found' : 'No matching products'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {peptides.length === 0
                    ? 'Create your first peptide to start building the catalog.'
                    : 'Try a different product name.'}
                </Typography>
              </EmptyWrap>
            ) : (
              <ScrollableResults
                containerComponent={ListWrap}
                count={filteredPeptides.length}
                label="Peptide records"
                singularLabel="product"
              >
                {filteredPeptides.map((row) => (
                  <PeptideCard key={row.id}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                    }}
                    spacing={1.5}
                  >
                      <Box>
                      <Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>
                          {row.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Default price: {money(row.default_unit_price)} / unit
                        </Typography>
                      </Box>

                      <StatusChip status={row.is_active ? 'ACTIVE' : 'SUSPENDED'} />
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Created
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatDate(row.created_at)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Current Default Price
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {money(row.default_unit_price)}
                        </Typography>
                      </Box>
                    </MetaGrid>

                    <ActionsGrid>
                      <StyledTextField
                        label="Peptide Name"
                        value={drafts[row.id]?.name || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              name: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      />

                      <StyledTextField
                        label="Default Price"
                        type="number"
                        slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
                        value={drafts[row.id]?.defaultUnitPrice || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              defaultUnitPrice: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      />

                      <ActionButtons>
                        <Button
                          variant="contained"
                          onClick={() => handleSavePeptide(row.id)}
                          disabled={savingPeptideId === row.id}
                        >
                          {savingPeptideId === row.id ? (
                            <CircularProgress size={18} color="inherit" />
                          ) : (
                            'Save changes'
                          )}
                        </Button>

                        <Button
                          variant="outlined"
                          color={row.is_active ? 'warning' : 'success'}
                          onClick={() => handleTogglePeptide(row)}
                          disabled={togglingPeptideId === row.id}
                        >
                          {togglingPeptideId === row.id ? (
                            <CircularProgress size={18} color="inherit" />
                          ) : row.is_active ? (
                            'Deactivate'
                          ) : (
                            'Activate'
                          )}
                        </Button>

                        <Button
                          variant="outlined"
                          color="error"
                          onClick={() => {
                            setDeletePeptide(row);
                            setDeleteError('');
                          }}
                          disabled={Boolean(deletingPeptideId)}
                        >
                          Delete peptide
                        </Button>
                      </ActionButtons>
                    </ActionsGrid>
                  </PeptideCard>
                ))}
              </ScrollableResults>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
      <Dialog
        open={Boolean(deletePeptide)}
        onClose={() => deletingPeptideId ? undefined : setDeletePeptide(null)}
        aria-labelledby="delete-peptide-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="delete-peptide-title">Delete {deletePeptide?.name}?</DialogTitle>
        <DialogContent>
          <Alert severity="error">
            This permanently deletes the peptide, its batches, legacy requests, and every order containing this peptide. For multi-product orders, the complete order will be deleted to keep totals consistent. Product lines and shipments belonging to those orders will also be removed. This action cannot be undone.
          </Alert>
          {deleteError ? <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletePeptide(null)} disabled={Boolean(deletingPeptideId)}>Keep peptide</Button>
          <Button color="error" variant="contained" onClick={() => void handleDeletePeptide()} disabled={Boolean(deletingPeptideId)}>
            {deletingPeptideId ? <CircularProgress size={18} color="inherit" /> : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>
      <AppSnackbar {...toast} onClose={closeToast} />
    </AppShell>
  );
}
