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
  borderRadius: 14,
  padding: theme.spacing(2.5),
  border: '1px solid #E2E8F0',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
}));

export const PageGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '0.9fr 1.1fr',
  gap: theme.spacing(3),
  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: '1fr',
  },
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

export const FormGrid = styled('form')(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const ListWrap = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const FiltersGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 180px',
  gap: theme.spacing(1.5),
  marginTop: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const PeptideCard = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: theme.spacing(2),
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

export const ActionsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 180px',
  gap: theme.spacing(1.5),
  alignItems: 'end',
  marginTop: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const ActionButtons = styled(Box)(({ theme }) => ({
  gridColumn: '1 / -1',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: theme.spacing(1.25),
  paddingTop: theme.spacing(0.25),
  '& .MuiButton-root': {
    minHeight: 44,
    borderRadius: 10,
    textTransform: 'none',
    fontWeight: 700,
    width: 'auto',
  },
  [theme.breakpoints.down('md')]: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    '& .MuiButton-root': {
      width: '100%',
      minHeight: 48,
    },
  },
}));

export const StyledTextField = styled(TextField)(() => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 10,
  },
}));

export const EmptyWrap = styled(Box)(({ theme }) => ({
  border: '1px dashed #CBD5E1',
  borderRadius: 14,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
  marginTop: theme.spacing(2),
}));
