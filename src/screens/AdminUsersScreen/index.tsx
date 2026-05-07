'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import {
  EditGrid,
  EmptyWrap,
  FiltersGrid,
  HelperBox,
  ListWrap,
  MetaGrid,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
  UserCard,
} from './styles';

type CompanyRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role: 'ADMIN' | 'USER';
  account_status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  company_id: string | null;
  created_at?: string;
  company?: CompanyRow | null;
};

type AccountRequestRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string | null;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
};

type CreateDraftState = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: 'ADMIN' | 'USER';
  companyId: string;
  accountStatus: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
};

type UserDraft = {
  role: 'ADMIN' | 'USER';
  account_status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  company_id: string;
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

export default function AdminUsersScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [requests, setRequests] = useState<AccountRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'ALL',
  });
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [createDraft, setCreateDraft] = useState<CreateDraftState>({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    role: 'USER' as 'ADMIN' | 'USER',
    companyId: '',
    accountStatus: 'ACTIVE' as 'ACTIVE' | 'PENDING' | 'SUSPENDED',
  });

  const loadUsers = async () => {
    setLoading(true);
    setErrorMessage('');

    const [
      { data: profileData, error: profileError },
      { data: companyData, error: companyError },
      { data: requestData, error: requestError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select(`
          id,
          email,
          first_name,
          last_name,
          role,
          account_status,
          company_id,
          created_at,
          company:companies(id, name)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('account_requests')
        .select('id, first_name, last_name, email, company_name, notes, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (profileError || companyError || requestError) {
      setErrorMessage(
        profileError?.message ||
          companyError?.message ||
          requestError?.message ||
          'Failed to load users.'
      );
      setLoading(false);
      return;
    }

    const normalizedProfiles: ProfileRow[] = (profileData || []).map((row: any) => ({
      ...row,
      company: Array.isArray(row.company) ? row.company[0] : row.company,
    }));

    const profileEmails = new Set(
      normalizedProfiles
        .map((row) => row.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email))
    );
    const normalizedRequests: AccountRequestRow[] = ((requestData || []) as AccountRequestRow[]).filter(
      (request) => !profileEmails.has(request.email.trim().toLowerCase())
    );

    const initialDrafts: Record<string, UserDraft> = {};
    normalizedProfiles.forEach((row) => {
      initialDrafts[row.id] = {
        role: row.role,
        account_status: row.account_status,
        company_id: row.company_id || '',
      };
    });

    setUsers(normalizedProfiles);
    setCompanies(companyData || []);
    setRequests(normalizedRequests);
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

    loadUsers();
  }, [profile, router, sessionLoading]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesStatus = filters.status === 'ALL' || user.account_status === filters.status;

      const haystack = [user.email || '', user.first_name || '', user.last_name || '', user.role || '', user.company?.name || '']
        .join(' ')
        .toLowerCase();

      return matchesStatus && haystack.includes(filters.search.toLowerCase());
    });
  }, [filters.search, filters.status, users]);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.account_status === 'ACTIVE').length;
    const pending = users.filter((user) => user.account_status === 'PENDING').length;
    const suspended = users.filter((user) => user.account_status === 'SUSPENDED').length;
    const admins = users.filter((user) => user.role === 'ADMIN').length;

    return {
      total: users.length,
      active,
      pending,
      suspended,
      admins,
    };
  }, [users]);

  const handleSaveUser = async (user: ProfileRow) => {
    const draft = drafts[user.id];
    if (!draft) return;

    if (draft.role === 'USER' && !draft.company_id) {
      setErrorMessage('A USER must be assigned to a company before saving.');
      return;
    }

    setSavingUserId(user.id);
    setMessage('');
    setErrorMessage('');

    const payload = {
      role: draft.role,
      account_status: draft.account_status,
      company_id: draft.role === 'ADMIN' ? null : draft.company_id || null,
    };

    const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingUserId(null);
      return;
    }

    setMessage(`User ${user.email || user.id} saved successfully.`);
    setSavingUserId(null);
    await loadUsers();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = createDraft.email.trim();
    const firstName = createDraft.firstName.trim();
    const lastName = createDraft.lastName.trim();
    const password = createDraft.password.trim();
    const role = createDraft.role;
    const companyId = createDraft.companyId.trim();
    const accountStatus = createDraft.accountStatus;

    if (!email || !firstName || !lastName) {
      setErrorMessage('Email, first name, and last name are required.');
      return;
    }

    if (role === 'USER' && !companyId) {
      setErrorMessage('USER accounts require a company.');
      return;
    }

    setCreatingUser(true);
    setMessage('');
    setErrorMessage('');

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setErrorMessage('Your session expired. Please log in again.');
      setToastSeverity('error');
      setToastMessage('Your session expired. Please log in again.');
      setToastOpen(true);
      setCreatingUser(false);
      return;
    }

    const response = await fetch('/api/admin/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        password,
        role,
        companyId,
        accountStatus,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setErrorMessage(payload.error || 'Failed to create user.');
      setToastSeverity('error');
      setToastMessage(payload.error || 'Failed to create user.');
      setToastOpen(true);
      setCreatingUser(false);
      return;
    }

    const finalPassword = payload.password || payload.generatedPassword;
    const successMessage = finalPassword
      ? `User created successfully. Share this email and password with the user: ${payload.email} / ${finalPassword}`
      : `User created successfully. Share this email with the user: ${payload.email}`;

    setMessage(successMessage);
    setToastSeverity('success');
    setToastMessage(successMessage);
    setToastOpen(true);
    setCreateDraft({
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      role: 'USER',
      companyId: '',
      accountStatus: 'ACTIVE',
    });
    setCreatingUser(false);
    await loadUsers();
  };

  const useRequestForCreate = (request: AccountRequestRow) => {
    const matchedCompanyId =
      companies.find(
        (company) =>
          company.name.trim().toLowerCase() === request.company_name?.trim().toLowerCase()
      )?.id || '';

    setCreateDraft((prev) => ({
      ...prev,
      email: request.email,
      firstName: request.first_name,
      lastName: request.last_name,
      companyId: matchedCompanyId,
      accountStatus: 'PENDING',
    }));
    setMessage(
      `Prefilled create form from request by ${request.first_name} ${request.last_name}.`
    );
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
          <Typography color="text.secondary">Loading users admin...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell title="User Management" subtitle="Create accounts, manage roles, and assign companies" navItems={adminNavItems}>
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Users
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.total}
            </Typography>
          </StatCard>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Active
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.active}
            </Typography>
          </StatCard>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Pending
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.pending}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Suspended: {stats.suspended}
            </Typography>
          </StatCard>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Admin Accounts
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.admins}
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Access Requests
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Public account requests submitted through the login page.
          </Typography>

          {requests.length === 0 ? (
            <EmptyWrap>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No access requests yet
              </Typography>
            </EmptyWrap>
          ) : (
            <ListWrap>
              {requests.map((request) => (
                <UserCard key={request.id}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
                    spacing={1.5}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {request.first_name} {request.last_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {request.email}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Company: {request.company_name || '—'}
                      </Typography>
                    </Box>
                    <StatusChip status={request.status} />
                  </Stack>

                  <MetaGrid>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Company
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {request.company_name || '—'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        First Name
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {request.first_name}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Last Name
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {request.last_name}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Submitted
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatDate(request.created_at)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Request ID
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {request.id}
                      </Typography>
                    </Box>
                    <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}>
                      <Typography variant="caption" color="text.secondary">
                        Notes
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {request.notes || '—'}
                      </Typography>
                    </Box>
                  </MetaGrid>

                  <Stack direction="row" spacing={1.5} sx={{ mt: 2, flexWrap: 'wrap' }}>
                    <Button
                      variant="outlined"
                      onClick={() => useRequestForCreate(request)}
                      sx={{ textTransform: 'none', fontWeight: 700 }}
                    >
                      Use for create form
                    </Button>
                  </Stack>
                </UserCard>
              ))}
            </ListWrap>
          )}
        </SectionCard>

        <SectionCard>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Create New User
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            This creates the Supabase Auth user and the matching profile row. Fill this form manually, or click
            "Use for create form" on a request above to prefill it.
          </Typography>

          <EditGrid sx={{ gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr 1fr' } }}>
            <StyledTextField
              label="Email"
              type="email"
              value={createDraft.email}
              onChange={(e) =>
                setCreateDraft((prev) => ({ ...prev, email: e.target.value }))
              }
              fullWidth
              required
            />
            <StyledTextField
              label="First Name"
              value={createDraft.firstName}
              onChange={(e) =>
                setCreateDraft((prev) => ({ ...prev, firstName: e.target.value }))
              }
              fullWidth
              required
            />
            <StyledTextField
              label="Last Name"
              value={createDraft.lastName}
              onChange={(e) =>
                setCreateDraft((prev) => ({ ...prev, lastName: e.target.value }))
              }
              fullWidth
              required
            />
            <StyledTextField
              label="Password"
              type="password"
              value={createDraft.password}
              onChange={(e) =>
                setCreateDraft((prev) => ({ ...prev, password: e.target.value }))
              }
              fullWidth
              helperText="Optional. Leave blank to generate a temporary password."
            />
            <StyledTextField
              select
              label="Role"
              value={createDraft.role}
              onChange={(e) =>
                setCreateDraft((prev) => ({
                  ...prev,
                  role: e.target.value as 'ADMIN' | 'USER',
                  companyId: e.target.value === 'ADMIN' ? '' : prev.companyId,
                }))
              }
              fullWidth
            >
              <MenuItem value="USER">USER</MenuItem>
              <MenuItem value="ADMIN">ADMIN</MenuItem>
            </StyledTextField>
            <StyledTextField
              select
              label="Account Status"
              value={createDraft.accountStatus}
              onChange={(e) =>
                setCreateDraft((prev) => ({
                  ...prev,
                  accountStatus: e.target.value as 'ACTIVE' | 'PENDING' | 'SUSPENDED',
                }))
              }
              fullWidth
            >
              <MenuItem value="ACTIVE">ACTIVE</MenuItem>
              <MenuItem value="PENDING">PENDING</MenuItem>
              <MenuItem value="SUSPENDED">SUSPENDED</MenuItem>
            </StyledTextField>
            <StyledTextField
              select
              label="Company"
              value={createDraft.companyId}
              onChange={(e) =>
                setCreateDraft((prev) => ({ ...prev, companyId: e.target.value }))
              }
              fullWidth
              disabled={createDraft.role === 'ADMIN'}
            >
              <MenuItem value="">Select company</MenuItem>
              {companies.map((company) => (
                <MenuItem key={company.id} value={company.id}>
                  {company.name}
                </MenuItem>
              ))}
            </StyledTextField>
          </EditGrid>

          <Button
            type="button"
            variant="contained"
            size="large"
            disabled={creatingUser}
            onClick={handleCreateUser}
            sx={{
              mt: 2,
              minHeight: 52,
              borderRadius: 4,
              textTransform: 'none',
              fontWeight: 700,
            }}
            fullWidth
          >
            {creatingUser ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              'Create User'
            )}
          </Button>
        </SectionCard>

        <Snackbar
          open={toastOpen}
          autoHideDuration={6000}
          onClose={() => setToastOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={toastSeverity}
            onClose={() => setToastOpen(false)}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toastMessage}
          </Alert>
        </Snackbar>

        <SectionCard>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Existing Users
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Search, review company assignment, and update account status.
          </Typography>

          <HelperBox>
            <Typography variant="body2" color="text.secondary">
              Rules:
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              • <strong>USER</strong> accounts should have a company assigned.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • <strong>ADMIN</strong> accounts should not have a company assigned.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • New accounts can start as <strong>PENDING</strong> until reviewed.
            </Typography>
          </HelperBox>

          <FiltersGrid>
            <StyledTextField label="Search" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} fullWidth />
            <StyledTextField select label="Status" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} fullWidth>
              <MenuItem value="ALL">All Statuses</MenuItem>
              <MenuItem value="ACTIVE">ACTIVE</MenuItem>
              <MenuItem value="PENDING">PENDING</MenuItem>
              <MenuItem value="SUSPENDED">SUSPENDED</MenuItem>
            </StyledTextField>
          </FiltersGrid>

          {filteredUsers.length === 0 ? (
            <EmptyWrap>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No matching users found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Adjust filters or create a user.
              </Typography>
            </EmptyWrap>
          ) : (
            <ListWrap>
              {filteredUsers.map((user) => {
                const draft = drafts[user.id];

                return (
                  <UserCard key={user.id}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }} spacing={1.5}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          {user.first_name} {user.last_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {user.email || user.id}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                        <StatusChip status={user.role} label={user.role} />
                        <StatusChip status={user.account_status} />
                      </Stack>
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Company
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {user.company?.name || (user.role === 'ADMIN' ? '—' : 'Unassigned')}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Role
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {user.role}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Account Status
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {user.account_status}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Created
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatDate(user.created_at)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Profile ID
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {user.id}
                        </Typography>
                      </Box>
                    </MetaGrid>

                    <EditGrid>
                      <StyledTextField
                        select
                        label="Role"
                        value={draft?.role || user.role}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [user.id]: {
                              ...prev[user.id],
                              role: e.target.value as 'ADMIN' | 'USER',
                              company_id: e.target.value === 'ADMIN' ? '' : prev[user.id]?.company_id || '',
                            },
                          }))
                        }
                        fullWidth
                      >
                        <MenuItem value="USER">USER</MenuItem>
                        <MenuItem value="ADMIN">ADMIN</MenuItem>
                      </StyledTextField>

                      <StyledTextField
                        select
                        label="Account Status"
                        value={draft?.account_status || user.account_status}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [user.id]: {
                              ...prev[user.id],
                              account_status: e.target.value as 'PENDING' | 'ACTIVE' | 'SUSPENDED',
                            },
                          }))
                        }
                        fullWidth
                      >
                        <MenuItem value="PENDING">PENDING</MenuItem>
                        <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                        <MenuItem value="SUSPENDED">SUSPENDED</MenuItem>
                      </StyledTextField>

                      <StyledTextField
                        select
                        label="Company"
                        value={draft?.company_id || ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [user.id]: {
                              ...prev[user.id],
                              company_id: e.target.value,
                            },
                          }))
                        }
                        fullWidth
                        disabled={(draft?.role || user.role) === 'ADMIN'}
                      >
                        <MenuItem value="">Select company</MenuItem>
                        {companies.map((company) => (
                          <MenuItem key={company.id} value={company.id}>
                            {company.name}
                          </MenuItem>
                        ))}
                      </StyledTextField>

                      <Button
                        variant="contained"
                        onClick={() => handleSaveUser(user)}
                        disabled={savingUserId === user.id}
                        sx={{
                          minHeight: 56,
                          borderRadius: 4,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {savingUserId === user.id ? <CircularProgress size={18} color="inherit" /> : 'Save User'}
                      </Button>
                    </EditGrid>
                  </UserCard>
                );
              })}
            </ListWrap>
          )}
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
