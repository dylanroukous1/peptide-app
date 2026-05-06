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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'ALL',
  });
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});

  const loadUsers = async () => {
    setLoading(true);
    setErrorMessage('');

    const [
      { data: profileData, error: profileError },
      { data: companyData, error: companyError },
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
    ]);

    if (profileError || companyError) {
      setErrorMessage(
        profileError?.message || companyError?.message || 'Failed to load users.'
      );
      setLoading(false);
      return;
    }

    const normalizedProfiles: ProfileRow[] = (profileData || []).map((row: any) => ({
      ...row,
      company: Array.isArray(row.company) ? row.company[0] : row.company,
    }));

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
      const matchesStatus =
        filters.status === 'ALL' || user.account_status === filters.status;

      const haystack = [
        user.email || '',
        user.first_name || '',
        user.last_name || '',
        user.role || '',
        user.company?.name || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = haystack.includes(filters.search.toLowerCase());

      return matchesStatus && matchesSearch;
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

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id);

    if (error) {
      setErrorMessage(error.message);
      setSavingUserId(null);
      return;
    }

    setMessage(`User ${user.email || user.id} saved successfully.`);
    setSavingUserId(null);
    await loadUsers();
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
    <AppShell
      title="User Management"
      subtitle="Activate users, assign companies, and manage roles"
      navItems={adminNavItems}
    >
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
            Existing Signed-Up Users
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Users sign up first. Then an admin activates them and assigns a company if they are normal users.
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
              • New signups usually start as <strong>PENDING</strong> and must be set to <strong>ACTIVE</strong>.
            </Typography>
          </HelperBox>

          <FiltersGrid>
            <StyledTextField
              label="Search"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              fullWidth
            />

            <StyledTextField
              select
              label="Status"
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              fullWidth
            >
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
                Adjust filters or sign up a new user first.
              </Typography>
            </EmptyWrap>
          ) : (
            <ListWrap>
              {filteredUsers.map((user) => {
                const draft = drafts[user.id];

                return (
                  <UserCard key={user.id}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          {user.first_name} {user.last_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {user.email || user.id}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
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
                              company_id:
                                e.target.value === 'ADMIN' ? '' : prev[user.id]?.company_id || '',
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
                        {savingUserId === user.id ? (
                          <CircularProgress size={18} color="inherit" />
                        ) : (
                          'Save User'
                        )}
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
