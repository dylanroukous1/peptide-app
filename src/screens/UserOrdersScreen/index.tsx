'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import { userNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import ScrollableResults from '@/src/components/feedback/ScrollableResults';
import AppSnackbar from '@/src/commons/AppSnackBar';
import { useAppToast } from '@/src/hooks/useAppToast';
import { singleRelation } from '@/src/lib/supabase/relations';
import { EmptyWrap, MobileOrderCard, OrderMetaGrid, SectionCard, StatCard, StatsGrid } from './styles';

type OrderItemRow = { id: string; requested_quantity: number; approved_quantity: number | null; unit_price_at_submission: number; unit_price_final: number | null; line_total: number; peptide?: { name: string } | null };
type OrderRow = { id: string; order_number: string; total_price: number; discount_type: 'PERCENT' | 'FIXED' | null; discount_value: number | null; discount_amount: number; final_total: number; status: string; submitted_at: string; items: OrderItemRow[]; company?: { name: string } | null; user?: { first_name: string; last_name: string; email: string | null } | null; batch?: { eta_date?: string | null } | null; shipment?: { tracking_number: string | null; ship_date: string | null; estimated_delivery_date: string | null; carrier_name: string | null; shipment_notes: string | null } | null };

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));
}
function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { timeZone: 'UTC' });
}
function trackingUrl(carrier?: string | null, tracking?: string | null) {
  if (!carrier || !tracking) return null;
  const number = encodeURIComponent(tracking.trim());
  const normalized = carrier.trim().toUpperCase();
  if (normalized === 'UPS') return `https://www.ups.com/track?tracknum=${number}`;
  if (normalized === 'FEDEX') return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
  if (normalized === 'USPS') return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
  if (normalized === 'DHL') return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${number}`;
  return null;
}

export default function UserOrdersScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const { toast, showToast, closeToast } = useAppToast();

  useEffect(() => {
    if (sessionLoading) return;
    if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
      router.replace('/login');
      return;
    }
    const loadOrders = async () => {
      setLoading(true);
      setErrorMessage('');
      const { data, error } = await supabase
        .from('orders')
        .select(`id, order_number, total_price, discount_type, discount_value, discount_amount, final_total, status, submitted_at,
          items:order_items(id, requested_quantity, approved_quantity, unit_price_at_submission, unit_price_final, line_total, peptide:peptides(name)),
          company:companies(name), user:profiles!orders_user_id_fkey(first_name, last_name, email),
          batch:batches(eta_date), shipment:shipments(tracking_number, ship_date, estimated_delivery_date, carrier_name, shipment_notes)`)
        .eq('user_id', profile.id)
        .order('submitted_at', { ascending: false });
      if (error) {
        setOrders(null);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }
      setOrders((data || []).map((row) => ({
        ...row,
        items: (row.items || []).map((item) => ({ ...item, peptide: singleRelation(item.peptide) })),
        company: singleRelation(row.company),
        user: singleRelation(row.user),
        batch: singleRelation(row.batch),
        shipment: singleRelation(row.shipment),
      })));
      setLoading(false);
    };
    void loadOrders();
  }, [profile, retryKey, router, sessionLoading]);

  useEffect(() => {
    if (loading || !orders?.length || !window.location.hash) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, orders]);

  const resolvedOrders = useMemo(() => orders ?? [], [orders]);
  const stats = useMemo(() => ({
    totalOrders: resolvedOrders.length,
    submittedCount: resolvedOrders.filter((order) => ['SUBMITTED', 'UNDER_REVIEW'].includes(order.status)).length,
    approvedCount: resolvedOrders.filter((order) => ['APPROVED', 'IN_PRODUCTION', 'SHIPPED', 'FULFILLED'].includes(order.status)).length,
    totalSpend: resolvedOrders.filter((order) => ['APPROVED', 'IN_PRODUCTION', 'SHIPPED', 'FULFILLED'].includes(order.status)).reduce((sum, order) => sum + Number(order.final_total || 0), 0),
  }), [resolvedOrders]);

  if (sessionLoading || loading) return <PageSkeleton label="Loading order history" />;
  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') return null;
  if (orders === null) {
    return (
      <AppShell title="My Orders" subtitle="Track submitted, approved, and fulfilled orders" navItems={userNavigation}>
        <Alert severity="error" action={<Button color="inherit" onClick={() => setRetryKey((key) => key + 1)}>Retry</Button>}>
          {errorMessage || 'Unable to load order history.'}
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell title="My Orders" subtitle="Track submitted, approved, and fulfilled orders" navItems={userNavigation}>
      <Stack spacing={3}>
        {errorMessage ? <Alert severity="error" action={<Button color="inherit" onClick={() => setRetryKey((key) => key + 1)}>Retry</Button>}>{errorMessage}</Alert> : null}
        <StatsGrid>
          {[['Total Orders', stats.totalOrders], ['Pending Review', stats.submittedCount], ['Approved / In Flow', stats.approvedCount], ['Approved Spend', money(stats.totalSpend)]].map(([label, value]) => (
            <StatCard key={label}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{value}</Typography></StatCard>
          ))}
        </StatsGrid>
        <SectionCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Order History</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Review order totals, product lines, tracking and status.</Typography>
          {resolvedOrders.length === 0 ? (
            <EmptyWrap><Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>No orders yet</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Submitted orders will appear here.</Typography></EmptyWrap>
          ) : (
            <ScrollableResults
              containerClassName="order-history-results"
              count={resolvedOrders.length}
              label="Customer order history"
              singularLabel="order"
            >
              {resolvedOrders.map((order) => {
                const totalVials = order.items.reduce((sum, item) => sum + Number(item.requested_quantity), 0);
                return (
                  <MobileOrderCard key={order.id} id={`order-${order.id}`} sx={{ scrollMarginTop: 24, '&:target': { outline: '3px solid #38BDF8', outlineOffset: 2 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}>
                      <Box><Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>{order.order_number}</Typography><Typography variant="body2" color="text.secondary">Submitted {formatDate(order.submitted_at)}</Typography></Box>
                      <StatusChip status={order.status} />
                    </Stack>
                    <OrderMetaGrid>
                      <Box><Typography variant="caption" color="text.secondary">Company / Customer</Typography><Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{order.company?.name || 'Company'} · {[order.user?.first_name, order.user?.last_name].filter(Boolean).join(' ') || order.user?.email || 'Customer'}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Products</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{order.items.length}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Total Vials</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{totalVials.toLocaleString('en-US')}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Final Total</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{money(order.final_total)}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Tracking</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{order.shipment?.tracking_number || 'Pending'}</Typography></Box>
                    </OrderMetaGrid>
                    <Box sx={{ mt: 2, p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2, backgroundColor: '#F8FAFC' }}>
                      <Typography component="h4" variant="subtitle2" sx={{ fontWeight: 800 }}>Order totals</Typography>
                      <Stack spacing={0.75} sx={{ mt: 1 }}>
                        <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Subtotal</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{money(order.total_price)}</Typography></Stack>
                        {Number(order.discount_amount) > 0 ? <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Discount</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>−{money(order.discount_amount)}</Typography></Stack> : null}
                        <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2" sx={{ fontWeight: 800 }}>Final total</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{money(order.final_total)}</Typography></Stack>
                      </Stack>
                    </Box>
                    <Box sx={{ mt: 2, p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2 }}>
                      <Typography component="h4" variant="subtitle2" sx={{ fontWeight: 800 }}>Shipping &amp; Tracking</Typography>
                      {!order.shipment?.tracking_number ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{order.status === 'CANCELLED' ? 'Order cancelled — no shipment will be created.' : order.status === 'EXPIRED' ? 'Order expired — no shipment was created.' : order.status === 'FULFILLED' ? 'Delivered' : order.status === 'SHIPPED' ? 'Shipped' : 'Preparing shipment'}</Typography>
                      ) : (
                        <Stack spacing={0.75} sx={{ mt: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{order.status === 'FULFILLED' ? 'Delivered' : order.shipment.estimated_delivery_date ? `Estimated delivery: ${formatDate(order.shipment.estimated_delivery_date)}` : 'Shipped'}</Typography>
                          <Typography variant="body2">Carrier: {order.shipment.carrier_name || '—'}</Typography>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                            {trackingUrl(order.shipment.carrier_name, order.shipment.tracking_number) ? <Button component="a" href={trackingUrl(order.shipment.carrier_name, order.shipment.tracking_number) || undefined} target="_blank" rel="noopener noreferrer" size="small">{order.shipment.tracking_number}</Button> : <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{order.shipment.tracking_number}</Typography>}
                            <Button size="small" variant="outlined" onClick={() => void navigator.clipboard.writeText(order.shipment?.tracking_number || '').then(() => showToast('Tracking number copied.')).catch(() => showToast('Unable to copy tracking number.', 'error'))}>Copy tracking</Button>
                          </Stack>
                          {order.shipment.ship_date ? <Typography variant="body2" color="text.secondary">Shipped {formatDate(order.shipment.ship_date)}</Typography> : null}
                          {order.shipment.shipment_notes ? <Typography variant="body2" color="text.secondary">{order.shipment.shipment_notes}</Typography> : null}
                        </Stack>
                      )}
                    </Box>
                    <Box component="details" sx={{ mt: 2 }}>
                      <Typography component="summary" variant="body2" sx={{ fontWeight: 800, cursor: 'pointer', width: 'fit-content' }}>View {order.items.length} product {order.items.length === 1 ? 'line' : 'lines'}</Typography>
                      <Stack spacing={1} sx={{ mt: 1.5 }}>
                        {order.items.map((item) => (
                          <Box key={item.id} sx={{ p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.peptide?.name || 'Product'}</Typography>
                            <Typography variant="body2" color="text.secondary">Requested {Number(item.requested_quantity).toLocaleString('en-US')} · Approved {item.approved_quantity == null ? 'Pending' : Number(item.approved_quantity).toLocaleString('en-US')} · Submitted {money(item.unit_price_at_submission)} · Final {item.unit_price_final == null ? 'Pending' : money(item.unit_price_final)} · Line {money(item.line_total)}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  </MobileOrderCard>
                );
              })}
            </ScrollableResults>
          )}
        </SectionCard>
      </Stack>
      <AppSnackbar {...toast} onClose={closeToast} />
    </AppShell>
  );
}
