'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import { supabase } from '@/src/supabase/client';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { userNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import { useSessionStorageState } from '@/src/hooks/useSessionStorageState';
import {
  AddressFormGrid,
  EmptyWrap,
  FormGrid,
  OrderGrid,
  ProductCard,
  ProductList,
  ReviewBox,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
} from './styles';

type PeptideRow = { id: string; name: string; default_unit_price: number };

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

type OrderReceipt = {
  order_id: string;
  order_number: string;
  unit_price: number;
  total_price: number;
  order_status: string;
  submitted_at: string;
};

const emptyAddress = {
  label: '',
  recipient_name: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'USA',
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function UserDashboardScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();
  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [selectedPeptideId, setSelectedPeptideId] = useState('');
  const [addressId, setAddressId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [addressDraft, setAddressDraft] = useState(emptyAddress);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState<OrderReceipt | null>(null);
  const [productSearch, setProductSearch] = useSessionStorageState(
    'customer-order-product-search',
    ''
  );

  const loadOrderingData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setErrorMessage('');

    const peptideRequest = supabase
      .from('peptides')
      .select('id, name, default_unit_price')
      .eq('is_active', true)
      .order('name');
    const addressRequest = profile.company_id
      ? supabase
          .from('company_addresses')
          .select('id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default')
          .eq('company_id', profile.company_id)
          .order('is_default', { ascending: false })
      : Promise.resolve({ data: [] as AddressRow[], error: null });

    const [peptideResult, addressResult] = await Promise.all([peptideRequest, addressRequest]);
    if (peptideResult.error || addressResult.error) {
      setErrorMessage(
        peptideResult.error?.message || addressResult.error?.message || 'Unable to load ordering data.'
      );
      setLoading(false);
      return;
    }

    const nextPeptides = peptideResult.data || [];
    const nextAddresses = addressResult.data || [];
    setPeptides(nextPeptides);
    setAddresses(nextAddresses);
    setSelectedPeptideId((current) => current || nextPeptides[0]?.id || '');
    setAddressId(
      (current) =>
        current ||
        nextAddresses.find((address) => address.is_default)?.id ||
        nextAddresses[0]?.id ||
        ''
    );
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
      router.replace('/login');
      return;
    }
    const timer = window.setTimeout(() => void loadOrderingData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOrderingData, profile, router, sessionLoading]);

  const selectedPeptide = useMemo(
    () => peptides.find((peptide) => peptide.id === selectedPeptideId) || null,
    [peptides, selectedPeptideId]
  );
  const filteredPeptides = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return peptides;
    return peptides.filter((peptide) => peptide.name.toLowerCase().includes(query));
  }, [peptides, productSearch]);
  const parsedQuantity = Number(quantity);
  const validQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0;
  const estimatedTotal = validQuantity
    ? parsedQuantity * Number(selectedPeptide?.default_unit_price || 0)
    : 0;

  const saveAddress = async () => {
    if (!profile?.company_id) {
      setFormError('Your account must be assigned to a company before adding an address.');
      return;
    }
    const required = [
      addressDraft.line1,
      addressDraft.city,
      addressDraft.state,
      addressDraft.postal_code,
      addressDraft.country,
    ];
    if (required.some((value) => !value.trim())) {
      setFormError('Street, city, state, postal code, and country are required.');
      return;
    }

    setSavingAddress(true);
    setFormError('');
    const { data, error } = await supabase
      .from('company_addresses')
      .insert({
        company_id: profile.company_id,
        label: addressDraft.label.trim() || null,
        recipient_name: addressDraft.recipient_name.trim() || null,
        line1: addressDraft.line1.trim(),
        line2: addressDraft.line2.trim() || null,
        city: addressDraft.city.trim(),
        state: addressDraft.state.trim(),
        postal_code: addressDraft.postal_code.trim(),
        country: addressDraft.country.trim(),
        is_default: addresses.length === 0,
      })
      .select('id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default')
      .single();

    if (error) {
      setFormError(error.message);
      setSavingAddress(false);
      return;
    }
    setAddresses((current) => [data, ...current]);
    setAddressId(data.id);
    setAddressDraft(emptyAddress);
    setShowAddressForm(false);
    setSavingAddress(false);
  };

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setSuccess(null);

    if (!profile?.company_id) {
      setFormError('Your account is not assigned to a company. Please contact an administrator.');
      return;
    }
    if (!selectedPeptide) {
      setFormError('Select an active peptide.');
      return;
    }
    if (!validQuantity) {
      setFormError('Quantity must be a positive whole number.');
      return;
    }
    if (!addressId) {
      setFormError('Select or create a shipping address.');
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase
      .rpc('submit_product_order', {
        p_peptide_id: selectedPeptide.id,
        p_address_id: addressId,
        p_requested_quantity: parsedQuantity,
        p_user_notes: notes.trim() || null,
      })
      .single();

    if (error) {
      setFormError(error.message);
      setSubmitting(false);
      return;
    }

    setSuccess(data as OrderReceipt);
    setQuantity('');
    setNotes('');
    setSubmitting(false);
    router.prefetch('/my-orders');
  };

  if (sessionLoading || loading) return <PageSkeleton cards={3} label="Loading order form" />;
  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') return null;

  return (
    <AppShell
      title="Place an Order"
      subtitle="Choose an active product and submit it for review"
      navItems={userNavigation}
    >
      <Stack spacing={3}>
        {errorMessage ? (
          <Alert
            severity="error"
            action={<Button color="inherit" onClick={() => void loadOrderingData()}>Retry</Button>}
          >
            {errorMessage}
          </Alert>
        ) : null}
        {!profile.company_id ? (
          <Alert severity="warning">
            An administrator must assign your account to a company before you can order.
          </Alert>
        ) : null}
        <Alert severity="info">
          Distributor terms list 250 vials per SKU and 2,000 vials overall. This single-product
          request flow does not enforce those multi-SKU terms; an administrator will review them
          before approval.
        </Alert>

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">Active Products</Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{peptides.length}</Typography>
          </StatCard>
          <StatCard>
            <Typography variant="body2" color="text.secondary">Saved Addresses</Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{addresses.length}</Typography>
          </StatCard>
          <StatCard>
            <Typography variant="body2" color="text.secondary">Selected Unit Price</Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{money(selectedPeptide?.default_unit_price)}</Typography>
          </StatCard>
        </StatsGrid>

        {peptides.length === 0 ? (
          <EmptyWrap>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 800 }}>No active products</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Products will appear after an administrator activates catalog pricing.
            </Typography>
          </EmptyWrap>
        ) : (
          <OrderGrid>
            <SectionCard>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
                Product catalog · {filteredPeptides.length} {filteredPeptides.length === 1 ? 'product' : 'products'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Prices shown are current defaults; the database snapshots the authoritative price at submission.
              </Typography>
              <StyledTextField
                label="Search products"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                fullWidth
                sx={{ mt: 2 }}
              />
              {filteredPeptides.length === 0 ? (
                <EmptyWrap sx={{ mt: 2, p: 3 }}>
                  <Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>
                    No matching products
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    Try a different peptide name.
                  </Typography>
                </EmptyWrap>
              ) : (
              <ProductList className="record-results">
                {filteredPeptides.map((peptide) => (
                  <ProductCard key={peptide.id} selected={peptide.id === selectedPeptideId}>
                    <Typography variant="body1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{peptide.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{money(peptide.default_unit_price)} / vial</Typography>
                    <Button
                      type="button"
                      variant={peptide.id === selectedPeptideId ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setSelectedPeptideId(peptide.id)}
                      aria-pressed={peptide.id === selectedPeptideId}
                      sx={{ mt: 1.25, minHeight: 44 }}
                    >
                      {peptide.id === selectedPeptideId ? 'Selected' : 'Select'}
                    </Button>
                  </ProductCard>
                ))}
              </ProductList>
              )}
            </SectionCard>

            <form onSubmit={submitOrder} noValidate style={{ minWidth: 0 }}>
              <SectionCard>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Order details</Typography>
              <FormGrid>
                <StyledTextField select label="Peptide" required value={selectedPeptideId} onChange={(event) => setSelectedPeptideId(event.target.value)}>
                  {peptides.map((peptide) => (
                    <MenuItem key={peptide.id} value={peptide.id}>{peptide.name} — {money(peptide.default_unit_price)}</MenuItem>
                  ))}
                </StyledTextField>
                <StyledTextField
                  label="Quantity (vials)"
                  type="number"
                  required
                  value={quantity}
                  error={quantity !== '' && !validQuantity}
                  helperText={quantity !== '' && !validQuantity ? 'Enter a positive whole number.' : 'Whole vials only.'}
                  onChange={(event) => setQuantity(event.target.value)}
                  slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
                />
                <StyledTextField select label="Shipping address" required value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                  <MenuItem value="">Select an address</MenuItem>
                  {addresses.map((address) => (
                    <MenuItem key={address.id} value={address.id}>{address.label || 'Address'} · {address.line1}, {address.city}</MenuItem>
                  ))}
                </StyledTextField>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => setShowAddressForm((open) => !open)}
                  aria-expanded={showAddressForm}
                  sx={{ minHeight: 44 }}
                >
                  {showAddressForm ? 'Cancel new address' : 'Add shipping address'}
                </Button>

                {showAddressForm ? (
                  <AddressFormGrid aria-label="New shipping address">
                    {(
                      ['label', 'recipient_name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country'] as const
                    ).map((field) => {
                      const labels = {
                        label: 'Address label',
                        recipient_name: 'Recipient name',
                        line1: 'Street address',
                        line2: 'Address line 2',
                        city: 'City',
                        state: 'State / region',
                        postal_code: 'Postal code',
                        country: 'Country',
                      };
                      const required = ['line1', 'city', 'state', 'postal_code', 'country'].includes(field);
                      return (
                        <StyledTextField
                          key={field}
                          label={labels[field]}
                          required={required}
                          value={addressDraft[field]}
                          onChange={(event) => setAddressDraft((current) => ({ ...current, [field]: event.target.value }))}
                        />
                      );
                    })}
                    <Button type="button" variant="contained" disabled={savingAddress} onClick={() => void saveAddress()} sx={{ minHeight: 48 }}>
                      {savingAddress ? <><CircularProgress size={18} color="inherit" sx={{ mr: 1 }} />Saving address…</> : 'Save and select address'}
                    </Button>
                  </AddressFormGrid>
                ) : null}

                <StyledTextField label="Order notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={3} />
                <ReviewBox>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Review</Typography>
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Product</Typography><Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>{selectedPeptide?.name || '—'}</Typography></Stack>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Unit price</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{money(selectedPeptide?.default_unit_price)}</Typography></Stack>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Quantity</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{validQuantity ? parsedQuantity.toLocaleString('en-US') : '—'}</Typography></Stack>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body1" sx={{ fontWeight: 800 }}>Estimated total</Typography><Typography variant="body1" sx={{ fontWeight: 800 }}>{money(estimatedTotal)}</Typography></Stack>
                  </Stack>
                </ReviewBox>

                {formError ? <Alert severity="error" role="alert">{formError}</Alert> : null}
                {success ? (
                  <Alert severity="success" role="status">
                    Order <strong>{success.order_number}</strong> was submitted at {money(success.unit_price)} per vial for a database-confirmed total of {money(success.total_price)}.{' '}
                    <Link href="/my-orders">View order history</Link>.
                  </Alert>
                ) : null}
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={submitting || !profile.company_id || !selectedPeptide || !addressId || !validQuantity}
                  sx={{ minHeight: 48 }}
                >
                  {submitting ? <><CircularProgress size={19} color="inherit" sx={{ mr: 1 }} />Submitting order…</> : 'Submit order'}
                </Button>
              </FormGrid>
              </SectionCard>
            </form>
          </OrderGrid>
        )}
      </Stack>
    </AppShell>
  );
}
