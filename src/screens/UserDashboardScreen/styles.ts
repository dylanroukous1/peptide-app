import { Box, Card, TextField, styled } from '@mui/material';

export const StatsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: theme.spacing(2),
  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const StatCard = styled(Card)(({ theme }) => ({
  borderRadius: 24,
  padding: theme.spacing(2.5),
  border: '1px solid #E2E8F0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
}));

export const SectionCard = styled(Card)(({ theme }) => ({
  borderRadius: 28,
  padding: theme.spacing(3),
  border: '1px solid #E2E8F0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}));

export const BatchList = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
}));

export const BatchCard = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  backgroundColor: '#F8FAFC',
  borderRadius: 24,
  padding: theme.spacing(2.5),
}));

export const BatchLayout = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.8fr',
  gap: theme.spacing(2),
  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const BatchInfoGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.spacing(1.5, 2),
  marginTop: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const BatchFormCard = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  backgroundColor: '#FFFFFF',
  borderRadius: 24,
  padding: theme.spacing(2),
}));

export const FormGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(1.5),
}));

export const SummaryBox = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  backgroundColor: '#F8FAFC',
  borderRadius: 18,
  padding: theme.spacing(1.75),
}));

export const StyledTextField = styled(TextField)(() => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 16,
  },
}));

export const EmptyWrap = styled(Box)(({ theme }) => ({
  border: '1px dashed #CBD5E1',
  borderRadius: 24,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
}));