'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getToken } from '@/lib/auth-storage';

export default function HomePage(): React.ReactElement {
  const router = useRouter();

  useEffect(() => {
    const t = getToken();
    router.replace(t ? '/dashboard' : '/login');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-zinc-500">
      Carregando…
    </div>
  );
}
