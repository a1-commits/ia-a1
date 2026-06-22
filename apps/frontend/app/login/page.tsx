'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiUrlSettings } from '@/components/ApiUrlSettings';
import { Card } from '@/components/Card';
import { ApiError } from '@/lib/api';
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
