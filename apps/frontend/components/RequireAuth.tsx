'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from './AppShell';

export function RequireAuth({ children }: { children: ReactNode }): React.ReactElement | null {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.replace('/login');
    }
  }, [loading, token, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-zinc-500">
        Carregando…
      </div>
    );
  }

  if (!token) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
