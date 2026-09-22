import { Box, styled } from '@mui/material';

export const SideNavRoot = styled('nav')(({ theme }) => ({
  height: '100vh',
  position: 'sticky',
  top: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#FFFFFF',
  borderRight: '1px solid #E2E8F0',
  padding: theme.spacing(3, 2),
}));

export const BrandWrap = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1, 1.5, 3, 1.5),
  borderBottom: '1px solid #F1F5F9',
  marginBottom: theme.spacing(2.5),
}));

export const SideNavHeader = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}));

export const NavList = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  '& > a': {
    color: 'inherit',
    textDecoration: 'none',
    borderRadius: 10,
  },
  '& > a:focus-visible': {
    outline: '3px solid #7DD3FC',
    outlineOffset: 2,
  },
}));

export const NavItemButton = styled('span', {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active?: boolean }>(({ theme, active }) => ({
  width: '100%',
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  textAlign: 'left',
  borderRadius: 10,
  padding: theme.spacing(1.5, 1.75),
  fontSize: 14,
  fontWeight: 600,
  color: active ? '#FFFFFF' : '#334155',
  backgroundColor: active ? '#0F172A' : 'transparent',
  border: active ? '1px solid #0F172A' : '1px solid transparent',
  minHeight: 44,
  transition: 'background-color 0.15s ease, border-color 0.15s ease',
  '&:hover': {
    backgroundColor: active ? '#0F172A' : '#F8FAFC',
    borderColor: active ? '#0F172A' : '#E2E8F0',
  },
}));

export const FooterWrap = styled(Box)(({ theme }) => ({
  marginTop: 'auto',
  padding: theme.spacing(2, 1.5, 0, 1.5),
  borderTop: '1px solid #F1F5F9',
}));
