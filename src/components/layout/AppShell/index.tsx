'use client';

import { createContext, ReactNode, useContext, useState } from 'react';
import Topbar from '@/src/components/layout/Topbar';
import SideNav from '@/src/components/layout/SideNav';
import { useSessionUser } from '@/src/hooks/useSessionUser';
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

const AppShellContext = createContext(false);

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
  const alreadyMounted = useContext(AppShellContext);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile } = useSessionUser();

  if (alreadyMounted) {
    return <>{children}</>;
  }

  const handleOpenMobileNav = () => {
    setMobileOpen(true);
  };

  const handleCloseMobileNav = () => {
    setMobileOpen(false);
  };

  return (
    <AppShellContext.Provider value>
      <ShellRoot>
        <ShellBody>
          <SidebarDesktopWrap>
            <SideNav navItems={navItems} id="desktop-navigation" />
          </SidebarDesktopWrap>

          <MobileDrawer
            anchor="left"
            open={mobileOpen}
            onClose={handleCloseMobileNav}
            ModalProps={{ keepMounted: true }}
          >
            <SideNav
              navItems={navItems}
              onNavigate={handleCloseMobileNav}
              onClose={handleCloseMobileNav}
              id="mobile-navigation"
            />
          </MobileDrawer>

          <ContentWrap>
            <Topbar
              title={title}
              subtitle={subtitle}
              userName={
                profile ? `${profile.first_name} ${profile.last_name}`.trim() : undefined
              }
              userRole={profile?.role}
              onMenuClick={handleOpenMobileNav}
              mobileNavOpen={mobileOpen}
            />
            <MainContent>{children}</MainContent>
          </ContentWrap>
        </ShellBody>
      </ShellRoot>
    </AppShellContext.Provider>
  );
}
