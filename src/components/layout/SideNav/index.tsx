'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Typography } from '@mui/material';
import {
  BrandWrap,
  FooterWrap,
  NavItemButton,
  NavList,
  SideNavRoot,
} from './styles';

type NavItem = {
  label: string;
  href: string;
};

type SideNavProps = {
  navItems: NavItem[];
  onNavigate?: () => void;
};

export default function SideNav({ navItems, onNavigate }: SideNavProps) {
  const pathname = usePathname();

  return (
    <SideNavRoot>
      <BrandWrap>
        <Typography
          variant="overline"
          sx={{ letterSpacing: 1.8, color: 'text.secondary', fontWeight: 700 }}
        >
          Peptide Platform
        </Typography>

        <Typography
          variant="h6"
          sx={{ fontWeight: 800, mt: 0.5 }}
        >
          Control Panel
        </Typography>
      </BrandWrap>

      <NavList>
        {navItems.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ textDecoration: 'none' }}
              onClick={onNavigate}
            >
              <NavItemButton active={active}>
                {item.label}
              </NavItemButton>
            </Link>
          );
        })}
      </NavList>

      <FooterWrap>
        <Typography variant="body2" color="text.secondary">
          Responsive admin and user workspace
        </Typography>
      </FooterWrap>
    </SideNavRoot>
  );
}