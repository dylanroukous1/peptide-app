import { AppBar, Box, IconButton, Toolbar, styled } from '@mui/material';

export const TopbarRoot = styled(AppBar)(({ theme }) => ({
  position: 'sticky',
  top: 0,
  zIndex: theme.zIndex.appBar,
  background: 'rgba(248, 250, 252, 0.92)',
  color: '#0F172A',
  boxShadow: 'none',
  backdropFilter: 'blur(10px)',
  borderBottom: '1px solid #E2E8F0',
}));

export const TopbarToolbar = styled(Toolbar)(({ theme }) => ({
  minHeight: 80,
  paddingLeft: theme.spacing(3),
  paddingRight: theme.spacing(3),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.spacing(2),
  [theme.breakpoints.down('md')]: {
    minHeight: 68,
    paddingLeft: theme.spacing(1.5),
    paddingRight: theme.spacing(1.5),
    gap: theme.spacing(1.25),
  },
  [theme.breakpoints.down('sm')]: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    gridTemplateRows: 'auto auto',
    alignItems: 'center',
    paddingTop: theme.spacing(1.25),
    paddingBottom: theme.spacing(1.25),
  },
}));

export const TitleWrap = styled(Box)(({ theme }) => ({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(0.5),
  [theme.breakpoints.down('sm')]: {
    gridColumn: '1 / -1',
    order: 3,
    gap: theme.spacing(0.25),
  },
}));

export const ActionsWrap = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.25),
  flexShrink: 0,
  [theme.breakpoints.down('sm')]: {
    gap: theme.spacing(0.75),
  },
}));

export const UserChip = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(0.75, 1),
  border: '1px solid #E2E8F0',
  borderRadius: 999,
  backgroundColor: '#FFFFFF',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.5),
    gap: theme.spacing(0.5),
  },
}));

export const UserAvatar = styled(Box)(({ theme }) => ({
  width: 34,
  height: 34,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background:
    'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(59, 130, 246, 0.88) 100%)',
  color: '#FFFFFF',
  fontWeight: 800,
  fontSize: '0.8rem',
  letterSpacing: 0.5,
  flexShrink: 0,
  [theme.breakpoints.down('sm')]: {
    width: 30,
    height: 30,
    fontSize: '0.72rem',
  },
}));

export const UserRoleBadge = styled(Box)(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(0.35, 0.9),
  borderRadius: 999,
  backgroundColor: '#0F172A',
  color: '#FFFFFF',
  fontSize: '0.68rem',
  fontWeight: 800,
  letterSpacing: 0.8,
  lineHeight: 1,
  [theme.breakpoints.down('sm')]: {
    display: 'none',
  },
}));

export const MobileMenuButton = styled(IconButton)(({ theme }) => ({
  display: 'none',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  backgroundColor: '#FFFFFF',
  [theme.breakpoints.down('lg')]: {
    display: 'inline-flex',
  },
  [theme.breakpoints.down('sm')]: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
}));
