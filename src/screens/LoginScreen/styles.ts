import { Box, Card, TextField, styled } from '@mui/material';

export const PageRoot = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  backgroundColor: '#F1F5F9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(3),
  [theme.breakpoints.down('md')]: {
    alignItems: 'flex-start',
    padding: theme.spacing(2),
  },
}));

export const ContentWrap = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: 1120,
  display: 'grid',
  gridTemplateColumns: '1.05fr 0.95fr',
  gap: theme.spacing(3),
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const WelcomePanel = styled(Card)(({ theme }) => ({
  borderRadius: 10,
  padding: theme.spacing(5),
  border: '1px solid #E2E8F0',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
  backgroundColor: '#F8FAFC',
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(3),
  },
}));

export const LoginCard = styled(Card)(({ theme }) => ({
  borderRadius: 10,
  padding: theme.spacing(4),
  border: '1px solid #E2E8F0',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
  backgroundColor: '#FFFFFF',
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(3),
  },
}));

export const LoginForm = styled('form')(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const StyledTextField = styled(TextField)(() => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 10,
  },
}));

export const InfoTile = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  backgroundColor: '#F8FAFC',
  borderRadius: 12,
  padding: theme.spacing(2),
}));
