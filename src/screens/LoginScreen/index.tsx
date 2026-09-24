'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { supabase } from '@/src/supabase/client';
import { type SessionProfile, useSessionUser } from '@/src/hooks/useSessionUser';
import {
  ContentWrap,
  LoginBrandMark,
  LoginCard,
  LoginForm,
  PageRoot,
  StyledTextField,
  WelcomePanel,
} from './styles';

type BootstrapState =
  | 'idle'
  | 'authenticating'
  | 'loading-account'
  | 'preparing-workspace'
  | 'ready'
  | 'error';
type ErrorStage = 'credentials' | 'account' | 'workspace' | null;

function WorkspaceLoadingSurface({ error, onRetry, onReturnToLogin }: {
  error?: string;
  onRetry?: () => void;
  onReturnToLogin?: () => void;
}) {
  return (
    <PageRoot sx={{ alignItems: 'center' }}>
      <LoginCard sx={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <Typography variant="overline" sx={{ letterSpacing: 2, fontWeight: 800 }}>Supplide</Typography>
        {error ? (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Alert severity="error" sx={{ textAlign: 'left' }}>{error}</Alert>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" onClick={onRetry} fullWidth>Retry</Button>
              <Button variant="outlined" onClick={onReturnToLogin} fullWidth>Return to sign in</Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 2, alignItems: 'center' }} role="status" aria-live="polite">
            <CircularProgress aria-hidden="true" />
            <Box>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }}>Preparing your workspace…</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Securely loading your account and orders.</Typography>
            </Box>
          </Stack>
        )}
      </LoginCard>
    </PageRoot>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const {
    authUser,
    profile,
    loading: sessionLoading,
    clearPreparedWorkspace,
    prepareWorkspace,
    resetSession,
    resolveUser,
    syncSession,
  } = useSessionUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [flowState, setFlowState] = useState<BootstrapState>('idle');
  const [errorStage, setErrorStage] = useState<ErrorStage>(null);
  const submittingRef = useRef(false);
  const automaticBootstrapRef = useRef<string | null>(null);

  const prepareAndNavigate = useCallback(async (nextProfile: SessionProfile) => {
    setFlowState('preparing-workspace');
    setMessage('');
    setErrorStage(null);
    const destination = nextProfile.role === 'ADMIN' ? '/admin/orders' : '/dashboard';
    router.prefetch(destination);
    try {
      const destinationModule = nextProfile.role === 'ADMIN'
        ? import('@/src/screens/AdminOrdersScreen')
        : import('@/src/screens/UserDashboardScreen');
      const [workspace] = await Promise.all([
        prepareWorkspace(nextProfile),
        destinationModule,
      ]);
      setFlowState('ready');
      router.replace(workspace.destination);
    } catch (error) {
      console.error('Workspace bootstrap failed:', error instanceof Error ? error.message : error);
      automaticBootstrapRef.current = null;
      submittingRef.current = false;
      setMessage('We could not prepare your workspace. Check your connection and try again.');
      setErrorStage('workspace');
      setFlowState('error');
    }
  }, [prepareWorkspace, router]);

  const rejectInactiveAccount = useCallback(async (nextProfile: SessionProfile) => {
    clearPreparedWorkspace();
    await supabase.auth.signOut();
    resetSession();
    setPassword('');
    setMessage(`This account is ${nextProfile.account_status.toLowerCase()}. Contact an administrator for access.`);
    setErrorStage('account');
    setFlowState('error');
    submittingRef.current = false;
  }, [clearPreparedWorkspace, resetSession]);

  useEffect(() => {
    if (sessionLoading || flowState !== 'idle') return;
    if (authUser && !profile) return;
    if (!profile || automaticBootstrapRef.current === profile.id) return;
    const timer = window.setTimeout(() => {
      if (automaticBootstrapRef.current === profile.id) return;
      automaticBootstrapRef.current = profile.id;
      submittingRef.current = true;
      if (profile.account_status !== 'ACTIVE') {
        void rejectInactiveAccount(profile);
        return;
      }
      void prepareAndNavigate(profile);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authUser, flowState, prepareAndNavigate, profile, rejectInactiveAccount, sessionLoading]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setPassword('');
      setMessage('Enter your email and password.');
      setErrorStage('credentials');
      setFlowState('error');
      return;
    }

    submittingRef.current = true;
    setEmail(normalizedEmail);
    setMessage('');
    setErrorStage(null);
    setFlowState('authenticating');
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (error || !data.user) {
      setPassword('');
      setMessage(error?.message || 'Unable to sign in. Check your credentials and try again.');
      setErrorStage('credentials');
      setFlowState('error');
      submittingRef.current = false;
      return;
    }

    setFlowState('loading-account');
    const dbProfile = await resolveUser(data.user);
    if (!dbProfile) {
      console.error('Authenticated account has no readable profile.');
      setPassword('');
      setMessage('We could not load your account profile. Try again or return to sign in.');
      setErrorStage('workspace');
      setFlowState('error');
      submittingRef.current = false;
      return;
    }

    automaticBootstrapRef.current = dbProfile.id;
    if (dbProfile.account_status !== 'ACTIVE') {
      await rejectInactiveAccount(dbProfile);
      return;
    }
    await prepareAndNavigate(dbProfile);
  };

  const retryWorkspace = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFlowState('loading-account');
    setMessage('');
    const nextProfile = profile || await syncSession();
    if (!nextProfile) {
      setMessage('We still could not load your account profile. Please return to sign in.');
      setErrorStage('workspace');
      setFlowState('error');
      submittingRef.current = false;
      return;
    }
    if (nextProfile.account_status !== 'ACTIVE') {
      await rejectInactiveAccount(nextProfile);
      return;
    }
    automaticBootstrapRef.current = nextProfile.id;
    await prepareAndNavigate(nextProfile);
  };

  const returnToLogin = async () => {
    clearPreparedWorkspace();
    await supabase.auth.signOut();
    resetSession();
    automaticBootstrapRef.current = null;
    submittingRef.current = false;
    setPassword('');
    setMessage('');
    setErrorStage(null);
    setFlowState('idle');
  };

  // SessionProvider starts in this state on both the server and the client's
  // first render, so the hydration snapshot remains identical.
  if (sessionLoading) {
    return <main className="login-route-loading" role="status" aria-live="polite"><span className="login-route-spinner" aria-hidden="true" /><span>Preparing your workspace…</span></main>;
  }

  const missingProfile = !sessionLoading && Boolean(authUser) && !profile && flowState === 'idle';
  const workspaceError = (flowState === 'error' && errorStage === 'workspace') || missingProfile;
  const workspaceErrorMessage = message || 'We could not load your account profile. Try again or return to sign in.';
  const restoringExistingSession = Boolean(profile) && flowState === 'idle';
  const showBootstrap = workspaceError || restoringExistingSession || ['authenticating', 'loading-account', 'preparing-workspace', 'ready'].includes(flowState);
  if (showBootstrap) {
    return <WorkspaceLoadingSurface error={workspaceError ? workspaceErrorMessage : undefined} onRetry={() => void retryWorkspace()} onReturnToLogin={() => void returnToLogin()} />;
  }

  return (
    <PageRoot>
      <ContentWrap>
        <WelcomePanel>
          <Stack spacing={3}>
            <Box>
              <LoginBrandMark aria-hidden="true">S</LoginBrandMark>
              <Typography variant="overline" sx={{ letterSpacing: 2, color: 'text.secondary', fontWeight: 700 }}>Supplide</Typography>
              <Typography component="h1" variant="h3" sx={{ fontWeight: 800, mt: 1.5, lineHeight: 1.1, fontSize: { xs: '2rem', md: '3rem' } }}>Secure partner and admin access</Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 2, maxWidth: 560 }}>Sign in to Supplide to access product pricing, orders, shipping addresses, and administration tools.</Typography>
            </Box>
            {/* <Stack spacing={2}>
              <InfoTile><Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>What this app supports</Typography><Typography variant="body2" color="text.secondary">Role-based access for administrators and partners, protected company ordering flows, order tracking, and catalog management.</Typography></InfoTile>
              <InfoTile><Typography variant="subtitle1" sx={{ fontWeight: 700 }} gutterBottom>Account status rules</Typography><Typography variant="body2" color="text.secondary">Only profiles marked as <strong>ACTIVE</strong> can enter the app. Newly created accounts may remain <strong>PENDING</strong> until approved.</Typography></InfoTile>
            </Stack> */}
          </Stack>
        </WelcomePanel>
        <LoginCard>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 800 }}>Sign in</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Enter your account credentials to continue.</Typography>
          <LoginForm onSubmit={handleLogin}>
            <StyledTextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth autoComplete="email" required error={Boolean(message)} aria-describedby={message ? 'login-error' : undefined} />
            <StyledTextField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} fullWidth autoComplete="current-password" required error={Boolean(message)} aria-describedby={message ? 'login-error' : undefined} />
            {message ? <Alert id="login-error" severity="error">{message}</Alert> : null}
            <Button type="submit" variant="contained" size="large" disabled={flowState !== 'idle' && flowState !== 'error'} sx={{ mt: 1, minHeight: 52, borderRadius: 4, fontWeight: 700 }} fullWidth>Login</Button>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>Need access? <Link href="/access-request" style={{ fontWeight: 700 }}>Request an account</Link></Typography>
          </LoginForm>
        </LoginCard>
      </ContentWrap>
    </PageRoot>
  );
}
