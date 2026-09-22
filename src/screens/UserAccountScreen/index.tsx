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
import { userNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import {
  AddressCard,
  AddressList,
  EmptyWrap,
  FormGrid,
  FullWidthRow,
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

export default function UserAccountScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const [draft, setDraft] = useState({
    label: '',
    recipient_name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'USA',
  });

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

    const loadAccountPage = async () => {
      setLoading(true);
      setErrorMessage('');

      if (!profile.company_id) {
        setCompany(null);
        setAddresses([]);
        setLoading(false);
        return;
      }

      const [companyResult, addressResult] = await Promise.all([
        supabase
          .from('companies')
          .select('id, name, billing_contact_name, billing_email, phone, notes, is_active')
          .eq('id', profile.company_id)
          .single(),
        supabase
          .from('company_addresses')
          .select(
            'id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default'
          )
          .eq('company_id', profile.company_id)
          .order('is_default', { ascending: false }),
      ]);

      if (companyResult.error || addressResult.error) {
        setErrorMessage(
          companyResult.error?.message ||
            addressResult.error?.message ||
            'Unable to load account information.'
        );
        setLoading(false);
        return;
      }

      setCompany(companyResult.data);
      setAddresses(addressResult.data || []);
      setLoading(false);
    };

    loadAccountPage();
  }, [profile, retryKey, router, sessionLoading]);

  const stats = useMemo(() => {
    return {
      totalAddresses: addresses.length,
      defaultAddresses: addresses.filter((item) => item.is_default).length,
      companyActive: company?.is_active ? 'ACTIVE' : 'SUSPENDED',
    };
  }, [addresses, company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.company_id) {
      setErrorMessage('No company is linked to this account.');
      return;
    }

    if (
      !draft.line1.trim() ||
      !draft.city.trim() ||
      !draft.state.trim() ||
      !draft.postal_code.trim() ||
      !draft.country.trim()
    ) {
      setErrorMessage('Please fill in all required address fields.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase
      .from('company_addresses')
      .insert({
        company_id: profile.company_id,
        label: draft.label.trim() || null,
        recipient_name: draft.recipient_name.trim() || null,
        line1: draft.line1.trim(),
        line2: draft.line2.trim() || null,
        city: draft.city.trim(),
        state: draft.state.trim(),
        postal_code: draft.postal_code.trim(),
        country: draft.country.trim(),
        is_default: addresses.length === 0,
      })
      .select(
        'id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default'
      )
      .single();

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    setAddresses((prev) => [data, ...prev]);
    setDraft({
      label: '',
      recipient_name: '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: 'USA',
    });
    setMessage('Shipping address added successfully.');
    setSubmitting(false);
  };

  if (sessionLoading || loading) {
    return <PageSkeleton cards={3} label="Loading account and addresses" />;
  }

  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Account & Addresses"
      subtitle="Manage shipping destinations for your company"
      navItems={userNavigation}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => setRetryKey((key) => key + 1)}>Retry</Button>}>
            {errorMessage}
          </Alert>
        ) : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Company
            </Typography>
            <Typography component="p" variant="h5" sx={{ mt: 1, fontWeight: 800 }}>
              {company?.name || '—'}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Saved Addresses
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.totalAddresses}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stats.defaultAddresses} default
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Company Status
            </Typography>
            <Box sx={{ mt: 1 }}>
              <StatusChip status={stats.companyActive} />
            </Box>
          </StatCard>
        </StatsGrid>

        <PageGrid>
          <SectionCard>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              Saved Shipping Addresses
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              These addresses can be used during order submission from the dashboard.
            </Typography>

            {addresses.length === 0 ? (
              <EmptyWrap>
                <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
                  No addresses saved yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Add your first shipping address to start placing orders.
                </Typography>
              </EmptyWrap>
            ) : (
              <AddressList className="record-results">
                {addresses.map((address) => (
                  <AddressCard key={address.id}>
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
                          {address.label || 'Address'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {address.recipient_name || 'Recipient not specified'}
                        </Typography>
                      </Box>

                      {address.is_default ? <StatusChip status="ACTIVE" label="Default" /> : null}
                    </Stack>

                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="body2">{address.line1}</Typography>
                      {address.line2 ? (
                        <Typography variant="body2">{address.line2}</Typography>
                      ) : null}
                      <Typography variant="body2">
                        {address.city}, {address.state} {address.postal_code}
                      </Typography>
                      <Typography variant="body2">{address.country}</Typography>
                    </Box>
                  </AddressCard>
                ))}
              </AddressList>
            )}
          </SectionCard>

          <SectionCard>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              Add Shipping Address
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Create a new destination for receiving production shipments.
            </Typography>

            <FormGrid onSubmit={handleSubmit}>
              <StyledTextField
                label="Label"
                value={draft.label}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                fullWidth
              />

              <StyledTextField
                label="Recipient Name"
                value={draft.recipient_name}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, recipient_name: e.target.value }))
                }
                fullWidth
              />

              <FullWidthRow>
                <StyledTextField
                  label="Address Line 1"
                  value={draft.line1}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, line1: e.target.value }))
                  }
                  fullWidth
                  required
                />
              </FullWidthRow>

              <FullWidthRow>
                <StyledTextField
                  label="Address Line 2"
                  value={draft.line2}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, line2: e.target.value }))
                  }
                  fullWidth
                />
              </FullWidthRow>

              <StyledTextField
                label="City"
                value={draft.city}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, city: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="State"
                value={draft.state}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, state: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="Postal Code"
                value={draft.postal_code}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, postal_code: e.target.value }))
                }
                fullWidth
                required
              />

              <StyledTextField
                label="Country"
                value={draft.country}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, country: e.target.value }))
                }
                fullWidth
                required
              />

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
                    'Save Address'
                  )}
                </Button>
              </FullWidthRow>
            </FormGrid>
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}
