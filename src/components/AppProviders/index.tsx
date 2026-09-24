'use client';

import { ReactNode } from 'react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { SessionProvider } from '@/src/hooks/useSessionUser';
import EmotionRegistry from '@/src/components/EmotionRegistry';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0F3D56', dark: '#0A2C40', contrastText: '#FFFFFF' },
    secondary: { main: '#147D92' },
    background: { default: '#F6F8FA', paper: '#FFFFFF' },
    text: { primary: '#12212F', secondary: '#586879' },
    divider: '#DDE5EB',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'var(--font-geist-sans), Arial, sans-serif',
    button: { fontWeight: 700, textTransform: 'none' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 10,
          '&:focus-visible': { outline: '3px solid #7DD3FC', outlineOffset: 2 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
          '&:focus-visible': { outline: '3px solid #7DD3FC', outlineOffset: 2 },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: '0 3px 12px rgba(15, 23, 42, 0.05)' },
      },
    },
  },
});

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <EmotionRegistry>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SessionProvider>{children}</SessionProvider>
      </ThemeProvider>
    </EmotionRegistry>
  );
}
