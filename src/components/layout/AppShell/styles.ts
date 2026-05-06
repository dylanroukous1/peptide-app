import { Box, Drawer, styled } from '@mui/material';

export const ShellRoot = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  backgroundColor: '#F8FAFC',
}));

export const ShellBody = styled(Box)(({ theme }) => ({
  display: 'flex',
  minHeight: '100vh',
}));

export const SidebarDesktopWrap = styled(Box)(({ theme }) => ({
  width: 280,
  flexShrink: 0,
  [theme.breakpoints.down('lg')]: {
    display: 'none',
  },
}));

export const ContentWrap = styled(Box)(({ theme }) => ({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
}));

export const MainContent = styled(Box)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(3),
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(2),
  },
}));

export const MobileDrawer = styled(Drawer)(({ theme }) => ({
  display: 'none',
  [theme.breakpoints.down('lg')]: {
    display: 'block',
  },
  '& .MuiDrawer-paper': {
    width: 280,
    borderRight: '1px solid #E2E8F0',
    backgroundColor: '#FFFFFF',
  },
}));