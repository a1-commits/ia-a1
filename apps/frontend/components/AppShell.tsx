'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/whatsapp', label: 'WhatsApp', icon: '📱' },
  { href: '/agentes', label: 'Agentes', icon: '🤖' },
  { href: '/contatos', label: 'Contatos', icon: '👥' },
  { href: '/ferramentas', label: 'Ferramentas', icon: '🔌' },
  { href: '/chat', label: 'Chat', icon: '💬' },
  { href: '/settings', label: 'Ajustes', icon: '⚙️' },
] as const;

const ADMIN_NAV = [{ href: '/usuarios', label: 'Usuários', icon: '👤' }] as const;

const MOBILE_NAV = NAV.slice(0, 5);

export function AppShell({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const navItems = user?.role === 'ADMIN' ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--fg)] md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-white px-4 py-6 shadow-sm md:flex">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
              M
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--fg)]">Mobi</div>
              <div className="text-[11px] text-[var(--muted)]">Hub de agentes</div>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-[var(--hover)] font-semibold text-[var(--primary)]'
                    : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 border-t border-[var(--border)] pt-4 text-xs">
          <div className="truncate rounded-lg bg-[var(--hover)] px-3 py-2 text-[var(--muted)]" title={user?.email}>
            {user?.email}
          </div>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                await logout();
                window.location.href = '/login';
              })();
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col pb-[max(5rem,env(safe-area-inset-bottom)+4.5rem)] md:pb-0">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-[var(--border)] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(37,99,235,0.08)] md:hidden">
        {MOBILE_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                active ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
