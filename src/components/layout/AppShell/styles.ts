import { Box, Drawer, styled } from '@mui/material';

export const ShellRoot = styled(Box)(() => ({
  minHeight: '100vh',
  backgroundColor: '#F6F8FA',
  maxWidth: '100vw',
  overflowX: 'hidden',
}));

export const ShellBody = styled(Box)(() => ({
  display: 'flex',
  minHeight: '100vh',
}));

export const SidebarDesktopWrap = styled(Box)(({ theme }) => ({
  width: 280,
  flexShrink: 0,
  [theme.breakpoints.down('md')]: {
    display: 'none',
  },
}));

export const ContentWrap = styled(Box)(() => ({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
}));

export const MainContent = styled(Box)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(3),
  width: '100%',
  maxWidth: 1600,
  margin: '0 auto',
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(2),
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1.5),
  },
}));

export const MobileDrawer = styled(Drawer)(({ theme }) => ({
  display: 'none',
  [theme.breakpoints.down('md')]: {
    display: 'block',
  },
  '& .MuiDrawer-paper': {
    width: 280,
    borderRight: '1px solid #E2E8F0',
    backgroundColor: '#FFFFFF',
  },
}));
