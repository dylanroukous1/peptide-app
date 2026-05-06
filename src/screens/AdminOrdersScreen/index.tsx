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
  ActionsGrid,
  EmptyWrap,
  FiltersGrid,
  ListWrap,
  MetaGrid,
  OrderCard,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
} from './styles';

type OrderRow = {
  id: string;
  order_number: string;
  requested_quantity: number;
  approved_quantity: number | null;
  unit_price_at_submission: number;
  unit_price_final: number | null;
  total_price: number;
  status: string;
  user_notes: string | null;
  internal_notes: string | null;
  reservation_expires_at: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  company?: { name: string } | null;
  user?: {
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
  batch?: {
    batch_code: string;
    eta_date: string | null;
    peptide?: { name: string } | null;
  } | null;
  address?: {
    label: string | null;
    line1: string;
    city: string;
  } | null;
  shipment?: {
    tracking_number: string | null;
    estimated_delivery_date: string | null;
    carrier_name: string | null;
  } | null;
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

const statusOptions = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'IN_PRODUCTION',
  'FULFILLED',
  'CANCELLED',
  'EXPIRED',
];

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
  return date.toLocaleDateString();
}

export default function AdminOrdersScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'ALL',
  });
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        requested_quantity,
        approved_quantity,
        unit_price_at_submission,
        unit_price_final,
        total_price,
        status,
        user_notes,
        internal_notes,
        reservation_expires_at,
        submitted_at,
        reviewed_at,
        approved_at,
        fulfilled_at,
        cancelled_at,
        company:companies(name),
        user:profiles(first_name, last_name, email),
        batch:batches(
          batch_code,
          eta_date,
          peptide:peptides(name)
        ),
        address:company_addresses(label, line1, city),
        shipment:shipments(tracking_number, estimated_delivery_date, carrier_name)
      `)
      .order('submitted_at', { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const normalized: OrderRow[] = (data || []).map((row: any) => ({
      ...row,
      company: Array.isArray(row.company) ? row.company[0] : row.company,
      user: Array.isArray(row.user) ? row.user[0] : row.user,
      batch: Array.isArray(row.batch) ? row.batch[0] : row.batch,
      address: Array.isArray(row.address) ? row.address[0] : row.address,
      shipment: Array.isArray(row.shipment) ? row.shipment[0] : row.shipment,
    }));

    setOrders(normalized);

    const drafts: Record<string, string> = {};
    normalized.forEach((order) => {
      drafts[order.id] = order.status;
    });
    setStatusDrafts(drafts);

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

    loadOrders();
  }, [profile, router, sessionLoading]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus =
        filters.status === 'ALL' || order.status === filters.status;

      const haystack = [
        order.order_number,
        order.company?.name || '',
        order.batch?.peptide?.name || '',
        order.batch?.batch_code || '',
        order.user?.email || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = haystack.includes(filters.search.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [filters.search, filters.status, orders]);

  const stats = useMemo(() => {
    const pendingReview = orders.filter((order) =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes(order.status)
    ).length;

    const approvedFlow = orders.filter((order) =>
      ['APPROVED', 'IN_PRODUCTION'].includes(order.status)
    ).length;

    const fulfilled = orders.filter((order) => order.status === 'FULFILLED').length;

    const totalRevenue = orders
      .filter((order) => ['APPROVED', 'IN_PRODUCTION', 'FULFILLED'].includes(order.status))
      .reduce((sum, order) => sum + Number(order.total_price || 0), 0);

    return {
      totalOrders: orders.length,
      pendingReview,
      approvedFlow,
      fulfilled,
      totalRevenue,
    };
  }, [orders]);

  const handleUpdateStatus = async (order: OrderRow) => {
    const nextStatus = statusDrafts[order.id];

    if (!nextStatus || nextStatus === order.status) {
      setMessage('No status change to save.');
      return;
    }

    setSubmittingOrderId(order.id);
    setMessage('');
    setErrorMessage('');

    const updatePayload: Record<string, any> = {
      status: nextStatus,
    };

    if (nextStatus === 'UNDER_REVIEW') {
      updatePayload.reviewed_at = new Date().toISOString();
    }

    if (nextStatus === 'APPROVED') {
      updatePayload.reviewed_at = order.reviewed_at || new Date().toISOString();
      updatePayload.approved_at = new Date().toISOString();
      updatePayload.approved_quantity = order.requested_quantity;
      updatePayload.unit_price_final =
        order.unit_price_final || order.unit_price_at_submission;
    }

    if (nextStatus === 'FULFILLED') {
      updatePayload.fulfilled_at = new Date().toISOString();
    }

    if (nextStatus === 'CANCELLED' || nextStatus === 'EXPIRED') {
      updatePayload.cancelled_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', order.id);

    if (error) {
      setErrorMessage(error.message);
      setSubmittingOrderId(null);
      return;
    }

    setMessage(`Order ${order.order_number} updated to ${nextStatus}.`);
    setSubmittingOrderId(null);
    await loadOrders();
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
          <Typography color="text.secondary">Loading orders admin...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Order Management"
      subtitle="Review and update order status across all companies"
      navItems={adminNavItems}
    >
      <Stack spacing={3}>
        {message ? <Alert severity="success">{message}</Alert> : null}
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Orders
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.totalOrders}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Pending Review
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.pendingReview}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Approved / In Production
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.approvedFlow}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Revenue
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {money(stats.totalRevenue)}
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Orders
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Search by order, company, peptide, batch code, or user email, then update status.
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
              label="Status"
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              fullWidth
            >
              <MenuItem value="ALL">All Statuses</MenuItem>
              {statusOptions.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </StyledTextField>
          </FiltersGrid>

          {filteredOrders.length === 0 ? (
            <EmptyWrap>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No matching orders found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Adjust filters or wait for new orders to arrive.
              </Typography>
            </EmptyWrap>
          ) : (
            <ListWrap>
              {filteredOrders.map((order) => (
                <OrderCard key={order.id}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                    }}
                    spacing={1.5}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {order.order_number}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {order.company?.name || 'Company'} · {order.batch?.peptide?.name || 'Peptide'}
                      </Typography>
                    </Box>

                    <StatusChip status={order.status} />
                  </Stack>

                  <MetaGrid>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        User
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.user?.first_name || ''} {order.user?.last_name || ''}
                        {order.user?.email ? ` · ${order.user.email}` : ''}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Batch Code
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.batch?.batch_code || '—'}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Quantity
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {Number(order.approved_quantity || order.requested_quantity || 0).toLocaleString()} units
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Total Price
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {money(order.total_price)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Submitted
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatDate(order.submitted_at)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        ETA
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatDate(
                          order.shipment?.estimated_delivery_date || order.batch?.eta_date
                        )}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Tracking
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.shipment?.tracking_number || 'Pending'}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Carrier
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.shipment?.carrier_name || '—'}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Ship To
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {(order.address?.label || 'Address') +
                          (order.address?.line1 ? ` · ${order.address.line1}` : '') +
                          (order.address?.city ? `, ${order.address.city}` : '')}
                      </Typography>
                    </Box>
                  </MetaGrid>

                  {order.user_notes ? (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        User Notes
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {order.user_notes}
                      </Typography>
                    </Box>
                  ) : null}

                  <ActionsGrid>
                    <StyledTextField
                      select
                      label="Update Status"
                      value={statusDrafts[order.id] || order.status}
                      onChange={(e) =>
                        setStatusDrafts((prev) => ({
                          ...prev,
                          [order.id]: e.target.value,
                        }))
                      }
                      fullWidth
                    >
                      {statusOptions.map((status) => (
                        <MenuItem key={status} value={status}>
                          {status}
                        </MenuItem>
                      ))}
                    </StyledTextField>

                    <Button
                      variant="contained"
                      onClick={() => handleUpdateStatus(order)}
                      disabled={submittingOrderId === order.id}
                      sx={{
                        minHeight: 56,
                        borderRadius: 4,
                        textTransform: 'none',
                        fontWeight: 700,
                      }}
                    >
                      {submittingOrderId === order.id ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        'Save Status'
                      )}
                    </Button>
                  </ActionsGrid>
                </OrderCard>
              ))}
            </ListWrap>
          )}
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
