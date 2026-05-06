import { Box, Card, styled } from '@mui/material';

export const SectionCard = styled(Card)(({ theme }) => ({
  borderRadius: 28,
  padding: theme.spacing(3),
  border: '1px solid #E2E8F0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}));

export const StatsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const StatCard = styled(Card)(({ theme }) => ({
  borderRadius: 24,
  padding: theme.spacing(2.5),
  border: '1px solid #E2E8F0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
}));

export const TableWrap = styled(Box)(({ theme }) => ({
  width: '100%',
  overflowX: 'auto',
  marginTop: theme.spacing(2),
  border: '1px solid #E2E8F0',
  borderRadius: 22,
  backgroundColor: '#FFFFFF',
}));

export const EmptyWrap = styled(Box)(({ theme }) => ({
  border: '1px dashed #CBD5E1',
  borderRadius: 24,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
  marginTop: theme.spacing(2),
}));