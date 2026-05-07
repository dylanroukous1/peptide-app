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
  UserAvatar,
  UserChip,
  UserRoleBadge,
  TitleWrap,
  TopbarRoot,
  TopbarToolbar,
} from './styles';

type TopbarProps = {
  title: string;
  subtitle?: string;
  userName?: string;
  userRole?: 'ADMIN' | 'USER';
  onMenuClick?: () => void;
};

export default function Topbar({
  title,
  subtitle,
  userName,
  userRole,
  onMenuClick,
}: TopbarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const seed = (userName || userRole || 'user').replace(/\s+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const initials = userName
    ? userName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('')
    : '';

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
          {userName ? (
            <UserChip>
              <UserAvatar
                sx={{
                  background: `linear-gradient(135deg, hsl(${hue} 70% 28%) 0%, hsl(${(hue + 28) % 360} 78% 56%) 100%)`,
                }}
              >
                {initials || 'U'}
              </UserAvatar>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontWeight: 700,
                  display: { xs: 'none', sm: 'block' },
                  whiteSpace: 'nowrap',
                }}
              >
                {userName}
              </Typography>
              {userRole === 'ADMIN' ? <UserRoleBadge>ADMIN</UserRoleBadge> : null}
            </UserChip>
          ) : null}

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
