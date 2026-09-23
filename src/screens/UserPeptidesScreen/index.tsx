'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import StatusChip from '@/src/commons/StatusChip';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
import { userNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import ScrollableResults from '@/src/components/feedback/ScrollableResults';
import { useSessionStorageState } from '@/src/hooks/useSessionStorageState';
import {
  EmptyWrap,
  SectionCard,
  StatCard,
  StatsGrid,
  TableWrap,
} from './styles';

type PeptideRow = {
  id: string;
  name: string;
  default_unit_price: number;
  is_active: boolean;
  created_at?: string;
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function UserPeptidesScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [peptides, setPeptides] = useState<PeptideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [search, setSearch] = useSessionStorageState('customer-peptide-search', '');

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

    const loadPeptides = async () => {
      setLoading(true);
      setErrorMessage('');

      const { data, error } = await supabase
        .from('peptides')
        .select('id, name, default_unit_price, is_active, created_at')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      setPeptides(data || []);
      setLoading(false);
    };

    loadPeptides();
  }, [profile, retryKey, router, sessionLoading]);

  const stats = useMemo(() => {
    const activeCount = peptides.filter((item) => item.is_active).length;
    const avgPrice =
      peptides.length > 0
        ? peptides.reduce((sum, item) => sum + Number(item.default_unit_price || 0), 0) /
          peptides.length
        : 0;

    const highestPrice =
      peptides.length > 0
        ? Math.max(...peptides.map((item) => Number(item.default_unit_price || 0)))
        : 0;

    return {
      activeCount,
      avgPrice,
      highestPrice,
    };
  }, [peptides]);

  const filteredPeptides = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? peptides.filter((peptide) => peptide.name.toLowerCase().includes(query)) : peptides;
  }, [peptides, search]);

  if (sessionLoading || loading) {
    return <PageSkeleton cards={3} label="Loading peptide catalog" />;
  }

  if (!profile || profile.role !== 'USER' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Peptide Catalog"
      subtitle="Available peptides and default pricing"
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
              Active Peptides
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.activeCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Average Default Price
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {money(stats.avgPrice)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Per unit
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Highest Default Price
            </Typography>
            <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {money(stats.highestPrice)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Per unit
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
            Available Peptides
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Review current active peptides and their default unit pricing.
          </Typography>

          <TextField
            label="Search products"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
            sx={{ mt: 2 }}
          />

          {filteredPeptides.length === 0 ? (
            <EmptyWrap>
              <Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>
                {peptides.length === 0 ? 'No active peptides found' : 'No matching products'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {peptides.length === 0
                  ? 'Once peptides are activated by an admin, they will appear here.'
                  : 'Try a different product name.'}
              </Typography>
            </EmptyWrap>
          ) : (
              <ScrollableResults
                containerComponent={TableWrap}
                count={filteredPeptides.length}
                direction="both"
                label="Peptide pricing table"
                singularLabel="product"
              >
                <Table sx={{ minWidth: 700 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Peptide</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Default Price</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Availability</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {filteredPeptides.map((peptide) => (
                    <TableRow key={peptide.id} hover>
                      <TableCell>
                        <Typography variant="body1" sx={{ fontWeight: 700 }}>
                          {peptide.name}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {money(peptide.default_unit_price)} / unit
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <StatusChip status={peptide.is_active ? 'ACTIVE' : 'SUSPENDED'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </ScrollableResults>
          )}
        </SectionCard>
      </Stack>
    </AppShell>
  );
}
