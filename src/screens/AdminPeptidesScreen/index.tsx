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
  ActionsGrid,
  EmptyWrap,
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

export default function AdminPeptidesScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingPeptideId, setSavingPeptideId] = useState<string | null>(null);
  const [togglingPeptideId, setTogglingPeptideId] = useState<string | null>(null);

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

    loadPeptides();
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

  const handleCreatePeptide = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = newPeptide.name.trim();
    const price = Number(newPeptide.defaultUnitPrice || 0);

    if (!trimmedName || !price || price <= 0) {
      setErrorMessage('Enter a valid peptide name and default unit price.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.from('peptides').insert({
      name: trimmedName,
      default_unit_price: price,
      is_active: true,
    });

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    setNewPeptide({ name: '', defaultUnitPrice: '' });
    setMessage(`Peptide ${trimmedName} created successfully.`);
    setSubmitting(false);
    await loadPeptides();
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
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('peptides')
      .update({
        name: trimmedName,
        default_unit_price: price,
      })
      .eq('id', peptideId);

    if (error) {
      setErrorMessage(error.message);
      setSavingPeptideId(null);
      return;
    }

    setMessage(`Peptide ${trimmedName} saved successfully.`);
    setSavingPeptideId(null);
    await loadPeptides();
  };

  const handleTogglePeptide = async (row: PeptideRow) => {
    setTogglingPeptideId(row.id);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('peptides')
      .update({
        is_active: !row.is_active,
      })
      .eq('id', row.id);

    if (error) {
      setErrorMessage(error.message);
      setTogglingPeptideId(null);
      return;
    }

    setMessage(
      `Peptide ${row.name} ${row.is_active ? 'deactivated' : 'activated'} successfully.`
    );
    setTogglingPeptideId(null);
    await loadPeptides();
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
          <Typography color="text.secondary">Loading peptides admin...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Peptide Management"
      subtitle="Create, update, and manage active peptide catalog entries"
      navItems={adminNavItems}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Peptides
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.total}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Active
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.activeCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Inactive
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.inactiveCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Average Default Price
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {money(stats.avgPrice)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Highest: {money(stats.highestPrice)}
            </Typography>
          </StatCard>
        </StatsGrid>

        <PageGrid>
          <SectionCard>
            <Typography variant="h5" fontWeight={800}>
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
            <Typography variant="h5" fontWeight={800}>
              Existing Peptides
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Update pricing, rename entries, or activate and deactivate peptides.
            </Typography>

            {peptides.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" fontWeight={700}>
                  No peptides found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Create your first peptide to start building the catalog.
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap>
                {peptides.map((row) => (
                  <PeptideCard key={row.id}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={800}>
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
                        <Typography variant="body2" fontWeight={600}>
                          {formatDate(row.created_at)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Current Default Price
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
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

                      <Button
                        variant="contained"
                        onClick={() => handleSavePeptide(row.id)}
                        disabled={savingPeptideId === row.id}
                        sx={{
                          minHeight: 56,
                          borderRadius: 4,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {savingPeptideId === row.id ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          'Save'
                        )}
                      </Button>

                      <Button
                        variant={row.is_active ? 'outlined' : 'contained'}
                        color={row.is_active ? 'warning' : 'success'}
                        onClick={() => handleTogglePeptide(row)}
                        disabled={togglingPeptideId === row.id}
                        sx={{
                          minHeight: 56,
                          borderRadius: 4,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {togglingPeptideId === row.id ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : row.is_active ? (
                          'Deactivate'
                        ) : (
                          'Activate'
                        )}
                      </Button>
                    </ActionsGrid>
                  </PeptideCard>
                ))}
              </ListWrap>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}