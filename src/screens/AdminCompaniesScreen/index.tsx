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
import { adminNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import { useUnsavedChanges } from '@/src/hooks/useUnsavedChanges';
import { useSessionStorageState } from '@/src/hooks/useSessionStorageState';
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

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
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
  const [search, setSearch] = useSessionStorageState('admin-company-search', '');

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

  const hasUnsavedChanges = useMemo(() => {
    if (Object.values(newCompany).some((value) => value.trim())) return true;

    return companies.some((company) => {
      const draft = drafts[company.id];
      if (!draft) return false;
      return (
        draft.name !== company.name ||
        draft.billingContactName !== (company.billing_contact_name || '') ||
        draft.billingEmail !== (company.billing_email || '') ||
        draft.phone !== (company.phone || '') ||
        draft.notes !== (company.notes || '')
      );
    });
  }, [companies, drafts, newCompany]);

  useUnsavedChanges(hasUnsavedChanges);

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

    const timer = window.setTimeout(() => void loadCompanies(), 0);
    return () => window.clearTimeout(timer);
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

  const filteredCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((company) =>
      [company.name, company.billing_contact_name || '', company.billing_email || '', company.phone || '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [companies, search]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCompany.name.trim()) {
      setErrorMessage('Company name is required.');
      return;
    }

    if (
      newCompany.billingEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCompany.billingEmail.trim())
    ) {
      setErrorMessage('Enter a valid billing email address.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('companies')
      .insert({
        name: newCompany.name.trim(),
        billing_contact_name: newCompany.billingContactName.trim() || null,
        billing_email: newCompany.billingEmail.trim().toLowerCase() || null,
        phone: newCompany.phone.trim() || null,
        notes: newCompany.notes.trim() || null,
        is_active: true,
      })
      .select('id, name, billing_contact_name, billing_email, phone, notes, is_active, created_at')
      .single();

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    setCompanies((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
    setDrafts((current) => ({
      ...current,
      [data.id]: {
        name: data.name,
        billingContactName: data.billing_contact_name || '',
        billingEmail: data.billing_email || '',
        phone: data.phone || '',
        notes: data.notes || '',
      },
    }));
    setNewCompany({
      name: '',
      billingContactName: '',
      billingEmail: '',
      phone: '',
      notes: '',
    });

    setMessage(`Company ${newCompany.name.trim()} created successfully.`);
    setSubmitting(false);
  };

  const handleSaveCompany = async (companyId: string) => {
    const draft = drafts[companyId];
    if (!draft?.name.trim()) {
      setErrorMessage('Company name cannot be empty.');
      return;
    }


    if (
      draft.billingEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.billingEmail.trim())
    ) {
      setErrorMessage('Enter a valid billing email address.');
      return;
    }

    setSavingCompanyId(companyId);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('companies')
      .update({
        name: draft.name.trim(),
        billing_contact_name: draft.billingContactName.trim() || null,
        billing_email: draft.billingEmail.trim().toLowerCase() || null,
        phone: draft.phone.trim() || null,
        notes: draft.notes.trim() || null,
      })
      .eq('id', companyId)
      .select('id, name, billing_contact_name, billing_email, phone, notes, is_active, created_at')
      .single();

    if (error) {
      setErrorMessage(error.message);
      setSavingCompanyId(null);
      return;
    }

    setMessage(`Company ${draft.name.trim()} saved successfully.`);
    setCompanies((current) =>
      current
        .map((company) => (company.id === companyId ? data : company))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setDrafts((current) => ({
      ...current,
      [companyId]: {
        name: data.name,
        billingContactName: data.billing_contact_name || '',
        billingEmail: data.billing_email || '',
        phone: data.phone || '',
        notes: data.notes || '',
      },
    }));
    setSavingCompanyId(null);
  };

  const handleToggleCompany = async (row: CompanyRow) => {
    if (
      row.is_active &&
      !window.confirm(
        `Deactivate ${row.name}? Existing records remain intact, but the company will be marked inactive.`
      )
    ) {
      return;
    }

    setTogglingCompanyId(row.id);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('companies')
      .update({
        is_active: !row.is_active,
      })
      .eq('id', row.id)
      .select('id, name, billing_contact_name, billing_email, phone, notes, is_active, created_at')
      .single();

    if (error) {
      setErrorMessage(error.message);
      setTogglingCompanyId(null);
      return;
    }

    setMessage(
      `Company ${row.name} ${row.is_active ? 'deactivated' : 'activated'} successfully.`
    );
    setCompanies((current) =>
      current.map((company) => (company.id === row.id ? data : company))
    );
    setTogglingCompanyId(null);
  };

  if (sessionLoading || loading) {
    return <PageSkeleton label="Loading companies" />;
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Company Management"
      subtitle="Create, update, and manage active partner companies"
      navItems={adminNavigation}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => void loadCompanies()}>Retry</Button>}>
            {errorMessage}
          </Alert>
        ) : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Companies
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
              {stats.active}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Inactive
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.inactive}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              With Billing Email
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.withBillingEmail}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              With phone: {stats.withPhone}
            </Typography>
          </StatCard>
        </StatsGrid>

        <PageGrid>
          <SectionCard>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
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
                type="email"
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
            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              Existing Companies · {filteredCompanies.length} {filteredCompanies.length === 1 ? 'company' : 'companies'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Update company profile data or activate and deactivate partner records.
            </Typography>

            <StyledTextField
              label="Search companies"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
              sx={{ mt: 2 }}
            />

            {filteredCompanies.length === 0 ? (
              <EmptyWrap>
                <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
                  {companies.length === 0 ? 'No companies found' : 'No matching companies'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {companies.length === 0
                    ? 'Create your first company to begin onboarding users and addresses.'
                    : 'Try a different company, contact, email, or phone.'}
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap className="record-results">
                {filteredCompanies.map((row) => (
                  <CompanyCard key={row.id}>
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
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.billing_contact_name || '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Phone
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.phone || '—'}
                        </Typography>
                      </Box>

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
                          Notes
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
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
                        type="email"
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
