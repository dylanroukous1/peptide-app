'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
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
import { supabase } from '@/src/supabase/client';
import { TextField } from '@mui/material';
import type { AdminOrder } from '@/src/lib/workspace/loadWorkspace';

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  order: AdminOrder | null;
  onClose: () => void;
  onSaved: (orderId: string | null) => Promise<void>;
  showToast: (message: string, severity?: 'success' | 'error') => void;
};
type Company = { id: string; name: string };
type Customer = { id: string; first_name: string; last_name: string; email: string | null; company_id: string | null };
type Address = { id: string; company_id: string; label: string | null; line1: string; city: string; state: string; postal_code: string; country: string; is_default: boolean };
type Product = { id: string; name: string; default_unit_price: number; is_active: boolean };
type DraftLine = { peptideId: string; quantity: string };

function initialLines(order: AdminOrder | null): DraftLine[] {
  return order?.items.map((item) => ({ peptideId: item.peptide_id, quantity: String(item.requested_quantity) })) || [];
}

export default function OrderEditorDialog({ open, mode, order, onClose, onSaved, showToast }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState(order?.company_id || '');
  const [userId, setUserId] = useState(order?.user_id || '');
  const [addressId, setAddressId] = useState(order?.address_id || '');
  const [userNotes, setUserNotes] = useState(order?.user_notes || '');
  const [adminNote, setAdminNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines(order));
  const [addProductId, setAddProductId] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.all([
      supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id, first_name, last_name, email, company_id').eq('role', 'USER').eq('account_status', 'ACTIVE').order('last_name'),
      supabase.from('company_addresses').select('id, company_id, label, line1, city, state, postal_code, country, is_default').order('is_default', { ascending: false }),
      supabase.from('peptides').select('id, name, default_unit_price, is_active').order('name'),
    ]).then(([companyResult, customerResult, addressResult, productResult]) => {
      if (!active) return;
      const failed = companyResult.error || customerResult.error || addressResult.error || productResult.error;
      if (failed) setError(`Unable to load order options: ${failed.message}`);
      setCompanies((companyResult.data || []) as Company[]);
      setCustomers((customerResult.data || []) as Customer[]);
      setAddresses((addressResult.data || []) as Address[]);
      setProducts((productResult.data || []) as Product[]);
      setOptionsLoading(false);
    });
    return () => { active = false; };
  }, [open]);

  const availableCustomers = useMemo(() => customers.filter((customer) => customer.company_id === companyId), [companyId, customers]);
  const availableAddresses = useMemo(() => addresses.filter((address) => address.company_id === companyId), [addresses, companyId]);
  const availableProducts = useMemo(() => products.filter((product) => product.is_active || lines.some((line) => line.peptideId === product.id)), [lines, products]);
  const selectedProducts = useMemo(() => lines.map((line) => ({
    ...line,
    product: products.find((product) => product.id === line.peptideId),
    unitPrice: order?.items.find((item) => item.peptide_id === line.peptideId)?.unit_price_at_submission
      ?? products.find((product) => product.id === line.peptideId)?.default_unit_price ?? 0,
  })), [lines, order, products]);
  const estimatedTotal = selectedProducts.reduce((total, line) => total + (Number(line.quantity) || 0) * Number(line.unitPrice), 0);
  const batchLinked = Boolean(order?.batch_id);

  const addProduct = () => {
    if (!addProductId || lines.some((line) => line.peptideId === addProductId)) return;
    setLines((current) => [...current, { peptideId: addProductId, quantity: '1' }]);
    setAddProductId('');
  };

  const handleSave = async () => {
    if (saving) return;
    if (!companyId || !addressId || (mode === 'create' && !userId)) {
      setError('Choose a company, customer and shipping address.');
      return;
    }
    if (!lines.length || lines.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      setError('Add at least one product and enter a positive whole-number quantity for each.');
      return;
    }
    setSaving(true);
    setError('');
    const itemPayload = lines.map((line) => ({ peptide_id: line.peptideId, requested_quantity: Number(line.quantity) }));
    const result = mode === 'create'
      ? await supabase.rpc('admin_create_customer_order', {
          p_company_id: companyId,
          p_user_id: userId,
          p_address_id: addressId,
          p_items: itemPayload,
          p_user_notes: userNotes.trim() || null,
          p_admin_note: adminNote.trim() || null,
        })
      : await supabase.rpc('admin_edit_customer_order', {
          p_order_id: order!.id,
          p_address_id: addressId,
          p_items: itemPayload,
          p_user_notes: userNotes.trim() || null,
        });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const orderId = mode === 'create' ? String((result.data as { order_id: string }).order_id) : order!.id;
    showToast(mode === 'create' ? 'Customer order created.' : 'Order details updated.');
    await onSaved(orderId);
  };

  return (
    <Dialog open={open} onClose={() => saving ? undefined : onClose()} fullWidth maxWidth="md" aria-labelledby="admin-order-editor-title">
      <DialogTitle id="admin-order-editor-title">{mode === 'create' ? 'Create customer order' : `Edit order ${order?.order_number || ''}`}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {optionsLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box> : null}
          {!optionsLoading ? <>
            {mode === 'create' ? <>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
                <StyledField select label="Company" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setUserId(''); setAddressId(''); setLines([]); }}>
                  <MenuItem value="">Select company</MenuItem>{companies.map((company) => <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>)}
                </StyledField>
                <StyledField select label="Customer" value={userId} disabled={!companyId} onChange={(event) => setUserId(event.target.value)}>
                  <MenuItem value="">Select customer</MenuItem>{availableCustomers.map((customer) => <MenuItem key={customer.id} value={customer.id}>{customer.first_name} {customer.last_name} · {customer.email}</MenuItem>)}
                </StyledField>
              </Box>
            </> : <Typography variant="body2" color="text.secondary">{order?.company?.name || 'Company'} · {[order?.user?.first_name, order?.user?.last_name].filter(Boolean).join(' ') || order?.user?.email}</Typography>}
            <StyledField select label="Shipping address" value={addressId} disabled={!companyId} onChange={(event) => setAddressId(event.target.value)}>
              <MenuItem value="">Select shipping address</MenuItem>{availableAddresses.map((address) => <MenuItem key={address.id} value={address.id}>{address.label || address.line1} — {address.city}, {address.state} {address.postal_code}{address.is_default ? ' · Default' : ''}</MenuItem>)}
            </StyledField>

            <Box sx={{ border: '1px solid #E2E8F0', borderRadius: 2, p: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Products and quantities</Typography>
              {batchLinked ? <Typography variant="caption" color="text.secondary">This order retains its historical batch reference; its product lines cannot be added or removed.</Typography> : null}
              <Stack spacing={1} sx={{ mt: 1.5 }}>
                {selectedProducts.map((line) => <Box key={line.peptideId} sx={{ display: 'grid', gap: 1, alignItems: 'center', gridTemplateColumns: { xs: 'minmax(0, 1fr) 110px', sm: 'minmax(0, 1fr) 130px auto' } }}>
                  <Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{line.product?.name || 'Product'}</Typography><Typography variant="caption" color="text.secondary">{money(line.unitPrice)} per vial</Typography></Box>
                  <StyledField label="Quantity" type="number" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.peptideId === line.peptideId ? { ...item, quantity: event.target.value } : item))} slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }} />
                  {!batchLinked ? <Button color="error" onClick={() => setLines((current) => current.filter((item) => item.peptideId !== line.peptideId))} sx={{ gridColumn: { xs: '2', sm: 'auto' }, justifySelf: 'start' }}>Remove</Button> : null}
                </Box>)}
              </Stack>
              {!batchLinked ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                <StyledField select label="Add product" value={addProductId} onChange={(event) => setAddProductId(event.target.value)} sx={{ flex: 1 }}>
                  <MenuItem value="">Choose product</MenuItem>{availableProducts.filter((product) => !lines.some((line) => line.peptideId === product.id)).map((product) => <MenuItem key={product.id} value={product.id}>{product.name} · {money(product.default_unit_price)}</MenuItem>)}
                </StyledField>
                <Button variant="outlined" onClick={addProduct} disabled={!addProductId} sx={{ minHeight: 56 }}>Add product</Button>
              </Stack> : null}
              <Typography variant="body2" sx={{ mt: 1.5, textAlign: 'right', fontWeight: 800 }}>Estimated subtotal: {money(estimatedTotal)}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>The database uses its current product prices when creating an order. Existing line-item price snapshots remain unchanged when editing.</Typography>
            </Box>
            <StyledField label="Customer-visible order notes" multiline minRows={2} value={userNotes} onChange={(event) => setUserNotes(event.target.value)} />
            {mode === 'create' ? <StyledField label="Private admin note (optional)" multiline minRows={2} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} /> : null}
          </> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap' }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || optionsLoading}>
          {saving ? <CircularProgress size={18} color="inherit" /> : mode === 'create' ? 'Create order' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));
}

const StyledField = (props: ComponentProps<typeof TextField>) => <TextField fullWidth size="small" {...props} />;
