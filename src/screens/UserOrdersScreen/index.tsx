'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
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
import { userNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import { singleRelation } from '@/src/lib/supabase/relations';
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
  total_price: number;
  status: string;
  peptide?: {
    name: string;
  } | null;
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

export default function UserOrdersScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

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
          total_price,
          status,
          peptide:peptides(name),
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

      const normalized: OrderRow[] = (data || []).map((row) => {
        const batch = singleRelation(row.batch);
        return {
          ...row,
          peptide: singleRelation(row.peptide),
          batch: batch
            ? { ...batch, peptide: singleRelation(batch.peptide) }
            : null,
          shipment: singleRelation(row.shipment),
        };
      });

      setOrders(normalized);
      setLoading(false);
    };

    loadOrders();
  }, [profile, retryKey, router, sessionLoading]);

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
    return <PageSkeleton label="Loading order history" />;
  }

  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="My Orders"
      subtitle="Track submitted, approved, and fulfilled orders"
      navItems={userNavigation}
    >
      <Stack spacing={3}>
        {errorMessage ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => setRetryKey((key) => key + 1)}>Retry</Button>}>
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
              {stats.submittedCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Approved / In Flow
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.approvedCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Approved Spend
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {money(stats.totalSpend)}
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
            Order History · {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Review your order lifecycle, tracking details, and estimated delivery timeline.
          </Typography>

          {orders.length === 0 ? (
            <EmptyWrap>
              <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
                No orders yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Orders you submit from the dashboard will appear here.
              </Typography>
            </EmptyWrap>
          ) : (
            <>
              <DesktopTableWrap>
                <TableWrap className="record-results" role="region" aria-label="Order history table" tabIndex={0}>
                  <Table sx={{ minWidth: 980 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Order #</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Peptide</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Qty</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Unit Price</TableCell>
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
                            <Typography variant="body1" sx={{ fontWeight: 700 }}>
                              {order.order_number}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            {order.peptide?.name || order.batch?.peptide?.name || '—'}
                          </TableCell>

                          <TableCell>
                            {Number(order.approved_quantity || order.requested_quantity || 0).toLocaleString('en-US')}
                          </TableCell>

                          <TableCell>{money(order.unit_price_at_submission)}</TableCell>

                          <TableCell>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
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
                      sx={{
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      spacing={1.5}
                    >
                      <Box>
                        <Typography component="h3" variant="h6" sx={{ fontWeight: 800 }}>
                          {order.order_number}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {order.peptide?.name || order.batch?.peptide?.name || '—'}
                        </Typography>
                      </Box>

                      <StatusChip status={order.status} />
                    </Stack>

                    <OrderMetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Quantity
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {Number(order.approved_quantity || order.requested_quantity || 0).toLocaleString('en-US')}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Unit Price
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {money(order.unit_price_at_submission)}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {money(order.total_price)}
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
                          ETA
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
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
