'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearRefreshToken, clearToken, setRefreshToken, setToken } from '@/lib/auth-storage';
import type { User } from '@/types/models';

export default function GoogleAuthCallbackPage(): React.ReactElement {
  const router = useRouter();
  const [message, setMessage] = useState('Concluindo login com Google…');

  useEffect(() => {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (!accessToken || !refreshToken) {
      setMessage('Resposta Google inválida. Redirecionando…');
      router.replace('/login?googleError=Resposta%20Google%20inv%C3%A1lida.');
      return;
    }

    setToken(accessToken);
    setRefreshToken(refreshToken);
    window.history.replaceState(null, '', '/auth/google/callback');

    api<User>('/api/user/me', { token: accessToken })
      .then(() => {
        router.replace('/chat');
      })
      .catch(() => {
        clearToken();
        clearRefreshToken();
        setMessage('Não foi possível validar a sessão. Redirecionando…');
        router.replace('/login?googleError=N%C3%A3o%20foi%20poss%C3%ADvel%20validar%20a%20sess%C3%A3o.');
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  );
}
