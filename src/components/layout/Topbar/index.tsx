'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import { Button, CircularProgress, Typography } from '@mui/material';
import { supabase } from '@/src/supabase/client';
import {
  ActionsWrap,
  MobileMenuButton,
  TitleWrap,
  TopbarRoot,
  TopbarToolbar,
} from './styles';

type TopbarProps = {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
};

export default function Topbar({
  title,
  subtitle,
  onMenuClick,
}: TopbarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
    setLoggingOut(false);
  };

  return (
    <TopbarRoot>
      <TopbarToolbar>
        <ActionsWrap>
          <MobileMenuButton onClick={onMenuClick}>
            <MenuIcon />
          </MobileMenuButton>
        </ActionsWrap>

        <TitleWrap>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 500 }}
          >
            {subtitle || 'Peptide Production Allocation Platform'}
          </Typography>

          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              lineHeight: 1.1,
              fontSize: { xs: '1.35rem', md: '1.75rem' },
            }}
          >
            {title}
          </Typography>
        </TitleWrap>

        <ActionsWrap>
          <Button
            variant="outlined"
            onClick={handleLogout}
            disabled={loggingOut}
            startIcon={
              loggingOut ? <CircularProgress size={16} color="inherit" /> : <LogoutIcon />
            }
            sx={{
              borderRadius: 3,
              textTransform: 'none',
              fontWeight: 700,
              minWidth: 110,
            }}
          >
            {loggingOut ? 'Logging out' : 'Logout'}
          </Button>
        </ActionsWrap>
      </TopbarToolbar>
    </TopbarRoot>
  );
}