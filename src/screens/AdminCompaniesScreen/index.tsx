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
  ButtonRow,
  CompanyCard,
  EmptyWrap,
  FormGrid,
  ListWrap,
  MetaGrid,
  PageGrid,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
} from './styles';

type CompanyRow = {
  id: string;
  name: string;
  billing_contact_name: string | null;
  billing_email: string | null;
  phone: string | null;
  notes: string | null;
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

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function AdminCompaniesScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [togglingCompanyId, setTogglingCompanyId] = useState<string | null>(null);

  const [newCompany, setNewCompany] = useState({
    name: '',
    billingContactName: '',
    billingEmail: '',
    phone: '',
    notes: '',
  });

  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        name: string;
        billingContactName: string;
        billingEmail: string;
        phone: string;
        notes: string;
      }
    >
  >({});

  const loadCompanies = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('companies')
      .select('id, name, billing_contact_name, billing_email, phone, notes, is_active, created_at')
      .order('name', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = data || [];
    setCompanies(rows);

    const initialDrafts: Record<
      string,
      {
        name: string;
        billingContactName: string;
        billingEmail: string;
        phone: string;
        notes: string;
      }
    > = {};

    rows.forEach((row) => {
      initialDrafts[row.id] = {
        name: row.name || '',
        billingContactName: row.billing_contact_name || '',
        billingEmail: row.billing_email || '',
        phone: row.phone || '',
        notes: row.notes || '',
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

    loadCompanies();
  }, [profile, router, sessionLoading]);

  const stats = useMemo(() => {
    const active = companies.filter((item) => item.is_active).length;
    const inactive = companies.filter((item) => !item.is_active).length;
    const withBillingEmail = companies.filter((item) => !!item.billing_email).length;
    const withPhone = companies.filter((item) => !!item.phone).length;

    return {
      total: companies.length,
      active,
      inactive,
      withBillingEmail,
      withPhone,
    };
  }, [companies]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCompany.name.trim()) {
      setErrorMessage('Company name is required.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.from('companies').insert({
      name: newCompany.name.trim(),
      billing_contact_name: newCompany.billingContactName || null,
      billing_email: newCompany.billingEmail || null,
      phone: newCompany.phone || null,
      notes: newCompany.notes || null,
      is_active: true,
    });

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    setNewCompany({
      name: '',
      billingContactName: '',
      billingEmail: '',
      phone: '',
      notes: '',
    });

    setMessage(`Company ${newCompany.name.trim()} created successfully.`);
    setSubmitting(false);
    await loadCompanies();
  };

  const handleSaveCompany = async (companyId: string) => {
    const draft = drafts[companyId];
    if (!draft?.name.trim()) {
      setErrorMessage('Company name cannot be empty.');
      return;
    }

    setSavingCompanyId(companyId);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('companies')
      .update({
        name: draft.name.trim(),
        billing_contact_name: draft.billingContactName || null,
        billing_email: draft.billingEmail || null,
        phone: draft.phone || null,
        notes: draft.notes || null,
      })
      .eq('id', companyId);

    if (error) {
      setErrorMessage(error.message);
      setSavingCompanyId(null);
      return;
    }

    setMessage(`Company ${draft.name.trim()} saved successfully.`);
    setSavingCompanyId(null);
    await loadCompanies();
  };

  const handleToggleCompany = async (row: CompanyRow) => {
    setTogglingCompanyId(row.id);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase
      .from('companies')
      .update({
        is_active: !row.is_active,
      })
      .eq('id', row.id);

    if (error) {
      setErrorMessage(error.message);
      setTogglingCompanyId(null);
      return;
    }

    setMessage(
      `Company ${row.name} ${row.is_active ? 'deactivated' : 'activated'} successfully.`
    );
    setTogglingCompanyId(null);
    await loadCompanies();
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
          <Typography color="text.secondary">Loading companies admin...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Company Management"
      subtitle="Create, update, and manage active partner companies"
      navItems={adminNavItems}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Companies
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
              {stats.active}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Inactive
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.inactive}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              With Billing Email
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.withBillingEmail}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              With phone: {stats.withPhone}
            </Typography>
          </StatCard>
        </StatsGrid>

        <PageGrid>
          <SectionCard>
            <Typography variant="h5" fontWeight={800}>
              Create New Company
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add a new partner company with billing and contact details.
            </Typography>

            <FormGrid onSubmit={handleCreateCompany}>
              <StyledTextField
                label="Company Name"
                value={newCompany.name}
                onChange={(e) =>
                  setNewCompany((prev) => ({ ...prev, name: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="Billing Contact Name"
                value={newCompany.billingContactName}
                onChange={(e) =>
                  setNewCompany((prev) => ({
                    ...prev,
                    billingContactName: e.target.value,
                  }))
                }
                fullWidth
              />

              <StyledTextField
                label="Billing Email"
                value={newCompany.billingEmail}
                onChange={(e) =>
                  setNewCompany((prev) => ({
                    ...prev,
                    billingEmail: e.target.value,
                  }))
                }
                fullWidth
              />

              <StyledTextField
                label="Phone"
                value={newCompany.phone}
                onChange={(e) =>
                  setNewCompany((prev) => ({ ...prev, phone: e.target.value }))
                }
                fullWidth
              />

              <StyledTextField
                label="Notes"
                value={newCompany.notes}
                onChange={(e) =>
                  setNewCompany((prev) => ({ ...prev, notes: e.target.value }))
                }
                multiline
                minRows={4}
                fullWidth
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
                  'Create Company'
                )}
              </Button>
            </FormGrid>
          </SectionCard>

          <SectionCard>
            <Typography variant="h5" fontWeight={800}>
              Existing Companies
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Update company profile data or activate and deactivate partner records.
            </Typography>

            {companies.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" fontWeight={700}>
                  No companies found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Create your first company to begin onboarding users and addresses.
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap>
                {companies.map((row) => (
                  <CompanyCard key={row.id}>
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
                          {row.billing_email || 'No billing email'}
                        </Typography>
                      </Box>

                      <StatusChip status={row.is_active ? 'ACTIVE' : 'SUSPENDED'} />
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Billing Contact
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {row.billing_contact_name || '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Phone
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {row.phone || '—'}
                        </Typography>
                      </Box>

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
                          Notes
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {row.notes || '—'}
                        </Typography>
                      </Box>
                    </MetaGrid>

                    <ActionsGrid>
                      <StyledTextField
                        label="Company Name"
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
                        label="Billing Contact Name"
                        value={drafts[row.id]?.billingContactName || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              billingContactName: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      />

                      <StyledTextField
                        label="Billing Email"
                        value={drafts[row.id]?.billingEmail || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              billingEmail: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      />

                      <StyledTextField
                        label="Phone"
                        value={drafts[row.id]?.phone || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              phone: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                      />
                    </ActionsGrid>

                    <Box sx={{ mt: 1.5 }}>
                      <StyledTextField
                        label="Notes"
                        value={drafts[row.id]?.notes || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              notes: e.target.value,
                            },
                          }))
                        }
                        multiline
                        minRows={3}
                        fullWidth
                      />
                    </Box>

                    <ButtonRow>
                      <Button
                        variant="contained"
                        onClick={() => handleSaveCompany(row.id)}
                        disabled={savingCompanyId === row.id}
                        sx={{
                          minHeight: 48,
                          borderRadius: 4,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {savingCompanyId === row.id ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          'Save Company'
                        )}
                      </Button>

                      <Button
                        variant={row.is_active ? 'outlined' : 'contained'}
                        color={row.is_active ? 'warning' : 'success'}
                        onClick={() => handleToggleCompany(row)}
                        disabled={togglingCompanyId === row.id}
                        sx={{
                          minHeight: 48,
                          borderRadius: 4,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {togglingCompanyId === row.id ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : row.is_active ? (
                          'Deactivate'
                        ) : (
                          'Activate'
                        )}
                      </Button>
                    </ButtonRow>
                  </CompanyCard>
                ))}
              </ListWrap>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}