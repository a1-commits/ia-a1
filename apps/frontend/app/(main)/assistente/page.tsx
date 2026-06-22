'use client';

import Link from 'next/link';
import { Card } from '@/components/Card';

const adminCommands = [
  '!status',
  '!pausar / !manual / !pause',
  '!agente / !ativar / !auto',
  '!briefing',
  '!lembrar HH:MM <texto>',
  '!lembrar YYYY-MM-DD HH:MM <texto>',
];

export default function AssistentePage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white px-4 py-6 md:px-8">
      <header className="mb-6 overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-br from-[var(--mobi-orange)]/12 via-white to-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] md:p-6">
        <div className="mb-4 inline-flex rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-sm">
          <img src="/api/brand/logo?variant=preto" alt="Logo Möble" className="h-14 w-auto object-contain md:h-16" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--mobi-graphite)] md:text-3xl">
          Assistente Mobi
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 md:text-base">
          Painel principal do fundador para operar o agente com velocidade e clareza.
        </p>
      </header>

      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-base font-semibold text-[var(--mobi-graphite)]">Acesso Rápido</h2>
          <div className="grid gap-2">
            <Link
              href="/chat"
              className="rounded-xl border border-[var(--mobi-orange)]/40 bg-[var(--mobi-orange)] px-3 py-2 text-sm font-medium text-white hover:brightness-105"
            >
              Abrir Chat Executivo
            </Link>
            <Link
              href="/controle"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Painel de Controle (IA + WhatsApp)
            </Link>
            <Link
              href="/settings"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Configurações e Integrações
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-base font-semibold text-[var(--mobi-graphite)]">Ritual de Abertura (Admin)</h2>
          <p className="text-sm text-zinc-600">
            No WhatsApp admin, o agente envia briefing formal no início da sessão e pode reemitir sob comando.
          </p>
          <div className="mt-3 rounded-xl border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700">
            <p>Saudação formal + confirmação de fundador/admin</p>
            <p>Status operacional (IA, WhatsApp, integração)</p>
            <p>Prioridades do dia e pendência crítica</p>
            <p>Menu executivo de ação rápida</p>
          </div>
        </Card>

        <Card className="md:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-[var(--mobi-graphite)]">Comandos Admin WhatsApp</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {adminCommands.map((cmd) => (
              <div
                key={cmd}
                className="rounded-lg border border-black/10 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800"
              >
                {cmd}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Referência completa também no arquivo <code>COMANDOS_ADMIN_WHATSAPP.txt</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}

