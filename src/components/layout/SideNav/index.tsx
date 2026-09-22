'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import CloseIcon from '@mui/icons-material/Close';
import { IconButton, Typography } from '@mui/material';
import {
  BrandWrap,
  FooterWrap,
  NavItemButton,
  NavList,
  SideNavRoot,
  SideNavHeader,
} from './styles';

type NavItem = {
  label: string;
  href: string;
};

type SideNavProps = {
  navItems: NavItem[];
  onNavigate?: () => void;
  onClose?: () => void;
  id?: string;
};

export default function SideNav({ navItems, onNavigate, onClose, id }: SideNavProps) {
  const pathname = usePathname();

  return (
    <SideNavRoot aria-label="Primary navigation" id={id}>
      <BrandWrap>
        <SideNavHeader>
          <div>
            <Typography
              variant="overline"
              sx={{ letterSpacing: 1.8, color: 'text.secondary', fontWeight: 700 }}
            >
              Supplide
            </Typography>
            <Typography component="p" variant="h6" sx={{ fontWeight: 800, mt: 0.25 }}>
              Partner Operations
            </Typography>
          </div>
          {onClose ? (
            <IconButton aria-label="Close navigation" onClick={onClose} sx={{ display: { md: 'none' } }}>
              <CloseIcon />
            </IconButton>
          ) : null}
        </SideNavHeader>
      </BrandWrap>

      <NavList>
        {navItems.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              prefetch
              aria-current={active ? 'page' : undefined}
              className={active ? 'active' : undefined}
            >
              <NavItemButton active={active}>{item.label}</NavItemButton>
            </Link>
          );
        })}
      </NavList>

      <FooterWrap>
        <Typography variant="body2" color="text.secondary">
          Secure distributor operations
        </Typography>
      </FooterWrap>
    </SideNavRoot>
  );
}
