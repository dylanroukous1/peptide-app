'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import AppShell from '@/src/components/layout/AppShell';
import { useSessionUser } from '@/src/hooks/useSessionUser';
import { supabase } from '@/src/supabase/client';
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

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function safePreview(value: Record<string, unknown> | null) {
  if (!value) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'Unable to render JSON';
  }
}

export default function AdminAuditScreen() {
  const router = useRouter();
  const { profile, loading: sessionLoading } = useSessionUser();

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [emailEvents, setEmailEvents] = useState<EmailEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');

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

    const loadAuditPage = async () => {
      setLoading(true);
      setErrorMessage('');

      const [
        { data: auditData, error: auditError },
        { data: emailData, error: emailError },
      ] = await Promise.all([
        supabase
          .from('audit_logs')
          .select(
            'id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('email_events')
          .select('id, type, to, subject, order_id, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (auditError || emailError) {
        setErrorMessage(
          auditError?.message || emailError?.message || 'Failed to load audit data.'
        );
        setLoading(false);
        return;
      }

      setAuditLogs(auditData || []);
      setEmailEvents(emailData || []);
      setLoading(false);
    };

    loadAuditPage();
  }, [profile, router, sessionLoading]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((row) => {
      const haystack = [
        row.action,
        row.entity_type,
        row.entity_id,
        row.actor_user_id || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search.toLowerCase());
    });
  }, [auditLogs, search]);

  const filteredEmailEvents = useMemo(() => {
    return emailEvents.filter((row) => {
      const haystack = [
        row.type,
        row.to,
        row.subject,
        row.order_id || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search.toLowerCase());
    });
  }, [emailEvents, search]);

  const stats = useMemo(() => {
    return {
      auditCount: auditLogs.length,
      emailCount: emailEvents.length,
      createActions: auditLogs.filter((row) => row.action.includes('CREATE')).length,
      updateActions: auditLogs.filter((row) => row.action.includes('UPDATE')).length,
    };
  }, [auditLogs, emailEvents]);

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
          <Typography color="text.secondary">Loading audit logs...</Typography>
        </Stack>
      </Box>
    );
  }

  if (!profile || profile.role !== 'ADMIN' || profile.account_status !== 'ACTIVE') {
    return null;
  }

  return (
    <AppShell
      title="Audit & Email Events"
      subtitle="Trace system activity and outbound notifications"
      navItems={adminNavItems}
    >
      <Stack spacing={3}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <StatsGrid>
          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Audit Entries
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.auditCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Email Events
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.emailCount}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Create Actions
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.createActions}
            </Typography>
          </StatCard>

          <StatCard>
            <Typography variant="body2" color="text.secondary">
              Update Actions
            </Typography>
            <Typography variant="h4" sx={{ mt: 1, fontWeight: 800 }}>
              {stats.updateActions}
            </Typography>
          </StatCard>
        </StatsGrid>

        <SectionCard>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Search Activity
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Search actions, entities, event types, recipients, or order references.
          </Typography>

          <Box sx={{ mt: 2 }}>
            <StyledTextField
              label="Search logs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
            />
          </Box>
        </SectionCard>

        <PageGrid>
          <SectionCard>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Audit Logs
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Tracks entity changes and the acting user id where available.
            </Typography>

            {filteredAuditLogs.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  No audit entries found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Matching audit activity will appear here.
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap>
                {filteredAuditLogs.map((row) => (
                  <LogCard key={row.id}>
                    <Stack spacing={0.5}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {row.action}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {row.entity_type} · {row.entity_id}
                      </Typography>
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Actor User ID
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.actor_user_id || '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Created At
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatDateTime(row.created_at)}
                        </Typography>
                      </Box>
                    </MetaGrid>

                    <JsonPreviewBox>
                      <Typography variant="caption" color="text.secondary">
                        Before
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          mt: 0.75,
                          fontSize: 12,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {safePreview(row.before_json)}
                      </Box>
                    </JsonPreviewBox>

                    <JsonPreviewBox>
                      <Typography variant="caption" color="text.secondary">
                        After
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          mt: 0.75,
                          fontSize: 12,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {safePreview(row.after_json)}
                      </Box>
                    </JsonPreviewBox>
                  </LogCard>
                ))}
              </ListWrap>
            )}
          </SectionCard>

          <SectionCard>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Email Event Log
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Tracks application-side notification events tied to orders where applicable.
            </Typography>

            {filteredEmailEvents.length === 0 ? (
              <EmptyWrap>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  No email events found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Matching email activity will appear here.
                </Typography>
              </EmptyWrap>
            ) : (
              <ListWrap>
                {filteredEmailEvents.map((row) => (
                  <LogCard key={row.id}>
                    <Stack spacing={0.5}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {row.type}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {row.subject}
                      </Typography>
                    </Stack>

                    <MetaGrid>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Recipient
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.to}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Order ID
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.order_id || '—'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Created At
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatDateTime(row.created_at)}
                        </Typography>
                      </Box>
                    </MetaGrid>
                  </LogCard>
                ))}
              </ListWrap>
            )}
          </SectionCard>
        </PageGrid>
      </Stack>
    </AppShell>
  );
}
