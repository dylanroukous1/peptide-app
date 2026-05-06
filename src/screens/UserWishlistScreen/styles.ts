import { Box, Card, TextField, styled } from '@mui/material';

export const PageGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '0.95fr 1.05fr',
  gap: theme.spacing(3),
  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: '1fr',
  },
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

export const FormGrid = styled('form')(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const StyledTextField = styled(TextField)(() => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 16,
  },
}));

export const RequestList = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const RequestCard = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  backgroundColor: '#FFFFFF',
  borderRadius: 22,
  padding: theme.spacing(2),
}));

export const EmptyWrap = styled(Box)(({ theme }) => ({
  border: '1px dashed #CBD5E1',
  borderRadius: 24,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
  marginTop: theme.spacing(2),
}));

export const MetaGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.spacing(1.5, 2),
  marginTop: theme.spacing(1.5),
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
  },
}));