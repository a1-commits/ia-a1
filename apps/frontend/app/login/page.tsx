'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiUrlSettings } from '@/components/ApiUrlSettings';
import { Card } from '@/components/Card';
import { ApiError } from '@/lib/api';
import { getApiBase } from '@/lib/api-base';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage(): React.ReactElement {
  const { login, register, token, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleError = params.get('googleError');
    if (googleError) {
      setError(googleError);
    }
  }, []);

  useEffect(() => {
    if (!loading && token) {
      router.replace('/chat');
    }
  }, [loading, token, router]);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      router.replace('/chat');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Não foi possível entrar';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function loginWithGoogle(): void {
    const base = getApiBase();
    window.location.href = `${base}/api/auth/google`;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-4 py-12">
      <div className="mb-10 text-center">
        <div className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Agente</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mobi</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          Assistente pessoal privado. Entre para sincronizar memórias, tarefas e conversas.
        </p>
      </div>

      <Card className="w-full max-w-md">
        <div className="mb-6 flex rounded-xl bg-zinc-100 p-1">
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === 'login' ? 'bg-white/10 text-white' : 'text-zinc-500'
            }`}
            onClick={() => setMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === 'register' ? 'bg-white/10 text-white' : 'text-zinc-500'
            }`}
            onClick={() => setMode('register')}
          >
            Criar conta
          </button>
        </div>

        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'register' && (
            <label className="block space-y-1.5 text-sm">
              <span className="text-zinc-400">Nome (opcional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
              />
            </label>
          )}
          <label className="block space-y-1.5 text-sm">
            <span className="text-zinc-400">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
              required
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-zinc-400">Senha</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--mobi-orange)]/60"
              minLength={6}
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--mobi-orange)] py-3 text-sm font-semibold text-white shadow-lg shadow-[rgba(239,75,26,0.28)] transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Registrar'}
          </button>
        </form>

        {mode === 'login' && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-black/10" />
              <span className="text-xs text-zinc-500">ou</span>
              <div className="h-px flex-1 bg-black/10" />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={loginWithGoogle}
              aria-label="Entrar com Google"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/10 bg-white py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </span>
              <span>Entrar com Google</span>
            </button>
          </>
        )}

        <p className="mt-6 text-center text-xs text-zinc-600">
          Demo seed (após migrar/seed):{' '}
          <code className="text-zinc-400">demo@agente.mobi</code> / <code className="text-zinc-400">demo123</code>
        </p>

        <details className="mt-6 rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-left">
          <summary className="cursor-pointer text-xs font-medium text-zinc-400">
            Acesso pelo celular (URL da API)
          </summary>
          <div className="mt-3 pb-1">
            <ApiUrlSettings hint="Abra o app pelo IP do seu PC na rede (ex.: http://192.168.0.15:3000) e deixe a API em branco para usar a mesma porta 3000." />
          </div>
        </details>
      </Card>

      <p className="mt-8 text-xs text-zinc-600">
        Ao continuar, você concorda em usar o sistema apenas em ambiente controlado por você.{' '}
        <Link href="/" className="text-zinc-500 hover:text-zinc-700">
          Voltar
        </Link>
      </p>
    </div>
  );
}
