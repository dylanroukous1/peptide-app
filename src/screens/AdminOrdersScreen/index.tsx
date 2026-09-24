'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import SyncAltOutlinedIcon from '@mui/icons-material/SyncAltOutlined';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import { adminNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import ScrollableResults from '@/src/components/feedback/ScrollableResults';
import AppSnackbar from '@/src/commons/AppSnackBar';
import { useAppToast } from '@/src/hooks/useAppToast';
import {
  loadAdminOrders,
  type AdminOrder as OrderRow,
} from '@/src/lib/workspace/loadWorkspace';
import { useSessionStorageState } from '@/src/hooks/useSessionStorageState';
import {
  ActionHeader,
  ActionIcon,
  ActionPanel,
  DangerZone,
  EditorFields,
  EmptyWrap,
  ExpandedContent,
  FiltersGrid,
  ListWrap,
  ManagementGrid,
  ManagementPanel,
  OrderCard,
  OrderSummaryGrid,
  SectionCard,
  StatCard,
  StatsGrid,
  StatusActionRow,
  StyledTextField,
} from './styles';

const carriers = ['UPS', 'FedEx', 'USPS', 'DHL'];
type ShipmentDraft = {
  carrierChoice: string;
  customCarrier: string;
  trackingNumber: string;
  shipDate: string;
  estimatedDeliveryDate: string;
  shipmentNotes: string;
};
type DiscountDraft = { type: 'PERCENT' | 'FIXED'; value: string };

function shipmentDraft(order: OrderRow): ShipmentDraft {
  const carrier = order.shipment?.carrier_name || '';
  return {
    carrierChoice: carriers.includes(carrier) ? carrier : carrier ? 'Other' : '',
    customCarrier: carriers.includes(carrier) ? '' : carrier,
    trackingNumber: order.shipment?.tracking_number || '',
    shipDate: order.shipment?.ship_date || '',
    estimatedDeliveryDate: order.shipment?.estimated_delivery_date || '',
    shipmentNotes: order.shipment?.shipment_notes || '',
  };
}

function discountDraft(order: OrderRow): DiscountDraft {
  return {
    type: order.discount_type || 'PERCENT',
    value: order.discount_value == null ? '' : String(order.discount_value),
  };
}

const statusOptions = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'IN_PRODUCTION',
  'SHIPPED',
  'FULFILLED',
  'CANCELLED',
  'EXPIRED',
];

const nextStatuses: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'CANCELLED', 'EXPIRED'],
  UNDER_REVIEW: ['APPROVED', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
  EXPIRED: [],
};

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
  return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
}

export default function AdminOrdersScreen() {
  const router = useRouter();
  const {
    profile,
    loading: sessionLoading,
    preparedWorkspace,
    clearPreparedWorkspace,
  } = useSessionUser();
  const initialOrders =
    preparedWorkspace?.role === 'ADMIN' && preparedWorkspace.userId === profile?.id
      ? preparedWorkspace.orders
      : null;
  const [orders, setOrders] = useState<OrderRow[] | null>(() => initialOrders);
  const [loading, setLoading] = useState(initialOrders === null);
  const [errorMessage, setErrorMessage] = useState('');
  const [filters, setFilters] = useSessionStorageState('admin-order-filters', {
    search: '',
    status: 'ALL',
  });
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [statusFeedback, setStatusFeedback] = useState<Record<string, { severity: 'success' | 'error'; text: string }>>({});
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [trackingEditors, setTrackingEditors] = useState<Set<string>>(new Set());
  const [discountEditors, setDiscountEditors] = useState<Set<string>>(new Set());
  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);
  const [savingShipmentId, setSavingShipmentId] = useState<string | null>(null);
  const [savingDiscountId, setSavingDiscountId] = useState<string | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<OrderRow | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [shipmentDrafts, setShipmentDrafts] = useState<Record<string, ShipmentDraft>>(() =>
    Object.fromEntries((initialOrders || []).map((order) => [order.id, shipmentDraft(order)]))
  );
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, DiscountDraft>>(() =>
    Object.fromEntries((initialOrders || []).map((order) => [order.id, discountDraft(order)]))
  );
  const { toast, showToast, closeToast } = useAppToast();

  const loadOrders = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const normalized = await loadAdminOrders();
      setOrders(normalized);
      setStatusDrafts({});
      setShipmentDrafts(Object.fromEntries(normalized.map((order) => [order.id, shipmentDraft(order)])));
      setDiscountDrafts(Object.fromEntries(normalized.map((order) => [order.id, discountDraft(order)])));
    } catch (error) {
      setOrders(null);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load orders.');
      setLoading(false);
      return;
    }
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

    if (orders !== null) {
      if (preparedWorkspace?.role === 'ADMIN') clearPreparedWorkspace();
      return;
    }

    const timer = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(timer);
  }, [clearPreparedWorkspace, orders, preparedWorkspace, profile, router, sessionLoading]);

  const resolvedOrders = useMemo(() => orders ?? [], [orders]);

  const filteredOrders = useMemo(() => {
    return resolvedOrders.filter((order) => {
      const matchesStatus =
        filters.status === 'ALL' || order.status === filters.status;

      const haystack = [
        order.order_number,
        order.company?.name || '',
        order.items.map((item) => item.peptide?.name || '').join(' '),
        order.peptide?.name || order.batch?.peptide?.name || '',
        order.batch?.batch_code || '',
        order.user?.email || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = haystack.includes(filters.search.trim().toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [filters.search, filters.status, resolvedOrders]);

  const stats = useMemo(() => {
    const pendingReview = resolvedOrders.filter((order) =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes(order.status)
    ).length;

    const approvedFlow = resolvedOrders.filter((order) =>
      ['APPROVED', 'IN_PRODUCTION', 'SHIPPED'].includes(order.status)
    ).length;

    const totalRevenue = resolvedOrders
      .filter((order) => ['APPROVED', 'IN_PRODUCTION', 'SHIPPED', 'FULFILLED'].includes(order.status))
      .reduce((sum, order) => sum + Number(order.final_total || 0), 0);

    return {
      totalOrders: resolvedOrders.length,
      pendingReview,
      approvedFlow,
      totalRevenue,
    };
  }, [resolvedOrders]);

  const handleDeleteOrder = async () => {
    if (!deleteOrder || deletingOrderId) return;
    setDeletingOrderId(deleteOrder.id);
    setDeleteError('');

    const { error } = await supabase.rpc('admin_delete_order', {
      p_order_id: deleteOrder.id,
    });

    if (error) {
      setDeleteError(error.message);
      setDeletingOrderId(null);
      return;
    }

    setOrders((current) => current?.filter((order) => order.id !== deleteOrder.id) ?? current);
    showToast(`Order ${deleteOrder.order_number} was permanently deleted.`);
    setDeleteOrder(null);
    setDeletingOrderId(null);
  };

  const handleUpdateStatus = async (order: OrderRow, forcedStatus?: string) => {
    const nextStatus = (forcedStatus || statusDrafts[order.id]) as
      | 'SUBMITTED'
      | 'UNDER_REVIEW'
      | 'APPROVED'
      | 'IN_PRODUCTION'
      | 'SHIPPED'
      | 'FULFILLED'
      | 'CANCELLED'
      | 'EXPIRED';

    if (!nextStatus || nextStatus === order.status) {
      return;
    }

    setSubmittingOrderId(order.id);
    setStatusFeedback((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });

    const { error } = await supabase.rpc('admin_update_order_status', {
      p_order_id: order.id,
      p_new_status: nextStatus,
    });

    if (error) {
      showToast(error.message, 'error');
      setStatusFeedback((current) => ({ ...current, [order.id]: { severity: 'error', text: error.message } }));
      setSubmittingOrderId(null);
      return;
    }

    showToast(`Order ${order.order_number} updated to ${statusLabel(nextStatus)}.`);
    setOrders((current) =>
      current
        ? current.map((item) =>
            item.id === order.id ? { ...item, status: nextStatus } : item
          )
        : current
    );
    setStatusDrafts((current) => ({ ...current, [order.id]: '' }));
    setStatusFeedback((current) => ({ ...current, [order.id]: { severity: 'success', text: `Status updated to ${statusLabel(nextStatus)}.` } }));
    setSubmittingOrderId(null);
  };

  const handleSaveShipment = async (order: OrderRow) => {
    if (savingShipmentId) return;
    const draft = shipmentDrafts[order.id] || shipmentDraft(order);
    const carrierName = (draft.carrierChoice === 'Other' ? draft.customCarrier : draft.carrierChoice).trim();
    if (!carrierName || !draft.trackingNumber.trim()) {
      showToast('Carrier and tracking number are required.', 'error');
      return;
    }
    if (draft.shipDate && draft.estimatedDeliveryDate && draft.estimatedDeliveryDate < draft.shipDate) {
      showToast('Estimated delivery cannot precede ship date.', 'error');
      return;
    }
    setSavingShipmentId(order.id);
    const { data, error } = await supabase.rpc('admin_upsert_order_shipment', {
      p_order_id: order.id,
      p_carrier_name: carrierName,
      p_tracking_number: draft.trackingNumber.trim(),
      p_ship_date: draft.shipDate || null,
      p_estimated_delivery_date: draft.estimatedDeliveryDate || null,
      p_shipment_notes: draft.shipmentNotes.trim() || null,
    });
    setSavingShipmentId(null);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    const result = data as { shipment: OrderRow['shipment']; order_status: string };
    setOrders((current) => current?.map((row) => row.id === order.id
      ? { ...row, shipment: result.shipment, status: result.order_status }
      : row) ?? current);
    setStatusDrafts((current) => ({ ...current, [order.id]: '' }));
    setTrackingEditors((current) => {
      const next = new Set(current);
      next.delete(order.id);
      return next;
    });
    showToast(`${order.shipment ? 'Shipping information updated' : 'Tracking added'} for ${order.order_number}.`);
  };

  const handleSetDiscount = async (order: OrderRow, remove = false) => {
    if (savingDiscountId) return;
    const draft = discountDrafts[order.id] || discountDraft(order);
    const value = Number(draft.value);
    if (!remove && (!Number.isFinite(value) || value <= 0)) {
      showToast('Enter a positive discount value.', 'error');
      return;
    }
    if (remove && !window.confirm(`Remove the discount from ${order.order_number}?`)) return;
    setSavingDiscountId(order.id);
    const { data, error } = await supabase.rpc('admin_set_order_discount', {
      p_order_id: order.id,
      p_discount_type: remove ? null : draft.type,
      p_discount_value: remove ? null : value,
    });
    setSavingDiscountId(null);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    const result = data as Pick<OrderRow, 'discount_type' | 'discount_value' | 'discount_amount' | 'final_total'> & { subtotal: number };
    setOrders((current) => current?.map((row) => row.id === order.id ? {
      ...row,
      total_price: result.subtotal,
      discount_type: result.discount_type,
      discount_value: result.discount_value,
      discount_amount: result.discount_amount,
      final_total: result.final_total,
    } : row) ?? current);
    setDiscountDrafts((current) => ({ ...current, [order.id]: {
      type: result.discount_type || 'PERCENT',
      value: result.discount_value == null ? '' : String(result.discount_value),
    } }));
    setDiscountEditors((current) => {
      const next = new Set(current);
      next.delete(order.id);
      return next;
    });
    showToast(remove ? `Discount removed from ${order.order_number}.` : `Discount applied to ${order.order_number}.`);
  };

  if (sessionLoading || loading) {
    return <PageSkeleton label="Loading orders" />;
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  if (orders === null) {
    return (
      <AppShell title="Order Management" subtitle="Review and update order status across all companies" navItems={adminNavigation}>
        <Alert severity="error" action={<Button color="inherit" onClick={() => void loadOrders()}>Retry</Button>}>
          {errorMessage || 'Unable to load orders.'}
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Order Management"
      subtitle="Review and update order status across all companies"
      navItems={adminNavigation}
    >
      <Stack spacing={3}>
        {errorMessage ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => void loadOrders()}>Retry</Button>}>
            {errorMessage}
          </Alert>
        ) : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Orders
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.totalOrders}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Pending Review
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.pendingReview}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Approved / In Fulfillment
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.approvedFlow}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Revenue
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {money(stats.totalRevenue)}
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
            Orders
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Search by order, company, peptide, inventory reference, or user email, then update status.
          </Typography>

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
              label="Filter by status"
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              fullWidth
            >
              <MenuItem value="ALL">All Statuses</MenuItem>
              {statusOptions.map((status) => (
                <MenuItem key={status} value={status}>
                  {statusLabel(status)}
                </MenuItem>
              ))}
            </StyledTextField>
          </FiltersGrid>

          {filteredOrders.length === 0 ? (
            <EmptyWrap>
              <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
                No matching orders found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Adjust filters or wait for new orders to arrive.
              </Typography>
            </EmptyWrap>
          ) : (
            <ScrollableResults
              containerComponent={ListWrap}
              count={filteredOrders.length}
              label="Order records"
              singularLabel="order"
            >
              {filteredOrders.map((order) => {
                const expanded = expandedOrders.has(order.id);
                const trackingOpen = trackingEditors.has(order.id);
                const discountOpen = discountEditors.has(order.id);
                const terminal = ['CANCELLED', 'EXPIRED', 'FULFILLED'].includes(order.status);
                const totalVials = order.items.reduce((sum, item) => sum + Number(item.requested_quantity), 0);
                const shipment = shipmentDrafts[order.id] || shipmentDraft(order);
                const discount = discountDrafts[order.id] || discountDraft(order);
                const availableStatuses = nextStatuses[order.status] || [];
                const selectedStatus = statusDrafts[order.id] || '';
                return (
                  <OrderCard key={order.id}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'flex-start' } }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
                          <Typography component="h3" variant="h6" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{order.order_number}</Typography>
                          <StatusChip status={order.status} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                          {order.company?.name || 'Company'} · {[order.user?.first_name, order.user?.last_name].filter(Boolean).join(' ') || order.user?.email || 'Customer'}
                        </Typography>
                      </Box>
                      <Button
                        variant={expanded ? 'outlined' : 'contained'}
                        endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        aria-expanded={expanded}
                        aria-controls={`order-details-${order.id}`}
                        aria-label={`${expanded ? 'Hide' : 'View'} details for ${order.order_number}`}
                        onClick={() => setExpandedOrders((current) => {
                          const next = new Set(current);
                          if (next.has(order.id)) next.delete(order.id); else next.add(order.id);
                          return next;
                        })}
                        sx={{ minHeight: 46, px: 2.25, alignSelf: { xs: 'stretch', sm: 'flex-start' }, flexShrink: 0, fontWeight: 800, boxShadow: expanded ? 'none' : '0 6px 16px rgba(15, 74, 96, 0.2)' }}
                      >
                        {expanded ? 'Hide details' : 'View details'}
                      </Button>
                    </Stack>

                    <OrderSummaryGrid>
                      <Box><Typography variant="caption" color="text.secondary">Submitted</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{formatDate(order.submitted_at)}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Products</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{order.items.length}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Total vials</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{totalVials.toLocaleString('en-US')}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Final total</Typography><Typography variant="body1" sx={{ fontWeight: 800 }}>{money(order.final_total)}</Typography></Box>
                    </OrderSummaryGrid>

                    <Collapse in={expanded} unmountOnExit>
                      <ExpandedContent id={`order-details-${order.id}`}>
                        <ManagementPanel>
                          <Typography component="h4" variant="subtitle1" sx={{ fontWeight: 800 }}>Order items</Typography>
                          <OrderSummaryGrid sx={{ mt: 1.25 }}>
                            <Box><Typography variant="caption" color="text.secondary">Inventory reference</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{order.batch?.batch_code || 'Direct catalog order'}</Typography></Box>
                            <Box><Typography variant="caption" color="text.secondary">Ship to</Typography><Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{(order.address?.label || 'Address') + (order.address?.line1 ? ` · ${order.address.line1}` : '') + (order.address?.city ? `, ${order.address.city}` : '')}</Typography></Box>
                          </OrderSummaryGrid>
                          <Stack spacing={1} sx={{ mt: 1.5 }}>
                            {order.items.map((item) => <Box key={item.id} sx={{ p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2, backgroundColor: '#FFFFFF' }}><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.peptide?.name || 'Product'}</Typography><Typography variant="body2" color="text.secondary">Requested {Number(item.requested_quantity).toLocaleString('en-US')} · Approved {item.approved_quantity == null ? 'Pending' : Number(item.approved_quantity).toLocaleString('en-US')} · Submitted {money(item.unit_price_at_submission)} · Final {item.unit_price_final == null ? 'Pending' : money(item.unit_price_final)} · Line {money(item.line_total)}</Typography></Box>)}
                          </Stack>
                          {order.user_notes ? <Box sx={{ mt: 1.5 }}><Typography variant="caption" color="text.secondary">Customer notes</Typography><Typography variant="body2" sx={{ mt: 0.25 }}>{order.user_notes}</Typography></Box> : null}
                        </ManagementPanel>

                        <ManagementGrid>
                          <ActionPanel actiontone="pricing">
                            <ActionHeader>
                              <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: 'center' }}><ActionIcon actiontone="pricing"><PercentOutlinedIcon /></ActionIcon><Box><Typography component="h4" variant="subtitle1" sx={{ fontWeight: 800 }}>Pricing &amp; Discount</Typography><Typography variant="caption" color="text.secondary">Review totals or apply an order-level discount.</Typography></Box></Stack>
                              {!terminal && !discountOpen ? <Button variant="outlined" size="small" onClick={() => setDiscountEditors((current) => new Set(current).add(order.id))} sx={{ minHeight: 44 }}>{order.discount_type ? 'Edit discount' : 'Add discount'}</Button> : null}
                            </ActionHeader>
                            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                              <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Subtotal</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{money(order.total_price)}</Typography></Stack>
                              {Number(order.discount_amount) > 0 ? <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Discount</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>−{money(order.discount_amount)}</Typography></Stack> : null}
                              <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 0.75, borderTop: '1px solid #CBD5E1' }}><Typography variant="body1" sx={{ fontWeight: 800 }}>Final total</Typography><Typography variant="h6" sx={{ fontWeight: 800 }}>{money(order.final_total)}</Typography></Stack>
                            </Stack>
                            <Collapse in={discountOpen} unmountOnExit>
                              <EditorFields>
                                <StyledTextField select label="Discount type" value={discount.type} onChange={(event) => setDiscountDrafts((current) => ({ ...current, [order.id]: { ...discount, type: event.target.value as 'PERCENT' | 'FIXED' } }))}><MenuItem value="PERCENT">Percentage</MenuItem><MenuItem value="FIXED">Fixed amount</MenuItem></StyledTextField>
                                <StyledTextField label={discount.type === 'PERCENT' ? 'Discount percent' : 'Discount amount'} type="number" value={discount.value} onChange={(event) => setDiscountDrafts((current) => ({ ...current, [order.id]: { ...discount, value: event.target.value } }))} slotProps={{ htmlInput: { min: 0.01, max: discount.type === 'PERCENT' ? 100 : undefined, step: 0.01 } }} />
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                  <Button variant="contained" onClick={() => void handleSetDiscount(order)} disabled={savingDiscountId === order.id} sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' } }}>{savingDiscountId === order.id ? <CircularProgress size={18} color="inherit" /> : 'Apply discount'}</Button>
                                  <Button variant="outlined" onClick={() => { setDiscountDrafts((current) => ({ ...current, [order.id]: discountDraft(order) })); setDiscountEditors((current) => { const next = new Set(current); next.delete(order.id); return next; }); }} disabled={savingDiscountId === order.id}>Cancel</Button>
                                  {order.discount_type ? <Button color="error" onClick={() => void handleSetDiscount(order, true)} disabled={savingDiscountId === order.id}>Remove discount</Button> : null}
                                </Stack>
                              </EditorFields>
                            </Collapse>
                            {terminal ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Discounts are read-only for {statusLabel(order.status).toLowerCase()} orders.</Typography> : null}
                          </ActionPanel>

                          <ActionPanel actiontone="shipping">
                            <ActionHeader>
                              <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: 'center' }}><ActionIcon actiontone="shipping"><LocalShippingOutlinedIcon /></ActionIcon><Box><Typography component="h4" variant="subtitle1" sx={{ fontWeight: 800 }}>Shipping &amp; Tracking</Typography><Typography variant="caption" color="text.secondary">Add or update carrier and delivery information.</Typography></Box></Stack>
                              {!['CANCELLED', 'EXPIRED'].includes(order.status) && !trackingOpen ? <Button variant="outlined" size="small" onClick={() => setTrackingEditors((current) => new Set(current).add(order.id))} sx={{ minHeight: 44 }}>{order.shipment ? 'Edit tracking' : 'Add tracking'}</Button> : null}
                            </ActionHeader>
                            <OrderSummaryGrid sx={{ mt: 1.25 }}>
                              <Box><Typography variant="caption" color="text.secondary">Carrier</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{order.shipment?.carrier_name || 'Not added'}</Typography></Box>
                              <Box><Typography variant="caption" color="text.secondary">Tracking number</Typography><Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{order.shipment?.tracking_number || 'Not added'}</Typography></Box>
                              <Box><Typography variant="caption" color="text.secondary">Ship date</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatDate(order.shipment?.ship_date)}</Typography></Box>
                              <Box><Typography variant="caption" color="text.secondary">Estimated delivery</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatDate(order.shipment?.estimated_delivery_date)}</Typography></Box>
                            </OrderSummaryGrid>
                            {order.shipment?.shipment_notes ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>{order.shipment.shipment_notes}</Typography> : null}
                            <Collapse in={trackingOpen} unmountOnExit>
                              <EditorFields>
                                <StyledTextField select label="Carrier" value={shipment.carrierChoice} onChange={(event) => setShipmentDrafts((current) => ({ ...current, [order.id]: { ...shipment, carrierChoice: event.target.value } }))}><MenuItem value="">Select carrier</MenuItem>{carriers.map((carrier) => <MenuItem key={carrier} value={carrier}>{carrier}</MenuItem>)}<MenuItem value="Other">Other</MenuItem></StyledTextField>
                                {shipment.carrierChoice === 'Other' ? <StyledTextField label="Custom carrier" value={shipment.customCarrier} onChange={(event) => setShipmentDrafts((current) => ({ ...current, [order.id]: { ...shipment, customCarrier: event.target.value } }))} /> : null}
                                <StyledTextField label="Tracking number" required value={shipment.trackingNumber} onChange={(event) => setShipmentDrafts((current) => ({ ...current, [order.id]: { ...shipment, trackingNumber: event.target.value } }))} />
                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}><StyledTextField label="Ship date" type="date" value={shipment.shipDate} onChange={(event) => setShipmentDrafts((current) => ({ ...current, [order.id]: { ...shipment, shipDate: event.target.value } }))} slotProps={{ inputLabel: { shrink: true } }} /><StyledTextField label="Estimated delivery" type="date" value={shipment.estimatedDeliveryDate} onChange={(event) => setShipmentDrafts((current) => ({ ...current, [order.id]: { ...shipment, estimatedDeliveryDate: event.target.value } }))} slotProps={{ inputLabel: { shrink: true } }} /></Box>
                                <StyledTextField label="Shipment notes (optional)" multiline minRows={2} value={shipment.shipmentNotes} onChange={(event) => setShipmentDrafts((current) => ({ ...current, [order.id]: { ...shipment, shipmentNotes: event.target.value } }))} />
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button variant="contained" onClick={() => void handleSaveShipment(order)} disabled={savingShipmentId === order.id} sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' } }}>{savingShipmentId === order.id ? <CircularProgress size={18} color="inherit" /> : 'Save tracking'}</Button><Button variant="outlined" disabled={savingShipmentId === order.id} onClick={() => { setShipmentDrafts((current) => ({ ...current, [order.id]: shipmentDraft(order) })); setTrackingEditors((current) => { const next = new Set(current); next.delete(order.id); return next; }); }}>Cancel</Button></Stack>
                              </EditorFields>
                            </Collapse>
                            {['CANCELLED', 'EXPIRED'].includes(order.status) ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Shipping information is read-only for {statusLabel(order.status).toLowerCase()} orders.</Typography> : null}
                          </ActionPanel>
                        </ManagementGrid>

                        <ManagementGrid>
                        <ActionPanel actiontone="status">
                          <ActionHeader><Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: 'center' }}><ActionIcon actiontone="status"><SyncAltOutlinedIcon /></ActionIcon><Box><Typography component="h4" variant="subtitle1" sx={{ fontWeight: 800 }}>Order Status</Typography><Typography variant="caption" color="text.secondary">Move the order to its next valid workflow stage.</Typography></Box></Stack></ActionHeader>
                          <StatusActionRow>
                            <Box><Typography variant="caption" color="text.secondary">Current status</Typography><Box sx={{ mt: 0.5 }}><StatusChip status={order.status} /></Box></Box>
                            {availableStatuses.length ? <StyledTextField select label="Change status to" value={selectedStatus} onChange={(event) => { setStatusDrafts((current) => ({ ...current, [order.id]: event.target.value })); setStatusFeedback((current) => { const next = { ...current }; delete next[order.id]; return next; }); }} helperText="Only valid next statuses are shown." sx={{ minWidth: { sm: 240 } }}><MenuItem value="" disabled>Select next status</MenuItem>{availableStatuses.map((status) => <MenuItem key={status} value={status}>{statusLabel(status)}</MenuItem>)}</StyledTextField> : <Typography variant="body2" color="text.secondary">No further status changes are available.</Typography>}
                            {availableStatuses.length ? <Button variant="contained" onClick={() => void handleUpdateStatus(order)} disabled={!selectedStatus || selectedStatus === order.status || submittingOrderId === order.id} sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' }, whiteSpace: 'nowrap' }}>{submittingOrderId === order.id ? <CircularProgress size={18} color="inherit" /> : 'Update status'}</Button> : null}
                          </StatusActionRow>
                          {statusFeedback[order.id] ? <Alert severity={statusFeedback[order.id].severity} sx={{ mt: 1.5 }}>{statusFeedback[order.id].text}</Alert> : null}
                        </ActionPanel>

                        <DangerZone><Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: 'center' }}><Box sx={{ display: 'grid', width: 40, height: 40, flex: '0 0 40px', placeItems: 'center', borderRadius: 2.5, color: 'error.main', backgroundColor: '#FEF2F2' }}><DeleteOutlineIcon /></Box><Box><Typography component="h4" variant="subtitle2" sx={{ fontWeight: 800, color: 'error.main' }}>Delete Order</Typography><Typography variant="body2" color="text.secondary">Permanently remove this order, its product lines, and shipment record.</Typography></Box></Stack><Button color="error" variant="outlined" onClick={() => { setDeleteOrder(order); setDeleteError(''); }} disabled={Boolean(deletingOrderId)} sx={{ minHeight: 44, width: { xs: '100%', sm: 'auto' }, whiteSpace: 'nowrap' }}>Delete order</Button></DangerZone>
                        </ManagementGrid>
                      </ExpandedContent>
                    </Collapse>
                  </OrderCard>
                );
              })}
            </ScrollableResults>
          )}
        </SectionCard>
      </Stack>
      <Dialog
        open={Boolean(deleteOrder)}
        onClose={() => deletingOrderId ? undefined : setDeleteOrder(null)}
        aria-labelledby="delete-order-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="delete-order-title">Delete order {deleteOrder?.order_number}?</DialogTitle>
        <DialogContent>
          <Alert severity="error">
            This permanently deletes the order, its product lines, and its shipment record. This action cannot be undone.
          </Alert>
          {deleteError ? <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOrder(null)} disabled={Boolean(deletingOrderId)}>Keep order</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDeleteOrder()}
            disabled={Boolean(deletingOrderId)}
          >
            {deletingOrderId ? <CircularProgress size={18} color="inherit" /> : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>
      <AppSnackbar {...toast} onClose={closeToast} />
    </AppShell>
  );
}
