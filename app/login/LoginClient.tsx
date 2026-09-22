'use client';

import dynamic from 'next/dynamic';

const LoginScreen = dynamic(() => import('@/src/screens/LoginScreen'), {
  ssr: false,
  loading: () => (
    <main className="login-route-loading" role="status" aria-live="polite">
      <span className="login-route-spinner" aria-hidden="true" />
      <span>Loading Supplide…</span>
    </main>
  ),
});

export default function LoginClient() {
  return <LoginScreen />;
}
