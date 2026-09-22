import { Box, Card, TextField, styled } from '@mui/material';

export const StatsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.spacing(2),
  [theme.breakpoints.down('md')]: { gridTemplateColumns: '1fr' },
}));

export const StatCard = styled(Card)(({ theme }) => ({
  borderRadius: 14,
  padding: theme.spacing(2.5),
  border: '1px solid #E2E8F0',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
  minWidth: 0,
}));

export const OrderGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
  gap: theme.spacing(2),
  alignItems: 'start',
  [theme.breakpoints.down('lg')]: { gridTemplateColumns: '1fr' },
}));

export const SectionCard = styled(Card)(({ theme }) => ({
  borderRadius: 14,
  padding: theme.spacing(3),
  border: '1px solid #E2E8F0',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
  minWidth: 0,
  [theme.breakpoints.down('sm')]: { padding: theme.spacing(2) },
}));

export const ProductList = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.spacing(1.25),
  marginTop: theme.spacing(2),
  maxHeight: 520,
  overflowY: 'auto',
  paddingRight: theme.spacing(0.5),
  [theme.breakpoints.down('sm')]: { gridTemplateColumns: '1fr' },
}));

export const ProductCard = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected?: boolean }>(({ theme, selected }) => ({
  border: `1px solid ${selected ? theme.palette.primary.main : '#E2E8F0'}`,
  background: selected ? '#EFF6FF' : '#FFFFFF',
  borderRadius: 10,
  padding: theme.spacing(1.5),
  minWidth: 0,
}));

export const FormGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const AddressFormGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.spacing(1.5),
  padding: theme.spacing(2),
  border: '1px solid #E2E8F0',
  borderRadius: 10,
  background: '#F8FAFC',
  [theme.breakpoints.down('sm')]: { gridTemplateColumns: '1fr' },
}));

export const ReviewBox = styled(Box)(({ theme }) => ({
  border: '1px solid #CBD5E1',
  backgroundColor: '#F8FAFC',
  borderRadius: 10,
  padding: theme.spacing(2),
}));

export const StyledTextField = styled(TextField)(() => ({
  '& .MuiOutlinedInput-root': { borderRadius: 10 },
}));

export const EmptyWrap = styled(Box)(({ theme }) => ({
  border: '1px dashed #CBD5E1',
  borderRadius: 14,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
}));
