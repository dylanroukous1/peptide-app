'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
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
  OrderItemCard,
  OrderItemsList,
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
type DraftItem = { peptideId: string; quantity: string };
type OrderReceipt = {
  order_id: string;
  order_number: string;
  item_count: number;
  total_quantity: number;
  total_price: number;
  order_status: string;
  submitted_at: string;
};

const emptyAddress = {
  label: '', recipient_name: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'USA',
};
const SKU_MINIMUM = 250;
const ORDER_MINIMUM = 2000;

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function UserDashboardScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();
  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [addressId, setAddressId] = useState('');
  const [notes, setNotes] = useState('');
  const [addressDraft, setAddressDraft] = useState(emptyAddress);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState<OrderReceipt | null>(null);
  const [productSearch, setProductSearch] = useSessionStorageState('customer-order-product-search', '');
  const submittingRef = useRef(false);

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
      setErrorMessage(peptideResult.error?.message || addressResult.error?.message || 'Unable to load ordering data.');
      setLoading(false);
      return;
    }
    const nextAddresses = addressResult.data || [];
    setPeptides(peptideResult.data || []);
    setAddresses(nextAddresses);
    setAddressId((current) => current || nextAddresses.find((address) => address.is_default)?.id || nextAddresses[0]?.id || '');
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

  const filteredPeptides = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return query ? peptides.filter((peptide) => peptide.name.toLowerCase().includes(query)) : peptides;
  }, [peptides, productSearch]);
  const orderItems = useMemo(() => items.map((item) => {
    const peptide = peptides.find((row) => row.id === item.peptideId);
    const quantity = Number(item.quantity);
    const validQuantity = Number.isInteger(quantity) && quantity >= SKU_MINIMUM;
    return {
      ...item,
      peptide,
      quantity,
      validQuantity,
      lineTotal: validQuantity ? quantity * Number(peptide?.default_unit_price || 0) : 0,
    };
  }), [items, peptides]);
  const totalQuantity = orderItems.reduce((sum, item) => sum + (Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0), 0);
  const totalPrice = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const allSkuMinimumsMet = orderItems.length > 0 && orderItems.every((item) => item.validQuantity);
  const orderMinimumMet = totalQuantity >= ORDER_MINIMUM;
  const canSubmit = Boolean(profile?.company_id && addressId && allSkuMinimumsMet && orderMinimumMet && !submitting);

  const addProduct = (peptideId: string) => {
    setSuccess(null);
    setItems((current) => current.some((item) => item.peptideId === peptideId)
      ? current
      : [...current, { peptideId, quantity: String(SKU_MINIMUM) }]);
  };
  const updateQuantity = (peptideId: string, quantity: string) => {
    setItems((current) => current.map((item) => item.peptideId === peptideId ? { ...item, quantity } : item));
  };
  const removeProduct = (peptideId: string) => {
    setItems((current) => current.filter((item) => item.peptideId !== peptideId));
  };

  const saveAddress = async () => {
    if (!profile?.company_id) {
      setFormError('Your account must be assigned to a company before adding an address.');
      return;
    }
    const required = [addressDraft.line1, addressDraft.city, addressDraft.state, addressDraft.postal_code, addressDraft.country];
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
    if (submittingRef.current) return;
    setFormError('');
    setSuccess(null);
    if (!canSubmit) {
      setFormError('Every product requires at least 250 vials and the complete order requires at least 2,000 vials.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    const { data, error } = await supabase
      .rpc('submit_multi_product_order', {
        p_address_id: addressId,
        p_items: orderItems.map((item) => ({ peptide_id: item.peptideId, requested_quantity: item.quantity })),
        p_user_notes: notes.trim() || null,
      })
      .single();
    if (error) {
      setFormError(error.message);
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    setSuccess(data as OrderReceipt);
    setItems([]);
    setNotes('');
    submittingRef.current = false;
    setSubmitting(false);
    router.prefetch('/my-orders');
  };

  if (sessionLoading || loading) return <PageSkeleton cards={3} label="Loading order builder" />;
  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') return null;

  return (
    <AppShell title="Build an Order" subtitle="Submit multiple active products in one order request" navItems={userNavigation}>
      <Stack spacing={3}>
        {errorMessage ? <Alert severity="error" action={<Button color="inherit" onClick={() => void loadOrderingData()}>Retry</Button>}>{errorMessage}</Alert> : null}
        {!profile.company_id ? <Alert severity="warning">An administrator must assign your account to a company before you can order.</Alert> : null}
        <Alert severity="info">
          Minimum <strong>250 vials per product</strong> and <strong>2,000 total vials per order</strong>. Both rules are verified again by the database.
        </Alert>

        <StatsGrid>
          <StatCard><Typography variant="body2" color="text.secondary">Products Added</Typography><Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{items.length}</Typography></StatCard>
          <StatCard><Typography variant="body2" color="text.secondary">Total Vials</Typography><Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{totalQuantity.toLocaleString('en-US')}</Typography></StatCard>
          <StatCard><Typography variant="body2" color="text.secondary">Order Total</Typography><Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{money(totalPrice)}</Typography></StatCard>
        </StatsGrid>

        <OrderGrid>
          <SectionCard>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Product catalog · {filteredPeptides.length} products</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Search active products and add each SKU once.</Typography>
            <StyledTextField label="Search products" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} fullWidth sx={{ mt: 2 }} />
            {filteredPeptides.length === 0 ? (
              <EmptyWrap sx={{ mt: 2, p: 3 }}><Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>No matching products</Typography><Typography variant="body2" color="text.secondary">Try a different peptide name.</Typography></EmptyWrap>
            ) : (
              <ProductList className="record-results">
                {filteredPeptides.map((peptide) => {
                  const added = items.some((item) => item.peptideId === peptide.id);
                  return (
                    <ProductCard key={peptide.id} selected={added}>
                      <Typography variant="body1" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{peptide.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{money(peptide.default_unit_price)} / vial</Typography>
                      <Button type="button" variant={added ? 'outlined' : 'contained'} disabled={added} onClick={() => addProduct(peptide.id)} sx={{ mt: 1.25, minHeight: 44 }}>
                        {added ? 'Added' : 'Add to order'}
                      </Button>
                    </ProductCard>
                  );
                })}
              </ProductList>
            )}
          </SectionCard>

          <form onSubmit={submitOrder} noValidate style={{ minWidth: 0 }}>
            <SectionCard>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Order request</Typography>
              <FormGrid>
                {orderItems.length === 0 ? (
                  <EmptyWrap sx={{ p: 3 }}><Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>No products added</Typography><Typography variant="body2" color="text.secondary">Add products from the catalog to begin.</Typography></EmptyWrap>
                ) : (
                  <OrderItemsList>
                    {orderItems.map((item) => (
                      <OrderItemCard key={item.peptideId}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{item.peptide?.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{money(item.peptide?.default_unit_price)} each · {money(item.lineTotal)}</Typography>
                        </Box>
                        <StyledTextField
                          className="order-item-quantity"
                          label="Vials"
                          type="number"
                          value={item.quantity}
                          error={item.quantity > 0 && !item.validQuantity}
                          helperText={!item.validQuantity ? 'Minimum 250' : ' '}
                          onChange={(event) => updateQuantity(item.peptideId, event.target.value)}
                          slotProps={{ htmlInput: { min: SKU_MINIMUM, step: 1, inputMode: 'numeric' } }}
                        />
                        <IconButton type="button" aria-label={`Remove ${item.peptide?.name || 'product'}`} onClick={() => removeProduct(item.peptideId)}><DeleteOutlinedIcon /></IconButton>
                      </OrderItemCard>
                    ))}
                  </OrderItemsList>
                )}

                <ReviewBox>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" sx={{ fontWeight: 700 }}>2,000-vial progress</Typography><Typography variant="body2">{Math.min(totalQuantity, ORDER_MINIMUM).toLocaleString('en-US')} / {ORDER_MINIMUM.toLocaleString('en-US')}</Typography></Stack>
                  <LinearProgress variant="determinate" value={Math.min((totalQuantity / ORDER_MINIMUM) * 100, 100)} aria-label="Order minimum progress" sx={{ mt: 1, height: 8, borderRadius: 4 }} />
                  <Stack spacing={0.75} sx={{ mt: 2 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Products</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{orderItems.length}</Typography></Stack>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Total vials</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{totalQuantity.toLocaleString('en-US')}</Typography></Stack>
                    <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body1" sx={{ fontWeight: 800 }}>Estimated total</Typography><Typography variant="body1" sx={{ fontWeight: 800 }}>{money(totalPrice)}</Typography></Stack>
                  </Stack>
                </ReviewBox>

                <StyledTextField select label="Shipping address" required value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                  <MenuItem value="">Select an address</MenuItem>
                  {addresses.map((address) => <MenuItem key={address.id} value={address.id}>{address.label || 'Address'} · {address.line1}, {address.city}</MenuItem>)}
                </StyledTextField>
                <Button type="button" variant="outlined" onClick={() => setShowAddressForm((open) => !open)} aria-expanded={showAddressForm}>{showAddressForm ? 'Cancel new address' : 'Add shipping address'}</Button>
                {showAddressForm ? (
                  <AddressFormGrid aria-label="New shipping address">
                    {(['label', 'recipient_name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country'] as const).map((field) => {
                      const labels = { label: 'Address label', recipient_name: 'Recipient name', line1: 'Street address', line2: 'Address line 2', city: 'City', state: 'State / region', postal_code: 'Postal code', country: 'Country' };
                      const required = ['line1', 'city', 'state', 'postal_code', 'country'].includes(field);
                      return <StyledTextField key={field} label={labels[field]} required={required} value={addressDraft[field]} onChange={(event) => setAddressDraft((current) => ({ ...current, [field]: event.target.value }))} />;
                    })}
                    <Button type="button" variant="contained" disabled={savingAddress} onClick={() => void saveAddress()}>{savingAddress ? <><CircularProgress size={18} color="inherit" sx={{ mr: 1 }} />Saving…</> : 'Save and select address'}</Button>
                  </AddressFormGrid>
                ) : null}
                <StyledTextField label="Order notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={3} />
                {!allSkuMinimumsMet && items.length > 0 ? <Alert severity="warning">Every product must contain at least 250 vials.</Alert> : null}
                {!orderMinimumMet ? <Alert severity="warning">Add {(ORDER_MINIMUM - totalQuantity).toLocaleString('en-US')} more vials to reach the order minimum.</Alert> : null}
                {formError ? <Alert severity="error" role="alert">{formError}</Alert> : null}
                {success ? <Alert severity="success" role="status">Order <strong>{success.order_number}</strong> was submitted with {success.item_count} products and {Number(success.total_quantity).toLocaleString('en-US')} vials for {money(success.total_price)}. <Link href={`/my-orders#order-${success.order_id}`}>Open order in history</Link>.</Alert> : null}
                <Button type="submit" variant="contained" size="large" disabled={!canSubmit} sx={{ minHeight: 48 }}>
                  {submitting ? <><CircularProgress size={19} color="inherit" sx={{ mr: 1 }} />Submitting order…</> : 'Submit order'}
                </Button>
              </FormGrid>
            </SectionCard>
          </form>
        </OrderGrid>
      </Stack>
    </AppShell>
  );
}
