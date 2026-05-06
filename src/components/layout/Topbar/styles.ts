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
    minHeight: 72,
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
}));

export const TitleWrap = styled(Box)(({ theme }) => ({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(0.5),
}));

export const ActionsWrap = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.25),
  flexShrink: 0,
}));

export const MobileMenuButton = styled(IconButton)(({ theme }) => ({
  display: 'none',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  backgroundColor: '#FFFFFF',
  [theme.breakpoints.down('lg')]: {
    display: 'inline-flex',
  },
}));