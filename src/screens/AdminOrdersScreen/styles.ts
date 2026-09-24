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

export const SectionCard = styled(Card)(({ theme }) => ({
  borderRadius: 10,
  padding: theme.spacing(3),
  border: '1px solid #E2E8F0',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}));

export const FiltersGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 220px',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const StyledTextField = styled(TextField)(() => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 10,
  },
}));

export const ListWrap = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const OrderCard = styled(Box)(({ theme }) => ({
  border: '1px solid #E2E8F0',
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
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

export const OrderSummaryGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: theme.spacing(1.25, 2),
  marginTop: theme.spacing(1.5),
  paddingTop: theme.spacing(1.5),
  borderTop: '1px solid #E2E8F0',
  '& > *': { minWidth: 0 },
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  [theme.breakpoints.down('sm')]: {
    minWidth: 0,
  },
}));

export const ExpandedContent = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
  paddingTop: theme.spacing(2),
  borderTop: '1px solid #E2E8F0',
  minWidth: 0,
}));

export const EmptyWrap = styled(Box)(({ theme }) => ({
  border: '1px dashed #CBD5E1',
  borderRadius: 14,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
  marginTop: theme.spacing(2),
}));

export const ManagementGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
  },
}));

export const ManagementPanel = styled(Box)(({ theme }) => ({
  minWidth: 0,
  padding: theme.spacing(2),
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  backgroundColor: '#F8FAFC',
}));

type ActionTone = 'pricing' | 'shipping' | 'status';

const actionToneMap: Record<ActionTone, { border: string; iconBg: string; icon: string }> = {
  pricing: { border: '#C4B5FD', iconBg: '#F5F3FF', icon: '#6D28D9' },
  shipping: { border: '#93C5FD', iconBg: '#EFF6FF', icon: '#1D4ED8' },
  status: { border: '#FCD34D', iconBg: '#FFFBEB', icon: '#B45309' },
};

export const ActionPanel = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'actiontone',
})<{ actiontone: ActionTone }>(({ theme, actiontone }) => ({
  minWidth: 0,
  padding: theme.spacing(2),
  border: '1px solid #E2E8F0',
  borderTop: `3px solid ${actionToneMap[actiontone].border}`,
  borderRadius: 12,
  backgroundColor: '#FFFFFF',
  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
}));

export const ActionHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.spacing(1.5),
  paddingBottom: theme.spacing(1.5),
  borderBottom: '1px solid #E2E8F0',
  [theme.breakpoints.down('sm')]: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
}));

export const ActionIcon = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'actiontone',
})<{ actiontone: ActionTone }>(({ theme, actiontone }) => ({
  display: 'grid',
  width: 40,
  height: 40,
  flex: '0 0 40px',
  placeItems: 'center',
  borderRadius: 10,
  color: actionToneMap[actiontone].icon,
  backgroundColor: actionToneMap[actiontone].iconBg,
  '& svg': { fontSize: 21 },
  [theme.breakpoints.down('sm')]: {
    width: 44,
    height: 44,
  },
}));

export const EditorFields = styled(Box)(({ theme }) => ({
  display: 'grid',
  gap: theme.spacing(1.25),
  marginTop: theme.spacing(1.5),
  paddingTop: theme.spacing(1.5),
  borderTop: '1px solid #E2E8F0',
  minWidth: 0,
}));

export const StatusActionRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  gap: theme.spacing(1.5),
  marginTop: theme.spacing(1.5),
  '& > *': { minWidth: 0 },
  [theme.breakpoints.down('sm')]: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    '& > *': { width: '100%', minWidth: 0 },
  },
}));

export const DangerZone = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.spacing(2),
  padding: theme.spacing(1.5, 2),
  border: '1px solid #FECACA',
  borderRadius: 12,
  backgroundColor: '#FFF7F7',
  [theme.breakpoints.down('sm')]: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
}));
