'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { useSessionStorageState } from '@/src/hooks/useSessionStorageState';
import { supabase } from '@/src/supabase/client';
import { adminNavigation } from '@/src/config/navigation';
import PageSkeleton from '@/src/components/feedback/PageSkeleton';
import ScrollableResults from '@/src/components/feedback/ScrollableResults';
import { singleRelation } from '@/src/lib/supabase/relations';
import {
  type AuditReferences,
  auditActorLabel,
  formatAuditMessage,
  humanizeAuditValue,
  sanitizeAuditDetails,
} from '@/src/lib/audit/formatAuditEvent';
import {
  EmptyWrap,
  JsonPreviewBox,
  ListWrap,
  LogCard,
  MetaGrid,
  PageGrid,
  SectionCard,
  StatCard,
  StatsGrid,
  StyledTextField,
} from './styles';

type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
};

type EmailEventRow = {
  id: string;
  type: string;
  to: string;
  subject: string;
  order_id: string | null;
  created_at: string;
};

const emptyReferences: AuditReferences = {
  actors: {},
  orders: {},
  peptides: {},
  companies: {},
  users: {},
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function safePreview(value: unknown) {
  if (!value) return 'None';
  try {
    return JSON.stringify(sanitizeAuditDetails(value), null, 2);
  } catch {
    return 'Unable to display details';
  }
}

export default function AdminAuditScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [emailEvents, setEmailEvents] = useState<EmailEventRow[]>([]);
  const [references, setReferences] = useState<AuditReferences>(emptyReferences);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useSessionStorageState('admin-audit-search', '');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (sessionLoading) return;
    if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
      router.replace('/login');
      return;
    }

    const loadAuditPage = async () => {
      setLoading(true);
      setErrorMessage('');
      const [auditResult, emailResult] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('email_events')
          .select('id, type, to, subject, order_id, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (auditResult.error || emailResult.error) {
        setErrorMessage(auditResult.error?.message || emailResult.error?.message || 'Failed to load activity.');
        setLoading(false);
        return;
      }

      const logs = (auditResult.data || []) as AuditLogRow[];
      const emails = (emailResult.data || []) as EmailEventRow[];
      const idsFor = (type: string) =>
        [...new Set(logs.filter((row) => row.entity_type.toLowerCase() === type).map((row) => row.entity_id))];
      const actorIds = [...new Set(logs.map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
      const orderIds = [...new Set([...idsFor('order'), ...emails.map((row) => row.order_id).filter((id): id is string => Boolean(id))])];
      const profileIds = [...new Set([...actorIds, ...idsFor('profile'), ...idsFor('user')])];
      const peptideIds = idsFor('peptide');
      const companyIds = idsFor('company');

      const [profileResult, orderResult, peptideResult, companyResult] = await Promise.all([
        profileIds.length
          ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', profileIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? supabase
              .from('orders')
              .select('id, order_number, total_price, peptide:peptides(name), items:order_items(requested_quantity, peptide:peptides(name))')
              .in('id', orderIds)
          : Promise.resolve({ data: [], error: null }),
        peptideIds.length
          ? supabase.from('peptides').select('id, name').in('id', peptideIds)
          : Promise.resolve({ data: [], error: null }),
        companyIds.length
          ? supabase.from('companies').select('id, name').in('id', companyIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const referenceError = profileResult.error || orderResult.error || peptideResult.error || companyResult.error;
      if (referenceError) {
        setErrorMessage(referenceError.message);
        setLoading(false);
        return;
      }

      const nextReferences: AuditReferences = { actors: {}, orders: {}, peptides: {}, companies: {}, users: {} };
      for (const user of profileResult.data || []) {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        const label = fullName || user.email || 'Unknown administrator';
        nextReferences.actors[user.id] = label;
        nextReferences.users[user.id] = user.email || label;
      }
      for (const order of orderResult.data || []) {
        const items = order.items || [];
        const firstItemProduct = items[0] ? singleRelation(items[0].peptide)?.name : undefined;
        nextReferences.orders[order.id] = {
          orderNumber: order.order_number,
          productName: firstItemProduct || singleRelation(order.peptide)?.name,
          itemCount: items.length || 1,
          totalQuantity: items.reduce(
            (sum, item) => sum + Number(item.requested_quantity || 0),
            0
          ),
          totalPrice: Number(order.total_price || 0),
        };
      }
      for (const peptide of peptideResult.data || []) nextReferences.peptides[peptide.id] = peptide.name;
      for (const company of companyResult.data || []) nextReferences.companies[company.id] = company.name;

      setAuditLogs(logs);
      setEmailEvents(emails);
      setReferences(nextReferences);
      setLoading(false);
    };

    void loadAuditPage();
  }, [profile, retryKey, router, sessionLoading]);

  const query = search.trim().toLowerCase();
  const filteredAuditLogs = useMemo(
    () => auditLogs.filter((row) => {
      const message = formatAuditMessage(row, references);
      return [message, auditActorLabel(row.actor_user_id, references), row.action]
        .join(' ')
        .toLowerCase()
        .includes(query);
    }),
    [auditLogs, query, references]
  );
  const filteredEmailEvents = useMemo(
    () => emailEvents.filter((row) => {
      const orderNumber = row.order_id ? references.orders[row.order_id]?.orderNumber || '' : '';
      return [row.to, row.subject, humanizeAuditValue(row.type), orderNumber]
        .join(' ')
        .toLowerCase()
        .includes(query);
    }),
    [emailEvents, query, references]
  );
  const stats = useMemo(() => ({
    total: auditLogs.length + emailEvents.length,
    ordersPlaced: auditLogs.filter((row) => ['ORDER_SUBMITTED', 'ORDER_CREATED'].includes(row.action.toUpperCase())).length,
    statusChanges: auditLogs.filter((row) => row.action.toUpperCase() === 'ORDER_STATUS_UPDATED').length,
    emailsSent: emailEvents.length,
  }), [auditLogs, emailEvents]);

  if (sessionLoading || loading) return <PageSkeleton label="Loading activity" />;
  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') return null;

  return (
    <AppShell title="Activity" subtitle="Understand important account, order, company and email activity" navItems={adminNavigation}>
      <Stack spacing={3}>
        {errorMessage ? <Alert severity="error" action={<Button color="inherit" onClick={() => setRetryKey((key) => key + 1)}>Retry</Button>}>{errorMessage}</Alert> : null}
        <StatsGrid>
          {[
            ['Total Activity', stats.total],
            ['Orders Placed', stats.ordersPlaced],
            ['Order Status Changes', stats.statusChanges],
            ['Emails Sent', stats.emailsSent],
          ].map(([label, value]) => (
            <StatCard key={label}>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
              <Typography component="p" variant="h4" sx={{ mt: 1, fontWeight: 800 }}>{value}</Typography>
            </StatCard>
          ))}
        </StatsGrid>

        <SectionCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Find activity</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Search by person, order number, product, company, recipient or action.
          </Typography>
          <StyledTextField label="Search activity" value={search} onChange={(event) => setSearch(event.target.value)} fullWidth sx={{ mt: 2 }} />
        </SectionCard>

        <PageGrid>
          <SectionCard>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>
              Operational Activity
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Who acted, what changed, which record was affected and when.</Typography>
            {filteredAuditLogs.length === 0 ? (
              <EmptyWrap><Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>No matching activity</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Try a different person, order, product, company or action.</Typography></EmptyWrap>
            ) : (
              <ScrollableResults
                containerComponent={ListWrap}
                count={filteredAuditLogs.length}
                label="Operational activity"
                singularLabel="event"
              >
                {filteredAuditLogs.map((row) => (
                  <LogCard key={row.id}>
                    <Typography component="h3" variant="body1" sx={{ fontWeight: 750 }}>{formatAuditMessage(row, references)}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{formatDateTime(row.created_at)}</Typography>
                    <Box component="details" sx={{ mt: 1.5 }}>
                      <Typography component="summary" variant="body2" sx={{ cursor: 'pointer', fontWeight: 700, width: 'fit-content' }}>View details</Typography>
                      <MetaGrid>
                        <Box><Typography variant="caption" color="text.secondary">Action</Typography><Typography variant="body2">{humanizeAuditValue(row.action)}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">Record type</Typography><Typography variant="body2">{humanizeAuditValue(row.entity_type)}</Typography></Box>
                      </MetaGrid>
                      <JsonPreviewBox>
                        <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                          {safePreview({ before: row.before_json, after: row.after_json })}
                        </Box>
                      </JsonPreviewBox>
                    </Box>
                  </LogCard>
                ))}
              </ScrollableResults>
            )}
          </SectionCard>

          <SectionCard>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Email Activity</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Messages recorded by Supplide, with related order numbers where available.</Typography>
            {filteredEmailEvents.length === 0 ? (
              <EmptyWrap><Typography component="h3" variant="h6" sx={{ fontWeight: 700 }}>No matching email activity</Typography></EmptyWrap>
            ) : (
              <ScrollableResults
                containerComponent={ListWrap}
                count={filteredEmailEvents.length}
                label="Email activity"
                singularLabel="email event"
              >
                {filteredEmailEvents.map((row) => (
                  <LogCard key={row.id}>
                    <Typography component="h3" variant="body1" sx={{ fontWeight: 750 }}>{humanizeAuditValue(row.type)} email sent to {row.to}.</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{row.subject}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      {row.order_id ? `${references.orders[row.order_id]?.orderNumber || 'Related order'} · ` : ''}{formatDateTime(row.created_at)}
                    </Typography>
                  </LogCard>
                ))}
              </ScrollableResults>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}
