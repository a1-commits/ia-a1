'use client';

import { useEffect, useState } from 'react';
import {
  getApiBase,
  getApiBaseOverride,
  getDefaultApiBase,
  setApiBaseOverride,
} from '@/lib/api-base';

type ApiUrlSettingsProps = {
  /** Texto curto explicando uso no celular */
  hint?: string;
};

export function ApiUrlSettings({ hint }: ApiUrlSettingsProps): React.ReactElement {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(getApiBase());
    setSaved(getApiBaseOverride());
  }, []);

  function validate(u: string): string | null {
    const t = u.trim();
    if (!t) return null;
    try {
      const parsed = new URL(t);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Use http ou https.';
      }
      if (parsed.port !== '3000') {
        return 'A porta padrao da Mobi/Olist e 3000. Alteracoes exigem consentimento previo.';
      }
      return null;
    } catch {
      return 'URL inválida.';
    }
  }

  function onSave(): void {
    setErr(null);
    const v = validate(value);
    if (v) {
      setErr(v);
      return;
    }
    if (!value.trim()) {
      setApiBaseOverride(null);
      window.location.reload();
      return;
    }
    const normalized = value.trim().replace(/\/+$/, '');
    const def = getDefaultApiBase().replace(/\/+$/, '');
    if (normalized === def) {
      setApiBaseOverride(null);
    } else {
      setApiBaseOverride(normalized);
    }
    window.location.reload();
  }

  function onClear(): void {
    setErr(null);
    setApiBaseOverride(null);
    window.location.reload();
  }

  return (
    <div className="space-y-3 text-sm">
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      <label className="block space-y-1.5">
        <span className="text-zinc-400">URL publica do app/API</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="http://localhost:3000"
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-xs outline-none focus:border-[var(--mobi-orange)]/60"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <p className="text-xs text-zinc-600">
        Padrão do build:{' '}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">
          {getDefaultApiBase() || 'mesma origem (/api na porta 3000)'}
        </code>
        {saved ? (
          <>
            {' '}
            · <span className="text-[var(--mobi-orange)]">override ativo neste aparelho</span>
          </>
        ) : null}
        {' '}A porta `3000` e obrigatoria para manter o callback OAuth da Olist.
      </p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave()}
          className="rounded-lg border border-[var(--mobi-orange)]/40 bg-[var(--mobi-orange)] px-3 py-2 text-xs font-medium text-white"
        >
          Salvar e recarregar
        </button>
        <button
          type="button"
          onClick={() => onClear()}
          disabled={!saved}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-zinc-700 disabled:opacity-40"
        >
          Usar padrão do build
        </button>
      </div>
    </div>
  );
}
