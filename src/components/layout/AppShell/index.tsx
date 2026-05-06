'use client';

import { ReactNode, useState } from 'react';
import Topbar from '@/src/components/layout/Topbar';
import SideNav from '@/src/components/layout/SideNav';
import {
  ContentWrap,
  MainContent,
  MobileDrawer,
  ShellBody,
  ShellRoot,
  SidebarDesktopWrap,
} from './styles';

export type AppShellNavItem = {
  label: string;
  href: string;
};

type AppShellProps = {
  title: string;
  subtitle?: string;
  navItems: AppShellNavItem[];
  children: ReactNode;
};

export default function AppShell({
  title,
  subtitle,
  navItems,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleOpenMobileNav = () => {
    setMobileOpen(true);
  };

  const handleCloseMobileNav = () => {
    setMobileOpen(false);
  };

  return (
    <ShellRoot>
      <ShellBody>
        <SidebarDesktopWrap>
          <SideNav navItems={navItems} />
        </SidebarDesktopWrap>

        <MobileDrawer
          anchor="left"
          open={mobileOpen}
          onClose={handleCloseMobileNav}
          ModalProps={{ keepMounted: true }}
        >
          <SideNav navItems={navItems} onNavigate={handleCloseMobileNav} />
        </MobileDrawer>

        <ContentWrap>
          <Topbar
            title={title}
            subtitle={subtitle}
            onMenuClick={handleOpenMobileNav}
          />
          <MainContent>{children}</MainContent>
        </ContentWrap>
      </ShellBody>
    </ShellRoot>
  );
}