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
import { adminNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import ScrollableResults from '@/src/components/feedback/ScrollableResults';
import {
  loadAdminOrders,
  type AdminOrder as OrderRow,
} from '@/src/lib/workspace/loadWorkspace';
import { useSessionStorageState } from '@/src/hooks/useSessionStorageState';
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
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [filters, setFilters] = useSessionStorageState('admin-order-filters', {
    search: '',
    status: 'ALL',
  });
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries((initialOrders || []).map((order) => [order.id, order.status]))
  );
  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const normalized = await loadAdminOrders();
      setOrders(normalized);
      const drafts: Record<string, string> = {};
      normalized.forEach((order) => {
        drafts[order.id] = order.status;
      });
      setStatusDrafts(drafts);
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
      ['APPROVED', 'IN_PRODUCTION'].includes(order.status)
    ).length;

    const fulfilled = resolvedOrders.filter((order) => order.status === 'FULFILLED').length;

    const totalRevenue = resolvedOrders
      .filter((order) => ['APPROVED', 'IN_PRODUCTION', 'FULFILLED'].includes(order.status))
      .reduce((sum, order) => sum + Number(order.total_price || 0), 0);

    return {
      totalOrders: resolvedOrders.length,
      pendingReview,
      approvedFlow,
      fulfilled,
      totalRevenue,
    };
  }, [resolvedOrders]);

  const handleUpdateStatus = async (order: OrderRow) => {
    const nextStatus = statusDrafts[order.id] as
      | 'SUBMITTED'
      | 'UNDER_REVIEW'
      | 'APPROVED'
      | 'IN_PRODUCTION'
      | 'FULFILLED'
      | 'CANCELLED'
      | 'EXPIRED';

    if (!nextStatus || nextStatus === order.status) {
      setMessage('No status change to save.');
      return;
    }

    setSubmittingOrderId(order.id);
    setMessage('');
    setErrorMessage('');

    const { error } = await supabase.rpc('admin_update_order_status', {
      p_order_id: order.id,
      p_new_status: nextStatus,
    });

    if (error) {
      setErrorMessage(error.message);
      setSubmittingOrderId(null);
      return;
    }

    setMessage(`Order ${order.order_number} updated to ${nextStatus}.`);
    setOrders((current) =>
      current
        ? current.map((item) =>
            item.id === order.id ? { ...item, status: nextStatus } : item
          )
        : current
    );
    setSubmittingOrderId(null);
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
        {message ? <Alert severity="success">{message}</Alert> : null}
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
              Approved / In Production
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
                      <Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>
                        {order.order_number}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {order.company?.name || 'Company'} · {order.items.length} {order.items.length === 1 ? 'product' : 'products'}
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
                        Inventory Reference
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.batch?.batch_code || 'Direct catalog order'}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Total Vials
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.items.reduce((sum, item) => sum + Number(item.requested_quantity), 0).toLocaleString('en-US')} units
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Products
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {order.items.length}
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

                  <Box component="details" sx={{ mt: 2 }}>
                    <Typography
                      component="summary"
                      variant="body2"
                      sx={{ cursor: 'pointer', fontWeight: 800, width: 'fit-content' }}
                    >
                      View product breakdown
                    </Typography>
                    <Stack spacing={1} sx={{ mt: 1.5 }}>
                      {order.items.map((item) => (
                        <Box key={item.id} sx={{ p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {item.peptide?.name || 'Product'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Requested {Number(item.requested_quantity).toLocaleString('en-US')} · Approved {item.approved_quantity == null ? 'Pending' : Number(item.approved_quantity).toLocaleString('en-US')} · Submitted {money(item.unit_price_at_submission)} · Final {item.unit_price_final == null ? 'Pending' : money(item.unit_price_final)} · Line {money(item.line_total)}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>

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
            </ScrollableResults>
          )}
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
