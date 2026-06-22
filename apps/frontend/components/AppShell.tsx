'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { href: '/operator', label: 'Operador', icon: '⚙' },
  { href: '/chat', label: 'Chat', icon: '◆' },
  { href: '/controle', label: 'Painel', icon: '◉' },
  { href: '/propostas', label: 'Propostas', icon: '◈' },
  { href: '/financeiro', label: 'Financeiro', icon: '◌' },
  { href: '/search', label: 'Busca', icon: '⌕' },
  { href: '/memories', label: 'Memórias', icon: '◇' },
  { href: '/tasks', label: 'Tarefas', icon: '▪' },
  { href: '/reflections', label: 'Reflexões', icon: '○' },
  { href: '/settings', label: 'Ajustes', icon: '◎' },
] as const;

const ADMIN_NAV = [{ href: '/usuarios', label: 'Usuários', icon: '▣' }] as const;

export function AppShell({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const navItems = user?.role === 'ADMIN' ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--fg)] md:flex-row">
      <aside className="hidden w-60 shrink-0 border-r border-white/10 bg-[var(--moble-black)] px-4 py-6 text-white md:flex md:flex-col">
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="mb-4 flex items-center">
            <img src="/api/brand/logo?variant=branco" alt="Möble Marcenaria" className="logo" />
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--moble-accent)]">Operação</div>
          <div className="mt-1 text-sm font-semibold tracking-tight text-white">MOBI Central</div>
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-[var(--moble-accent)] font-semibold text-[var(--moble-black)] shadow-[0_10px_24px_rgba(200,169,106,0.18)]'
                    : 'text-white/68 hover:bg-white/8 hover:text-white'
                }`}
              >
                <span className={active ? 'text-[var(--moble-black)]' : 'text-[var(--moble-accent)]'}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 border-t border-white/10 pt-4 text-xs text-white/58">
          <div className="truncate rounded-xl bg-white/[0.04] px-3 py-2" title={user?.email}>
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
            className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-white/75 transition hover:border-[var(--moble-accent)]/50 hover:bg-white/[0.04] hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col pb-[max(5rem,env(safe-area-inset-bottom)+4.5rem)] md:pb-0">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-black/10 bg-[var(--moble-white)]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(2,6,23,0.06)] backdrop-blur md:hidden">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[10px] ${
                active ? 'text-[var(--moble-accent)]' : 'text-zinc-500'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
