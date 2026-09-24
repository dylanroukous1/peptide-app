'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  FormControlLabel,
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
  addresses: AddressRow[];
};

type AddressRow = {
  id: string;
  label: string | null;
  recipient_name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};
type AddressDraft = {
  label: string;
  recipient_name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};
const emptyAddress = (): AddressDraft => ({ label: 'Primary', recipient_name: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'USA', is_default: true });
const addressDraft = (address: AddressRow): AddressDraft => ({ label: address.label || '', recipient_name: address.recipient_name || '', line1: address.line1, line2: address.line2 || '', city: address.city, state: address.state, postal_code: address.postal_code, country: address.country, is_default: address.is_default });

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
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [togglingCompanyId, setTogglingCompanyId] = useState<string | null>(null);
  const [savingAddressId, setSavingAddressId] = useState<string | null>(null);
  const [showCreateAddress, setShowCreateAddress] = useState(false);
  const [createAddress, setCreateAddress] = useState<AddressDraft>(emptyAddress);
  const [newAddressCompanyId, setNewAddressCompanyId] = useState<string | null>(null);
  const [newAddressDrafts, setNewAddressDrafts] = useState<Record<string, AddressDraft>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<string, AddressDraft>>({});
  const [search, setSearch] = useSessionStorageState('admin-company-search', '');
  const { toast, showToast, closeToast } = useAppToast();

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
    if (showCreateAddress && Object.entries(createAddress).some(([key, value]) =>
      key === 'is_default' ? value !== true : String(value).trim() !== String(emptyAddress()[key as keyof AddressDraft]).trim()
    )) return true;
    if (newAddressCompanyId) return true;

    return companies.some((company) => {
      const draft = drafts[company.id];
      if (!draft) return false;
      const companyChanged = (
        draft.name !== company.name ||
        draft.billingContactName !== (company.billing_contact_name || '') ||
        draft.billingEmail !== (company.billing_email || '') ||
        draft.phone !== (company.phone || '') ||
        draft.notes !== (company.notes || '')
      );
      const addressChanged = company.addresses.some((address) => {
        const next = addressDrafts[address.id];
        return next ? JSON.stringify(next) !== JSON.stringify(addressDraft(address)) : false;
      });
      return companyChanged || addressChanged;
    });
  }, [addressDrafts, companies, createAddress, drafts, newAddressCompanyId, newCompany, showCreateAddress]);

  useUnsavedChanges(hasUnsavedChanges);

  const loadCompanies = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('companies')
      .select('id, name, billing_contact_name, billing_email, phone, notes, is_active, created_at, addresses:company_addresses(id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default)')
      .order('name', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as CompanyRow[];
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
    setAddressDrafts(Object.fromEntries(rows.flatMap((row) => row.addresses.map((address) => [address.id, addressDraft(address)]))));
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

    if (showCreateAddress && [createAddress.line1, createAddress.city, createAddress.state, createAddress.postal_code, createAddress.country].some((value) => !value.trim())) {
      setErrorMessage('Complete all required primary shipping address fields.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const { data: companyId, error } = await supabase.rpc('admin_create_company', {
      p_name: newCompany.name.trim(),
      p_billing_contact_name: newCompany.billingContactName.trim() || null,
      p_billing_email: newCompany.billingEmail.trim().toLowerCase() || null,
      p_phone: newCompany.phone.trim() || null,
      p_notes: newCompany.notes.trim() || null,
      p_address: showCreateAddress ? createAddress : null,
    });

    if (error) {
      showToast(error.message, 'error');
      setSubmitting(false);
      return;
    }

    const { data: created, error: reloadError } = await supabase
      .from('companies')
      .select('id, name, billing_contact_name, billing_email, phone, notes, is_active, created_at, addresses:company_addresses(id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default)')
      .eq('id', companyId)
      .single();
    if (reloadError) {
      showToast('Company was created, but its details could not be refreshed.', 'warning');
      setSubmitting(false);
      return;
    }
    const createdCompany = created as CompanyRow;
    setCompanies((current) => [...current, createdCompany].sort((a, b) => a.name.localeCompare(b.name)));
    setDrafts((current) => ({ ...current, [createdCompany.id]: { name: createdCompany.name, billingContactName: createdCompany.billing_contact_name || '', billingEmail: createdCompany.billing_email || '', phone: createdCompany.phone || '', notes: createdCompany.notes || '' } }));
    setAddressDrafts((current) => ({ ...current, ...Object.fromEntries(createdCompany.addresses.map((address) => [address.id, addressDraft(address)])) }));
    setNewCompany({
      name: '',
      billingContactName: '',
      billingEmail: '',
      phone: '',
      notes: '',
    });
    setShowCreateAddress(false);
    setCreateAddress(emptyAddress());

    showToast(`Company ${newCompany.name.trim()} created successfully.`);
    setSubmitting(false);
  };

  const saveCompanyAddress = async (company: CompanyRow, addressId: string | null) => {
    if (savingAddressId) return;
    const draft = addressId ? addressDrafts[addressId] : newAddressDrafts[company.id];
    if (!draft || [draft.line1, draft.city, draft.state, draft.postal_code, draft.country].some((value) => !value.trim())) {
      showToast('Complete all required shipping address fields.', 'error');
      return;
    }
    setSavingAddressId(addressId || `new-${company.id}`);
    const { data, error } = await supabase.rpc('admin_upsert_company_address', {
      p_company_id: company.id,
      p_address_id: addressId,
      p_address: draft,
    });
    setSavingAddressId(null);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    const saved = data as AddressRow;
    setCompanies((current) => current.map((row) => row.id !== company.id ? row : {
      ...row,
      addresses: addressId
        ? row.addresses.map((address) => address.id === saved.id ? saved : { ...address, is_default: saved.is_default ? false : address.is_default })
        : [...row.addresses.map((address) => ({ ...address, is_default: saved.is_default ? false : address.is_default })), saved],
    }));
    setAddressDrafts((current) => ({
      ...current,
      ...(saved.is_default ? Object.fromEntries(company.addresses.map((address) => [address.id, { ...(current[address.id] || addressDraft(address)), is_default: false }])) : {}),
      [saved.id]: addressDraft(saved),
    }));
    if (!addressId) {
      setNewAddressCompanyId(null);
      setNewAddressDrafts((current) => ({ ...current, [company.id]: emptyAddress() }));
    }
    showToast(`${addressId ? 'Shipping address updated' : 'Shipping address added'} for ${company.name}.`);
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
      showToast(error.message, 'error');
      setSavingCompanyId(null);
      return;
    }

    showToast(`Company ${draft.name.trim()} saved successfully.`);
    setCompanies((current) =>
      current
        .map((company) => (company.id === companyId ? { ...data, addresses: company.addresses } : company))
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
      showToast(error.message, 'error');
      setTogglingCompanyId(null);
      return;
    }

    showToast(
      `Company ${row.name} ${row.is_active ? 'deactivated' : 'activated'} successfully.`
    );
    setCompanies((current) =>
      current.map((company) => (company.id === row.id ? { ...data, addresses: company.addresses } : company))
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

              <Button type="button" variant="outlined" onClick={() => setShowCreateAddress((open) => !open)} aria-expanded={showCreateAddress}>
                {showCreateAddress ? 'Remove shipping address' : 'Add shipping address'}
              </Button>
              <Collapse in={showCreateAddress}>
                <Box sx={{ display: 'grid', gap: 1.5, p: 2, border: '1px solid #E2E8F0', borderRadius: 2, backgroundColor: '#F8FAFC' }}>
                  <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 800 }}>Primary Shipping Address</Typography>
                  <StyledTextField label="Address label" value={createAddress.label} onChange={(event) => setCreateAddress((current) => ({ ...current, label: event.target.value }))} />
                  <StyledTextField label="Recipient name" value={createAddress.recipient_name} onChange={(event) => setCreateAddress((current) => ({ ...current, recipient_name: event.target.value }))} />
                  <StyledTextField label="Address line 1" required value={createAddress.line1} onChange={(event) => setCreateAddress((current) => ({ ...current, line1: event.target.value }))} />
                  <StyledTextField label="Address line 2" value={createAddress.line2} onChange={(event) => setCreateAddress((current) => ({ ...current, line2: event.target.value }))} />
                  <StyledTextField label="City" required value={createAddress.city} onChange={(event) => setCreateAddress((current) => ({ ...current, city: event.target.value }))} />
                  <StyledTextField label="State" required value={createAddress.state} onChange={(event) => setCreateAddress((current) => ({ ...current, state: event.target.value }))} />
                  <StyledTextField label="Postal code" required value={createAddress.postal_code} onChange={(event) => setCreateAddress((current) => ({ ...current, postal_code: event.target.value }))} />
                  <StyledTextField label="Country" required value={createAddress.country} onChange={(event) => setCreateAddress((current) => ({ ...current, country: event.target.value }))} />
                  <FormControlLabel control={<Checkbox checked={createAddress.is_default} onChange={(event) => setCreateAddress((current) => ({ ...current, is_default: event.target.checked }))} />} label="Set as default shipping address" />
                </Box>
              </Collapse>

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
              Existing Companies
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
              <ScrollableResults
                containerComponent={ListWrap}
                count={filteredCompanies.length}
                label="Company records"
                singularLabel="company"
                pluralLabel="companies"
              >
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

                    <Box component="details" sx={{ mt: 2 }}>
                      <Typography component="summary" variant="body2" sx={{ fontWeight: 800, cursor: 'pointer' }}>
                        Shipping addresses ({row.addresses.length})
                      </Typography>
                      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                        {row.addresses.length === 0 ? <Typography variant="body2" color="text.secondary">No shipping addresses saved.</Typography> : null}
                        {row.addresses.map((address) => {
                          const draft = addressDrafts[address.id] || addressDraft(address);
                          const update = (field: keyof AddressDraft, value: string | boolean) => setAddressDrafts((current) => ({ ...current, [address.id]: { ...(current[address.id] || addressDraft(address)), [field]: value } }));
                          return (
                            <Box key={address.id} sx={{ display: 'grid', gap: 1.25, p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2 }}>
                              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography component="h4" variant="subtitle2" sx={{ fontWeight: 800 }}>{draft.label || 'Shipping address'}</Typography>{address.is_default ? <StatusChip status="DEFAULT" /> : null}</Stack>
                              <ActionsGrid sx={{ mt: 0 }}>
                                <StyledTextField label="Address label" value={draft.label} onChange={(event) => update('label', event.target.value)} />
                                <StyledTextField label="Recipient name" value={draft.recipient_name} onChange={(event) => update('recipient_name', event.target.value)} />
                                <StyledTextField label="Address line 1" required value={draft.line1} onChange={(event) => update('line1', event.target.value)} />
                                <StyledTextField label="Address line 2" value={draft.line2} onChange={(event) => update('line2', event.target.value)} />
                                <StyledTextField label="City" required value={draft.city} onChange={(event) => update('city', event.target.value)} />
                                <StyledTextField label="State" required value={draft.state} onChange={(event) => update('state', event.target.value)} />
                                <StyledTextField label="Postal code" required value={draft.postal_code} onChange={(event) => update('postal_code', event.target.value)} />
                                <StyledTextField label="Country" required value={draft.country} onChange={(event) => update('country', event.target.value)} />
                              </ActionsGrid>
                              <FormControlLabel control={<Checkbox checked={draft.is_default} disabled={address.is_default} onChange={(event) => update('is_default', event.target.checked)} />} label={address.is_default ? 'Default shipping address' : 'Set as default shipping address'} />
                              <Button variant="outlined" onClick={() => void saveCompanyAddress(row, address.id)} disabled={savingAddressId === address.id}>{savingAddressId === address.id ? <CircularProgress size={18} /> : 'Save address'}</Button>
                            </Box>
                          );
                        })}
                        {newAddressCompanyId === row.id ? (() => {
                          const draft = newAddressDrafts[row.id] || emptyAddress();
                          const update = (field: keyof AddressDraft, value: string | boolean) => setNewAddressDrafts((current) => ({ ...current, [row.id]: { ...(current[row.id] || emptyAddress()), [field]: value } }));
                          return <Box sx={{ display: 'grid', gap: 1.25, p: 1.5, border: '1px solid #CBD5E1', borderRadius: 2, backgroundColor: '#F8FAFC' }}>
                            <Typography component="h4" variant="subtitle2" sx={{ fontWeight: 800 }}>Add shipping address</Typography>
                            <ActionsGrid sx={{ mt: 0 }}>
                              <StyledTextField label="Address label" value={draft.label} onChange={(event) => update('label', event.target.value)} />
                              <StyledTextField label="Recipient name" value={draft.recipient_name} onChange={(event) => update('recipient_name', event.target.value)} />
                              <StyledTextField label="Address line 1" required value={draft.line1} onChange={(event) => update('line1', event.target.value)} />
                              <StyledTextField label="Address line 2" value={draft.line2} onChange={(event) => update('line2', event.target.value)} />
                              <StyledTextField label="City" required value={draft.city} onChange={(event) => update('city', event.target.value)} />
                              <StyledTextField label="State" required value={draft.state} onChange={(event) => update('state', event.target.value)} />
                              <StyledTextField label="Postal code" required value={draft.postal_code} onChange={(event) => update('postal_code', event.target.value)} />
                              <StyledTextField label="Country" required value={draft.country} onChange={(event) => update('country', event.target.value)} />
                            </ActionsGrid>
                            <FormControlLabel control={<Checkbox checked={draft.is_default} onChange={(event) => update('is_default', event.target.checked)} />} label="Set as default shipping address" />
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button variant="contained" onClick={() => void saveCompanyAddress(row, null)} disabled={savingAddressId === `new-${row.id}`}>{savingAddressId === `new-${row.id}` ? <CircularProgress size={18} color="inherit" /> : 'Add address'}</Button><Button onClick={() => setNewAddressCompanyId(null)}>Cancel</Button></Stack>
                          </Box>;
                        })() : <Button variant="outlined" onClick={() => { setNewAddressCompanyId(row.id); setNewAddressDrafts((current) => ({ ...current, [row.id]: { ...emptyAddress(), is_default: row.addresses.length === 0 } })); }}>Add another address</Button>}
                      </Stack>
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
              </ScrollableResults>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
      <AppSnackbar {...toast} onClose={closeToast} />
    </AppShell>
  );
}
