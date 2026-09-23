import { Box, Card, styled } from '@mui/material';

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
  borderRadius: 14,
  padding: theme.spacing(2.5),
  border: '1px solid #E2E8F0',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
}));

export const SectionCard = styled(Card)(({ theme }) => ({
  borderRadius: 10,
  padding: theme.spacing(3),
  border: '1px solid #E2E8F0',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}));

export const TableWrap = styled(Box)(({ theme }) => ({
  width: '100%',
  overflowX: 'auto',
  marginTop: theme.spacing(2),
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  backgroundColor: '#FFFFFF',
}));

export const EmptyWrap = styled(Box)(({ theme }) => ({
  border: '1px dashed #CBD5E1',
  borderRadius: 14,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
  marginTop: theme.spacing(2),
}));

export const MobileCardList = styled(Box)(({ theme }) => ({
  display: 'none',
  marginTop: theme.spacing(2),
  gap: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    display: 'grid',
  },
}));

export const MobileOrderCard = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  backgroundColor: '#FFFFFF',
  padding: theme.spacing(2),
  minWidth: 0,
  [theme.breakpoints.down('sm')]: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    '& h3, & p, & summary': {
      minWidth: 0,
      overflowWrap: 'anywhere',
      wordBreak: 'break-word',
    },
  },
}));

export const OrderMetaGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.spacing(1.5, 2),
  marginTop: theme.spacing(1.5),
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
    minWidth: 0,
    '& > *': { minWidth: 0 },
  },
}));

export const DesktopTableWrap = styled(Box)(({ theme }) => ({
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));
