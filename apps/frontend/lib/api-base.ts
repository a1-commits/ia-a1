const STORAGE_KEY = 'agente_mobi_api_base';

function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function isLegacyLocalBackend(value: string): boolean {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname) && url.port === '4000';
  } catch {
    return false;
  }
}

/** Valor padrão vindo do build (.env); vazio significa mesma origem. */
export function getDefaultApiBase(): string {
  return normalizeApiBase(process.env.NEXT_PUBLIC_API_URL ?? '');
}

/**
 * URL base da API usada pelo app. No navegador, pode ser sobrescrita em
 * `localStorage`. Sem override, usa a mesma origem do app (`/api` na porta 3000).
 */
export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    try {
      const override = localStorage.getItem(STORAGE_KEY);
      if (override && override.trim().length > 0) {
        const normalized = normalizeApiBase(override);
        if (isLegacyLocalBackend(normalized)) {
          localStorage.removeItem(STORAGE_KEY);
          return getDefaultApiBase();
        }
        return normalized;
      }
    } catch {
      /* ignore */
    }
  }
  return getDefaultApiBase();
}

export function getApiBaseOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v || !v.trim()) return null;
    const normalized = normalizeApiBase(v);
    if (isLegacyLocalBackend(normalized)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export function setApiBaseOverride(url: string | null): void {
  if (typeof window === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, normalizeApiBase(url));
}
