'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import {
  DesktopTableWrap,
  EmptyWrap,
  MobileCardList,
  MobileOrderCard,
  OrderMetaGrid,
  SectionCard,
  StatCard,
  StatsGrid,
  TableWrap,
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
  submitted_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  batch?: {
    peptide?: {
      name: string;
    } | null;
    eta_date?: string | null;
  } | null;
  shipment?: {
    tracking_number: string | null;
    estimated_delivery_date: string | null;
    carrier_name: string | null;
  } | null;
};

const userNavItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Wishlist', href: '/wishlist' },
  { label: 'Peptides', href: '/peptides' },
  { label: 'My Orders', href: '/my-orders' },
  { label: 'Account', href: '/account' },
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

export default function UserOrdersScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

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
          submitted_at,
          reviewed_at,
          approved_at,
          fulfilled_at,
          cancelled_at,
          batch:batches(
            eta_date,
            peptide:peptides(name)
          ),
          shipment:shipments(
            tracking_number,
            estimated_delivery_date,
            carrier_name
          )
        `)
        .eq('user_id', profile.id)
        .order('submitted_at', { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      const normalized: OrderRow[] = (data || []).map((row: any) => ({
        ...row,
        batch: Array.isArray(row.batch) ? row.batch[0] : row.batch,
        shipment: Array.isArray(row.shipment) ? row.shipment[0] : row.shipment,
      }));

      setOrders(normalized);
      setLoading(false);
    };

    loadOrders();
  }, [profile, router, sessionLoading]);

  const stats = useMemo(() => {
    const submittedCount = orders.filter((order) =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes(order.status)
    ).length;

    const approvedCount = orders.filter((order) =>
      ['APPROVED', 'IN_PRODUCTION', 'FULFILLED'].includes(order.status)
    ).length;

    const fulfilledCount = orders.filter((order) => order.status === 'FULFILLED').length;

    const totalSpend = orders
      .filter((order) => ['APPROVED', 'IN_PRODUCTION', 'FULFILLED'].includes(order.status))
      .reduce((sum, order) => sum + Number(order.total_price || 0), 0);

    return {
      totalOrders: orders.length,
      submittedCount,
      approvedCount,
      fulfilledCount,
      totalSpend,
    };
  }, [orders]);

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
          <Typography color="text.secondary">Loading orders...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="My Orders"
      subtitle="Track submitted, approved, and fulfilled orders"
      navItems={userNavItems}
    >
      <Stack spacing={3}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Total Orders
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.totalOrders}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Pending Review
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.submittedCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Approved / In Flow
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {stats.approvedCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Approved Spend
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>
              {money(stats.totalSpend)}
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Typography variant="h5" fontWeight={800}>
            Order History
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Review your order lifecycle, tracking details, and estimated delivery timeline.
          </Typography>

          {orders.length === 0 ? (
            <EmptyWrap>
              <Typography variant="h6" fontWeight={700}>
                No orders yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Orders you submit from the dashboard will appear here.
              </Typography>
            </EmptyWrap>
          ) : (
            <>
              <DesktopTableWrap>
                <TableWrap>
                  <Table sx={{ minWidth: 980 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Order #</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Peptide</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Qty</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Tracking</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>ETA</TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id} hover>
                          <TableCell>
                            <Typography variant="body1" fontWeight={700}>
                              {order.order_number}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            {order.batch?.peptide?.name || '—'}
                          </TableCell>

                          <TableCell>
                            {Number(order.approved_quantity || order.requested_quantity || 0).toLocaleString()}
                          </TableCell>

                          <TableCell>
                            <Typography variant="body1" fontWeight={600}>
                              {money(order.total_price)}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <StatusChip status={order.status} />
                          </TableCell>

                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {order.shipment?.tracking_number || 'Pending'}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            {formatDate(
                              order.shipment?.estimated_delivery_date || order.batch?.eta_date
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrap>
              </DesktopTableWrap>

              <MobileCardList>
                {orders.map((order) => (
                  <MobileOrderCard key={order.id}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      spacing={1.5}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={800}>
                          {order.order_number}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {order.batch?.peptide?.name || '—'}
                        </Typography>
                      </Box>

                      <StatusChip status={order.status} />
                    </Stack>

                    <OrderMetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Quantity
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {Number(order.approved_quantity || order.requested_quantity || 0).toLocaleString()}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {money(order.total_price)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Tracking
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {order.shipment?.tracking_number || 'Pending'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          ETA
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {formatDate(
                            order.shipment?.estimated_delivery_date || order.batch?.eta_date
                          )}
                        </Typography>
                      </Box>
                    </OrderMetaGrid>
                  </MobileOrderCard>
                ))}
              </MobileCardList>
            </>
          )}
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
