'use client';

import { useEffect, useState } from 'react';
import { ApiUrlSettings } from '@/components/ApiUrlSettings';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { OlistFinancePhase1 } from '@/components/OlistFinancePhase1';
import { api } from '@/lib/api';

type AiTest = { configured: boolean; reply: string };
type AiStatus = {
  mode: 'real' | 'mock';
  provider: 'openai' | 'ollama' | 'mock';
  selectedMode: 'real' | 'mock' | null;
  strategy: 'local_only' | 'hybrid' | 'openai_only';
  localConfigured: boolean;
  label: string;
  reason: string | null;
};

type IntegrationItem = {
  id: string;
  provider: 'ONEDRIVE' | 'WHATSAPP';
  status: string;
  externalId: string | null;
};

type IntegrationsRes = {
  items: IntegrationItem[];
  hints: { onedrive: string; whatsapp: string };
};

type OneDriveStartRes = {
  ok: true;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  message: string;
  expiresIn: number;
  interval: number;
};

type OneDrivePollRes =
  | { ok: true; pending: true; interval?: number }
  | { ok: true; pending: false; driveId: string; driveType: string | null; ownerName: string | null };

type OlistStatus = {
  configured: boolean;
  connected: boolean;
  authMethod: 'api_token' | 'oauth' | null;
  apiTokenMasked: string | null;
  apiTokenSource: 'user' | 'env' | null;
  oauthClientIdMasked: string | null;
  oauthRedirectUri: string | null;
  oauthAppUserSaved: boolean;
  expiresAt: string | null;
  tokenType: string | null;
  scope: string | null;
  oauthTokenDebug: {
    issuer: string | null;
    audience: string | null;
    scopes: string[];
    subject: string | null;
  } | null;
  rateLimit: {
    limit: number | null;
    remaining: number | null;
    resetSeconds: number | null;
    method: string;
    path: string;
    updatedAt: string;
  } | null;
};

type OlistStartRes = {
  ok: true;
  authUrl: string;
};

type OlistCategory = {
  id: number;
  descricao: string;
  categoriaPai: { id: number; descricao: string } | null;
  filhas: Array<{ id: number; descricao: string; filhas: OlistCategory['filhas'] }>;
};

type OlistCategoryListItem = {
  id: number;
  descricao: string;
  categoriaPai: { id: number; descricao: string } | null;
};

type OlistFinanceItem = {
  id: string;
  titulo: string;
  pessoa: string | null;
  valor: number | null;
  situacao: string | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  dataPagamentoRecebimento: string | null;
};

type WhatsAppStatus = {
  enabled: boolean;
  connected: boolean;
  qrPending: boolean;
  lastError: string | null;
  allowedNumber: string | null;
  startedAt: string | null;
  autoReplyMode: 'agent' | 'manual';
};

type WhatsAppContact = {
  number: string;
  jid: string;
  paused: boolean;
  lastInboundAt: string;
  lastInboundPreview: string;
};

type SalesHandoff = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function SettingsPage(): React.ReactElement {
  const [ai, setAi] = useState<AiTest | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsRes | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus | null>(null);
  const [whatsAppContacts, setWhatsAppContacts] = useState<WhatsAppContact[]>([]);
  const [whatsAppBusy, setWhatsAppBusy] = useState(false);
  const [salesHandoffs, setSalesHandoffs] = useState<SalesHandoff[]>([]);
  const [salesBusy, setSalesBusy] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [oneDriveFlow, setOneDriveFlow] = useState<OneDriveStartRes | null>(null);
  const [oneDriveBusy, setOneDriveBusy] = useState(false);
  const [olistStatus, setOlistStatus] = useState<OlistStatus | null>(null);
  const [olistBusy, setOlistBusy] = useState(false);
  const [confirmWhatsAppModeOpen, setConfirmWhatsAppModeOpen] = useState(false);
  const [pendingWhatsAppMode, setPendingWhatsAppMode] = useState<'agent' | 'manual' | null>(null);
  const [confirmHandoffOpen, setConfirmHandoffOpen] = useState(false);
  const [pendingHandoff, setPendingHandoff] = useState<{ number: string; paused: boolean } | null>(null);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [olistCategoryId, setOlistCategoryId] = useState('');
  const [olistCategory, setOlistCategory] = useState<OlistCategory | null>(null);
  const [olistSearch, setOlistSearch] = useState('');
  const [olistItems, setOlistItems] = useState<OlistCategoryListItem[]>([]);
  const [olistPage, setOlistPage] = useState(1);
  const [olistSort, setOlistSort] = useState<'id' | 'descricao'>('id');
  const [olistOrder, setOlistOrder] = useState<'asc' | 'desc'>('asc');
  const [olistFinanceSearch, setOlistFinanceSearch] = useState('');
  const [olistReceivableItems, setOlistReceivableItems] = useState<OlistFinanceItem[]>([]);
  const [olistPayableItems, setOlistPayableItems] = useState<OlistFinanceItem[]>([]);
  const [olistQuoteItems, setOlistQuoteItems] = useState<OlistFinanceItem[]>([]);
  const [olistFinanceSource, setOlistFinanceSource] = useState<{
    receivable: string | null;
    payable: string | null;
    quotes: string | null;
  }>({
    receivable: null,
    payable: null,
    quotes: null,
  });
  const [olistApiTokenInput, setOlistApiTokenInput] = useState('');
  const [olistOAuthClientId, setOlistOAuthClientId] = useState('');
  const [olistOAuthClientSecret, setOlistOAuthClientSecret] = useState('');
  const [olistOAuthRedirectUri, setOlistOAuthRedirectUri] = useState('http://localhost:3000/settings');
  const [olistAuthUrl, setOlistAuthUrl] = useState<string | null>(null);
  /** Mensagens da área Olist (erros HTTP também vão para `err` no topo — aqui o usuário vê ao rolar até a integração). */
  const [olistFeedback, setOlistFeedback] = useState<{
    text: string;
    tone: 'loading' | 'success' | 'warning' | 'error';
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refreshAiStatus(): Promise<void> {
    try {
      const res = await api<AiStatus>('/api/ai/status');
      setAiStatus(res);
    } catch {
      setAiStatus(null);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<AiTest>('/api/ai/test');
        setAi(res);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Falha ao testar IA');
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshAiStatus();
    })();
  }, []);

  async function updateAiMode(mode: 'real' | 'mock' | 'auto'): Promise<void> {
    setSwitchingMode(true);
    setErr(null);
    try {
      const updated = await api<AiStatus>('/api/ai/mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setAiStatus(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao trocar modo da IA');
      await refreshAiStatus();
    } finally {
      setSwitchingMode(false);
    }
  }

  async function updateAiStrategy(strategy: 'local_only' | 'hybrid' | 'openai_only'): Promise<void> {
    setSwitchingMode(true);
    setErr(null);
    try {
      const updated = await api<AiStatus>('/api/ai/strategy', {
        method: 'POST',
        body: JSON.stringify({ strategy }),
      });
      setAiStatus(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao trocar estratégia da IA');
      await refreshAiStatus();
    } finally {
      setSwitchingMode(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await refreshIntegrations();
    })();
  }, []);

  useEffect(() => {
    void refreshOlistStatus();
  }, []);

  useEffect(() => {
    void handleOlistOAuthReturn();
  }, []);

  useEffect(() => {
    void refreshSalesHandoffs();
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshWhatsAppPanel();
    })();
  }, []);

  async function refreshWhatsAppPanel(): Promise<void> {
    try {
      const [statusRes, contactsRes] = await Promise.all([
        api<WhatsAppStatus>('/api/whatsapp/status'),
        api<{ items: WhatsAppContact[] }>('/api/whatsapp/contacts'),
      ]);
      setWhatsAppStatus(statusRes);
      setWhatsAppContacts(contactsRes.items);
    } catch {
      setWhatsAppStatus(null);
      setWhatsAppContacts([]);
    }
  }

  async function setWhatsAppMode(mode: 'agent' | 'manual'): Promise<void> {
    setWhatsAppBusy(true);
    setErr(null);
    try {
      const status = await api<WhatsAppStatus>('/api/whatsapp/mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setWhatsAppStatus(status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao alterar modo do WhatsApp');
    } finally {
      setWhatsAppBusy(false);
    }
  }

  function requestWhatsAppMode(mode: 'agent' | 'manual'): void {
    setPendingWhatsAppMode(mode);
    setConfirmWhatsAppModeOpen(true);
  }

  async function confirmWhatsAppModeChange(): Promise<void> {
    if (!pendingWhatsAppMode) return;
    setConfirmWhatsAppModeOpen(false);
    await setWhatsAppMode(pendingWhatsAppMode);
    setPendingWhatsAppMode(null);
  }

  async function setContactHandoff(number: string, paused: boolean): Promise<void> {
    setWhatsAppBusy(true);
    setErr(null);
    try {
      await api('/api/whatsapp/handoff', {
        method: 'POST',
        body: JSON.stringify({ number, paused }),
      });
      await refreshWhatsAppPanel();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao atualizar handoff do contato');
    } finally {
      setWhatsAppBusy(false);
    }
  }

  function requestContactHandoff(number: string, paused: boolean): void {
    setPendingHandoff({ number, paused });
    setConfirmHandoffOpen(true);
  }

  async function confirmContactHandoff(): Promise<void> {
    if (!pendingHandoff) return;
    setConfirmHandoffOpen(false);
    await setContactHandoff(pendingHandoff.number, pendingHandoff.paused);
    setPendingHandoff(null);
  }

  async function refreshSalesHandoffs(): Promise<void> {
    try {
      const res = await api<{ items: SalesHandoff[] }>('/api/sales/handoffs');
      setSalesHandoffs(res.items);
    } catch {
      setSalesHandoffs([]);
    }
  }

  async function resolveSalesHandoff(id: string): Promise<void> {
    setSalesBusy(true);
    setErr(null);
    try {
      await api<{ ok: true }>(`/api/sales/handoffs/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshSalesHandoffs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao marcar encaminhamento como resolvido');
    } finally {
      setSalesBusy(false);
    }
  }

  async function refreshIntegrations(): Promise<void> {
    try {
      const res = await api<IntegrationsRes>('/api/integrations');
      setIntegrations(res);
    } catch {
      setIntegrations(null);
    }
  }

  async function refreshOlistStatus(): Promise<void> {
    try {
      const res = await api<OlistStatus>('/api/integrations/olist/status');
      setOlistStatus(res);
    } catch {
      setOlistStatus(null);
    }
  }

  async function handleOlistOAuthReturn(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');
    const oauthErrorDescription = params.get('error_description');
    if (oauthError) {
      const msg = oauthErrorDescription
        ? `OAuth Olist retornou erro: ${oauthError} — ${oauthErrorDescription}`
        : `OAuth Olist retornou erro: ${oauthError}`;
      setErr(msg);
      setOlistFeedback({ text: msg, tone: 'error' });
      setOlistAuthUrl(null);
      params.delete('error');
      params.delete('error_description');
      params.delete('error_uri');
      params.delete('state');
      const clean = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${clean ? `?${clean}` : ''}`);
      return;
    }
    if (!code || !state) return;
    setOlistBusy(true);
    setErr(null);
    try {
      await api('/api/integrations/olist/connect/exchange', {
        method: 'POST',
        body: JSON.stringify({ code, state }),
      });
      params.delete('code');
      params.delete('state');
      params.delete('session_state');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      await refreshOlistStatus();
      setOlistAuthUrl(null);
      setOlistFeedback({ text: 'OAuth da Olist concluído com sucesso.', tone: 'success' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao concluir OAuth da Olist');
    } finally {
      setOlistBusy(false);
    }
  }

  async function startOlistConnect(): Promise<void> {
    setOlistBusy(true);
    setErr(null);
    setOlistFeedback({ text: 'Abrindo autenticação OAuth da Olist…', tone: 'loading' });
    try {
      const res = await api<OlistStartRes>('/api/integrations/olist/connect/start');
      setOlistAuthUrl(res.authUrl);
      setOlistFeedback({ text: 'Redirecionando para autorização da Olist…', tone: 'loading' });
      window.location.assign(res.authUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao iniciar conexão Olist';
      setErr(msg);
      setOlistFeedback({ text: msg, tone: 'error' });
      setOlistBusy(false);
    }
  }

  async function testOlistCategoryById(): Promise<void> {
    const id = Number(olistCategoryId);
    if (!Number.isInteger(id) || id <= 0) {
      const msg = 'Informe um ID de categoria válido para consultar na Olist.';
      setErr(msg);
      setOlistFeedback({ text: msg, tone: 'error' });
      return;
    }
    setOlistBusy(true);
    setErr(null);
    setOlistFeedback({ text: 'Consultando categoria na Olist…', tone: 'loading' });
    try {
      const res = await api<OlistCategory>(`/api/integrations/olist/categorias/${id}`);
      setOlistCategory(res);
      await refreshOlistStatus();
      setOlistFeedback({
        text: `Categoria ${res.id} — ${res.descricao}`,
        tone: 'success',
      });
    } catch (e) {
      setOlistCategory(null);
      const msg = e instanceof Error ? e.message : 'Falha ao consultar categoria na Olist';
      setErr(msg);
      setOlistFeedback({ text: msg, tone: 'error' });
    } finally {
      setOlistBusy(false);
    }
  }

  async function loadOlistCategories(pageOverride?: number): Promise<void> {
    setOlistBusy(true);
    setErr(null);
    setOlistFeedback({ text: 'Consultando lista de categorias na Olist…', tone: 'loading' });
    try {
      const targetPage = pageOverride ?? olistPage;
      const query = new URLSearchParams({
        limit: '30',
        page: String(targetPage),
        sort: olistSort,
        order: olistOrder,
      });
      if (olistSearch.trim().length > 0) query.set('search', olistSearch.trim());
      const res = await api<{ items: OlistCategoryListItem[]; total: number }>(
        `/api/integrations/olist/categorias?${query.toString()}`,
      );
      setOlistItems(res.items);
      await refreshOlistStatus();
      if (res.items.length === 0) {
        setOlistFeedback({
          text:
            'Consulta concluída, mas a lista veio vazia. Pode ser que não existam categorias, os filtros excluíram tudo ou a resposta da API está em formato que ainda não mapeamos. Confira permissões do token.',
          tone: 'warning',
        });
      } else {
        setOlistFeedback({
          text: `${res.items.length} categoria(s) nesta página (página ${targetPage}).`,
          tone: 'success',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao listar categorias da Olist';
      setErr(msg);
      setOlistFeedback({ text: msg, tone: 'error' });
      setOlistItems([]);
    } finally {
      setOlistBusy(false);
    }
  }

  async function loadOlistFinance(kind: 'receivable' | 'payable' | 'quotes'): Promise<void> {
    setOlistBusy(true);
    setErr(null);
    const label =
      kind === 'receivable'
        ? 'contas a receber'
        : kind === 'payable'
          ? 'contas a pagar'
          : 'orçamentos';
    setOlistFeedback({ text: `Consultando ${label} na Olist…`, tone: 'loading' });
    try {
      const path =
        kind === 'receivable'
          ? '/api/integrations/olist/contas-receber'
          : kind === 'payable'
            ? '/api/integrations/olist/contas-pagar'
            : '/api/integrations/olist/orcamentos';
      const query = new URLSearchParams({
        limit: '30',
        page: '1',
      });
      if (olistFinanceSearch.trim().length > 0) query.set('search', olistFinanceSearch.trim());
      const res = await api<{ items: OlistFinanceItem[]; total: number; sourcePath?: string }>(`${path}?${query.toString()}`);

      if (kind === 'receivable') {
        setOlistReceivableItems(res.items);
        setOlistFinanceSource((prev) => ({ ...prev, receivable: res.sourcePath ?? null }));
      } else if (kind === 'payable') {
        setOlistPayableItems(res.items);
        setOlistFinanceSource((prev) => ({ ...prev, payable: res.sourcePath ?? null }));
      } else {
        setOlistQuoteItems(res.items);
        setOlistFinanceSource((prev) => ({ ...prev, quotes: res.sourcePath ?? null }));
      }
      setOlistFeedback({
        text: `${res.items.length} item(ns) de ${label} carregados${res.sourcePath ? ` via ${res.sourcePath}` : ''}.`,
        tone: res.items.length > 0 ? 'success' : 'warning',
      });
      await refreshOlistStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : `Falha ao consultar ${label} na Olist`;
      setErr(msg);
      setOlistFeedback({ text: msg, tone: 'error' });
      if (kind === 'receivable') setOlistReceivableItems([]);
      if (kind === 'payable') setOlistPayableItems([]);
      if (kind === 'quotes') setOlistQuoteItems([]);
    } finally {
      setOlistBusy(false);
    }
  }

  async function saveOlistApiToken(): Promise<void> {
    const t = olistApiTokenInput.trim();
    if (t.length < 8) {
      setErr('Informe um token com pelo menos 8 caracteres.');
      return;
    }
    setOlistBusy(true);
    setErr(null);
    try {
      const res = await api<{ ok: true; status: OlistStatus }>('/api/integrations/olist/api-token', {
        method: 'POST',
        body: JSON.stringify({ token: t }),
      });
      setOlistStatus(res.status);
      setOlistApiTokenInput('');
      setOlistPage(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao salvar token da Olist');
    } finally {
      setOlistBusy(false);
    }
  }

  async function removeOlistApiToken(): Promise<void> {
    setOlistBusy(true);
    setErr(null);
    try {
      const res = await api<{ ok: true; status: OlistStatus }>('/api/integrations/olist/api-token', {
        method: 'DELETE',
      });
      setOlistStatus(res.status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao remover token salvo da Olist');
    } finally {
      setOlistBusy(false);
    }
  }

  async function saveOlistOAuthFromPanel(): Promise<void> {
    const clientId = olistOAuthClientId.trim();
    const clientSecret = olistOAuthClientSecret.trim();
    const redirectUri = olistOAuthRedirectUri.trim();
    if (clientId.length < 2 || clientSecret.length < 4 || redirectUri.length < 8) {
      setErr('Preencha Client ID, Client Secret e a URL de redirecionamento (igual à do aplicativo na Olist).');
      return;
    }
    if (clientId.includes('@')) {
      setErr('O Client ID não é o e-mail da conta. Copie o ID do aplicativo no console Olist/Tiny.');
      return;
    }
    setOlistBusy(true);
    setErr(null);
    try {
      const res = await api<{ ok: true; status: OlistStatus }>('/api/integrations/olist/oauth-app', {
        method: 'POST',
        body: JSON.stringify({ clientId, clientSecret, redirectUri }),
      });
      setOlistStatus(res.status);
      setOlistOAuthClientSecret('');
      if (res.status.oauthRedirectUri) setOlistOAuthRedirectUri(res.status.oauthRedirectUri);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao salvar credenciais OAuth da Olist');
    } finally {
      setOlistBusy(false);
    }
  }

  async function removeOlistOAuthFromPanel(): Promise<void> {
    setOlistBusy(true);
    setErr(null);
    try {
      const res = await api<{ ok: true; status: OlistStatus }>('/api/integrations/olist/oauth-app', {
        method: 'DELETE',
      });
      setOlistStatus(res.status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao remover credenciais OAuth salvas');
    } finally {
      setOlistBusy(false);
    }
  }

  async function disconnectOlist(): Promise<void> {
    setConfirmDisconnectOpen(false);
    setOlistBusy(true);
    setErr(null);
    try {
      await api<{ ok: true }>('/api/integrations/olist/disconnect', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setOlistCategory(null);
      setOlistCategoryId('');
      await refreshOlistStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao desconectar Olist');
    } finally {
      setOlistBusy(false);
    }
  }

  function requestOlistDisconnect(): void {
    setConfirmDisconnectOpen(true);
  }

  async function startOneDriveConnect(): Promise<void> {
    setOneDriveBusy(true);
    setErr(null);
    try {
      const res = await api<OneDriveStartRes>('/api/integrations/onedrive/device/start', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setOneDriveFlow(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao iniciar conexão OneDrive');
    } finally {
      setOneDriveBusy(false);
    }
  }

  async function pollOneDriveConnect(): Promise<void> {
    if (!oneDriveFlow) return;
    setOneDriveBusy(true);
    setErr(null);
    try {
      const res = await api<OneDrivePollRes>('/api/integrations/onedrive/device/poll', {
        method: 'POST',
        body: JSON.stringify({ deviceCode: oneDriveFlow.deviceCode }),
      });
      if (res.pending) {
        setErr('Autorização ainda pendente. Termine no link e tente novamente em alguns segundos.');
      } else {
        setOneDriveFlow(null);
        await refreshIntegrations();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao concluir conexão OneDrive');
    } finally {
      setOneDriveBusy(false);
    }
  }

  async function disconnectOneDrive(): Promise<void> {
    setOneDriveBusy(true);
    setErr(null);
    try {
      await api<{ ok: true }>('/api/integrations/onedrive/disconnect', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setOneDriveFlow(null);
      await refreshIntegrations();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao desconectar OneDrive');
    } finally {
      setOneDriveBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-zinc-500">Estado da API e integrações futuras.</p>
      </header>

      <div className="grid max-w-2xl gap-4">
        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">API backend</h2>
          <ApiUrlSettings hint="Por padrão, a API usa a mesma origem do app: http://localhost:3000/api. Deixe em branco para manter tudo na porta 3000." />
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">IA</h2>
          {err && <p className="text-sm text-red-400">{err}</p>}
          {aiStatus && (
            <p
              className={`mb-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-medium tracking-wide ${
                aiStatus.mode === 'real'
                  ? 'border-[var(--mobi-orange)]/40 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-zinc-100 text-zinc-700'
              }`}
            >
              {aiStatus.label}
            </p>
          )}
          {aiStatus?.reason && <p className="mb-2 text-xs text-zinc-500">{aiStatus.reason}</p>}
          {aiStatus && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void updateAiMode('real')}
                disabled={switchingMode}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  aiStatus.selectedMode === 'real'
                    ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                    : 'border-black/10 bg-white text-zinc-700'
                }`}
              >
                Modo real
              </button>
              <button
                type="button"
                onClick={() => void updateAiMode('mock')}
                disabled={switchingMode}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  aiStatus.selectedMode === 'mock'
                    ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                    : 'border-black/10 bg-white text-zinc-700'
                }`}
              >
                Modo mock
              </button>
              <button
                type="button"
                onClick={() => void updateAiMode('auto')}
                disabled={switchingMode}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  aiStatus.selectedMode === null
                    ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                    : 'border-black/10 bg-white text-zinc-700'
                }`}
              >
                Automático
              </button>
            </div>
          )}
          {aiStatus && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void updateAiStrategy('local_only')}
                disabled={switchingMode}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  aiStatus.strategy === 'local_only'
                    ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                    : 'border-black/10 bg-white text-zinc-700'
                }`}
              >
                Custo zero (local)
              </button>
              <button
                type="button"
                onClick={() => void updateAiStrategy('hybrid')}
                disabled={switchingMode}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  aiStatus.strategy === 'hybrid'
                    ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                    : 'border-black/10 bg-white text-zinc-700'
                }`}
              >
                Híbrido
              </button>
              <button
                type="button"
                onClick={() => void updateAiStrategy('openai_only')}
                disabled={switchingMode}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  aiStatus.strategy === 'openai_only'
                    ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                    : 'border-black/10 bg-white text-zinc-700'
                }`}
              >
                OpenAI apenas
              </button>
            </div>
          )}
          {ai && (
            <div className="space-y-2 text-sm">
              <p className="text-zinc-400">
                Provedor ativo:{' '}
                <span className="text-zinc-800">{aiStatus?.provider ?? 'desconhecido'}</span>
              </p>
              <p className="text-zinc-400">
                Chave configurada no servidor:{' '}
                <span className="text-[var(--mobi-orange)]">
                  {ai.configured ? 'sim' : 'não (modo offline / resposta mock)'}
                </span>
              </p>
              <p className="rounded-xl border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700 whitespace-pre-wrap">
                {ai.reply}
              </p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Integrações (fase 2)</h2>
          {integrations ? (
            <ul className="space-y-3 text-sm">
              {integrations.items.map((it) => {
                if (it.provider === 'ONEDRIVE') {
                  return (
                    <li
                      key={it.id}
                      className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-zinc-700">OneDrive</span>
                        <span className="text-xs text-[var(--mobi-orange)]">{it.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void startOneDriveConnect()}
                          disabled={oneDriveBusy}
                          className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700"
                        >
                          Conectar
                        </button>
                        <button
                          type="button"
                          onClick={() => void pollOneDriveConnect()}
                          disabled={oneDriveBusy || !oneDriveFlow}
                          className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
                        >
                          Já autorizei
                        </button>
                        <button
                          type="button"
                          onClick={() => void disconnectOneDrive()}
                          disabled={oneDriveBusy}
                          className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-300"
                        >
                          Desconectar
                        </button>
                      </div>
                      {oneDriveFlow && (
                        <div className="mt-3 rounded-lg border border-[var(--mobi-orange)]/25 bg-[var(--mobi-orange)]/8 p-2 text-xs text-zinc-700">
                          <p className="mb-1">1) Abra: {oneDriveFlow.verificationUri}</p>
                          <p className="mb-1">
                            2) Digite o código: <strong>{oneDriveFlow.userCode}</strong>
                          </p>
                          <p>3) Depois clique em &quot;Já autorizei&quot;.</p>
                        </div>
                      )}
                    </li>
                  );
                }
                return (
                  <li
                    key={it.id}
                    className="rounded-xl border border-black/10 bg-zinc-50 px-3 py-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-zinc-700">WhatsApp</span>
                      <span
                        className={`text-xs ${
                          whatsAppStatus?.connected ? 'text-[var(--mobi-orange)]' : 'text-[var(--mobi-orange)]'
                        }`}
                      >
                        {whatsAppStatus
                          ? whatsAppStatus.connected
                            ? 'connected'
                            : whatsAppStatus.qrPending
                              ? 'aguardando qr'
                              : 'disconnected'
                          : it.status}
                      </span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => requestWhatsAppMode('agent')}
                        disabled={whatsAppBusy}
                        className={`rounded-md border px-2.5 py-1 text-xs ${
                          whatsAppStatus?.autoReplyMode === 'agent'
                            ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                            : 'border-black/10 bg-white text-zinc-700'
                        }`}
                      >
                        Modo agente
                      </button>
                      <button
                        type="button"
                        onClick={() => requestWhatsAppMode('manual')}
                        disabled={whatsAppBusy}
                        className={`rounded-md border px-2.5 py-1 text-xs ${
                          whatsAppStatus?.autoReplyMode === 'manual'
                            ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                            : 'border-black/10 bg-white text-zinc-700'
                        }`}
                      >
                        Modo manual
                      </button>
                    </div>
                    {whatsAppContacts.length > 0 && (
                      <div className="space-y-2">
                        {whatsAppContacts.slice(0, 5).map((c) => (
                          <div
                            key={c.number}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-white px-2 py-2"
                          >
                            <div className="text-xs text-zinc-700">
                              <div>{c.number}</div>
                              <div className="text-zinc-500">{c.lastInboundPreview}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => requestContactHandoff(c.number, !c.paused)}
                              disabled={whatsAppBusy}
                              className={`rounded-md border px-2 py-1 text-xs ${
                                c.paused
                                  ? 'border-[var(--mobi-orange)]/50 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                                  : 'border-black/10 bg-white text-zinc-700'
                              }`}
                            >
                              {c.paused ? 'Retomar bot' : 'Assumir humano'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
              <p className="text-xs text-zinc-600">{integrations.hints.onedrive}</p>
              <p className="text-xs text-zinc-600">{integrations.hints.whatsapp}</p>
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">Carregando integrações…</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Olist ERP</h2>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full border px-2 py-1 ${
                olistStatus?.configured
                  ? 'border-[var(--mobi-orange)]/40 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-zinc-100 text-zinc-700'
              }`}
            >
              {olistStatus?.configured ? 'credenciais ok' : 'credenciais pendentes'}
            </span>
            <span
              className={`rounded-full border px-2 py-1 ${
                olistStatus?.connected
                  ? 'border-[var(--mobi-orange)]/40 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
                  : 'border-black/10 bg-zinc-100 text-zinc-700'
              }`}
            >
              {olistStatus?.connected ? 'conectado' : 'desconectado'}
            </span>
          </div>

          {olistFeedback && (
            <p
              className={`mb-2 rounded-lg border px-2 py-1.5 text-xs ${
                olistFeedback.tone === 'error'
                  ? 'border-red-500/40 bg-red-500/10 text-red-800'
                  : olistFeedback.tone === 'warning'
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-950'
                    : olistFeedback.tone === 'loading'
                      ? 'border-zinc-300 bg-zinc-100 text-zinc-800'
                      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-950'
              }`}
            >
              {olistFeedback.text}
            </p>
          )}

          <p className="mb-2 text-xs text-zinc-600">
            Autenticação usada nas chamadas:{' '}
            <strong className="text-zinc-800">
              {!olistStatus
                ? '…'
                : olistStatus.authMethod === 'api_token'
                  ? `token de API (${olistStatus.apiTokenSource === 'env' ? '.env' : 'salvo no sistema'})`
                  : olistStatus.authMethod === 'oauth'
                    ? 'OAuth'
                    : 'nenhuma'}
            </strong>
          </p>

          <div className="mb-3 rounded-xl border border-black/10 bg-zinc-50 p-3">
            <h3 className="mb-2 text-xs font-medium text-zinc-700">Aplicativo OAuth (console Olist)</h3>
            <p className="mb-2 text-xs text-zinc-600">
              Cole o <strong>Client ID</strong> e o <strong>Client Secret</strong> do aplicativo que você criou na Olist/Tiny (não use e-mail de login — só as chaves do aplicativo). A{' '}
              <strong>URL de redirecionamento</strong> deve ser exatamente a mesma cadastrada lá (ex.:{' '}
              <code className="rounded bg-white px-1 py-0.5 text-[10px]">http://localhost:3000/settings</code>
              ). Também pode usar as variáveis{' '}
              <code className="rounded bg-white px-1 py-0.5 text-[10px]">OLIST_*</code> no servidor em vez deste formulário.
            </p>
            {(olistStatus?.oauthClientIdMasked || olistStatus?.oauthRedirectUri) && (
              <p className="mb-2 text-xs text-zinc-700">
                {olistStatus.oauthClientIdMasked && (
                  <>
                    Client ID ativo: <strong>{olistStatus.oauthClientIdMasked}</strong>
                  </>
                )}
                {olistStatus.oauthRedirectUri && (
                  <>
                    {olistStatus.oauthClientIdMasked ? ' · ' : null}
                    Redirect: <strong className="break-all">{olistStatus.oauthRedirectUri}</strong>
                  </>
                )}
                {olistStatus.oauthAppUserSaved ? (
                  <span className="ml-1 text-zinc-500">(salvo no sistema)</span>
                ) : (
                  <span className="ml-1 text-zinc-500">(via .env do backend)</span>
                )}
              </p>
            )}
            <div className="mb-2 grid gap-2 sm:grid-cols-1">
              <label className="block text-[11px] text-zinc-600">
                Client ID
                <input
                  type="text"
                  autoComplete="off"
                  value={olistOAuthClientId}
                  onChange={(e) => setOlistOAuthClientId(e.target.value)}
                  placeholder="Client ID (alfanumérico do app, não é e-mail)"
                  className="mt-0.5 w-full rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
                />
              </label>
              <label className="block text-[11px] text-zinc-600">
                Client Secret
                <input
                  type="password"
                  autoComplete="off"
                  value={olistOAuthClientSecret}
                  onChange={(e) => setOlistOAuthClientSecret(e.target.value)}
                  placeholder="Colar Client Secret"
                  className="mt-0.5 w-full rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
                />
              </label>
              <label className="block text-[11px] text-zinc-600">
                URL de redirecionamento
                <input
                  type="url"
                  autoComplete="off"
                  value={olistOAuthRedirectUri}
                  onChange={(e) => setOlistOAuthRedirectUri(e.target.value)}
                  placeholder="http://localhost:3000/settings"
                  className="mt-0.5 w-full rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveOlistOAuthFromPanel()}
                disabled={
                  olistBusy ||
                  olistOAuthClientId.trim().length < 2 ||
                  olistOAuthClientSecret.trim().length < 4 ||
                  olistOAuthRedirectUri.trim().length < 8
                }
                className="rounded-md border border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 px-2.5 py-1 text-xs text-[var(--mobi-graphite)] disabled:opacity-50"
              >
                Salvar credenciais OAuth
              </button>
              <button
                type="button"
                onClick={() => void removeOlistOAuthFromPanel()}
                disabled={olistBusy || !olistStatus?.oauthAppUserSaved}
                className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
                title={
                  !olistStatus?.oauthAppUserSaved
                    ? 'Credenciais vêm só do .env; limpe lá ou salve aqui primeiro.'
                    : undefined
                }
              >
                Remover credenciais salvas
              </button>
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-black/10 bg-zinc-50 p-3">
            <h3 className="mb-2 text-xs font-medium text-zinc-700">Token de API (Bearer)</h3>
            <p className="mb-2 text-xs text-zinc-600">
              Cole aqui o token Bearer da API pública da Olist/Tiny. Esse token é usado primeiro nas chamadas; se a Olist recusar (401) e existir sessão OAuth válida, a chamada é repetida com OAuth. Você também pode definir{' '}
              <code className="rounded bg-white px-1 py-0.5 text-[10px] text-zinc-700">OLIST_API_TOKEN</code> no servidor.
            </p>
            {olistStatus?.apiTokenMasked && (
              <p className="mb-2 text-xs text-zinc-700">
                Token configurado: <strong>{olistStatus.apiTokenMasked}</strong>
                {olistStatus.apiTokenSource === 'env' && (
                  <span className="ml-1 text-zinc-500"> (origem: arquivo .env do backend)</span>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                autoComplete="off"
                value={olistApiTokenInput}
                onChange={(e) => setOlistApiTokenInput(e.target.value)}
                placeholder="Colar token de API"
                className="min-w-[220px] flex-1 rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
              />
              <button
                type="button"
                onClick={() => void saveOlistApiToken()}
                disabled={olistBusy || olistApiTokenInput.trim().length < 8}
                className="rounded-md border border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 px-2.5 py-1 text-xs text-[var(--mobi-graphite)] disabled:opacity-50"
              >
                Salvar token
              </button>
              <button
                type="button"
                onClick={() => void removeOlistApiToken()}
                disabled={olistBusy || olistStatus?.apiTokenSource !== 'user'}
                className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
                title={
                  olistStatus?.apiTokenSource === 'env'
                    ? 'Remova OLIST_API_TOKEN do .env do backend para limpar'
                    : undefined
                }
              >
                Remover token salvo
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void startOlistConnect()}
              disabled={olistBusy}
              className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
            >
              Conectar Olist (OAuth)
            </button>
            <button
              type="button"
              onClick={() => void refreshOlistStatus()}
              disabled={olistBusy}
              className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
            >
              Atualizar status
            </button>
            <button
              type="button"
              onClick={requestOlistDisconnect}
              disabled={olistBusy || !olistStatus?.connected}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 disabled:opacity-50"
            >
              Desconectar Olist
            </button>
            {olistAuthUrl && (
              <a
                href={olistAuthUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 px-2.5 py-1 text-xs text-[var(--mobi-graphite)]"
              >
                Abrir autorização Olist
              </a>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              value={olistCategoryId}
              onChange={(e) => setOlistCategoryId(e.target.value)}
              placeholder="ID da categoria"
              className="w-44 rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
            />
            <button
              type="button"
              onClick={() => void testOlistCategoryById()}
              disabled={olistBusy || !olistStatus?.connected}
              className="rounded-md border border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 px-2.5 py-1 text-xs text-[var(--mobi-graphite)] disabled:opacity-50"
            >
              Testar categoria
            </button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={olistSearch}
              onChange={(e) => setOlistSearch(e.target.value)}
              placeholder="Buscar categoria (opcional)"
              className="w-56 rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
            />
            <button
              type="button"
              onClick={() => void loadOlistCategories()}
              disabled={olistBusy || !olistStatus?.connected}
              className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-50"
            >
              {olistBusy ? 'Carregando…' : 'Carregar categorias'}
            </button>
            <select
              value={olistSort}
              onChange={(e) => setOlistSort(e.target.value as 'id' | 'descricao')}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
            >
              <option value="id">Ordenar: ID</option>
              <option value="descricao">Ordenar: Descrição</option>
            </select>
            <select
              value={olistOrder}
              onChange={(e) => setOlistOrder(e.target.value as 'asc' | 'desc')}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>

          <OlistFinancePhase1
            busy={olistBusy}
            connected={Boolean(olistStatus?.connected)}
            search={olistFinanceSearch}
            onSearchChange={setOlistFinanceSearch}
            onLoadReceivable={() => void loadOlistFinance('receivable')}
            onLoadPayable={() => void loadOlistFinance('payable')}
            onLoadQuotes={() => void loadOlistFinance('quotes')}
            sources={olistFinanceSource}
            receivableItems={olistReceivableItems}
            payableItems={olistPayableItems}
            quoteItems={olistQuoteItems}
          />

          {olistStatus?.expiresAt && (
            <p className="mb-1 text-xs text-zinc-600">
              Token expira em: {new Date(olistStatus.expiresAt).toLocaleString('pt-BR')}
            </p>
          )}
          {olistStatus?.rateLimit && (
            <p className="mb-2 text-xs text-zinc-600">
              Rate limit: {olistStatus.rateLimit.remaining ?? '?'} / {olistStatus.rateLimit.limit ?? '?'} (reset em{' '}
              {olistStatus.rateLimit.resetSeconds ?? '?'}s)
            </p>
          )}
          {olistStatus?.oauthTokenDebug && (
            <div className="mb-2 rounded-lg border border-black/10 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-700">
              <p>
                OAuth audience: <strong>{olistStatus.oauthTokenDebug.audience ?? 'não informado'}</strong>
              </p>
              <p>
                OAuth scopes:{' '}
                <strong>
                  {olistStatus.oauthTokenDebug.scopes.length > 0
                    ? olistStatus.oauthTokenDebug.scopes.join(', ')
                    : 'nenhum scope no token'}
                </strong>
              </p>
            </div>
          )}

          {olistCategory && (
            <div className="rounded-xl border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700">
              <p>
                <strong>ID:</strong> {olistCategory.id}
              </p>
              <p>
                <strong>Descrição:</strong> {olistCategory.descricao}
              </p>
              <p>
                <strong>Categoria pai:</strong>{' '}
                {olistCategory.categoriaPai
                  ? `${olistCategory.categoriaPai.id} - ${olistCategory.categoriaPai.descricao}`
                  : 'sem categoria pai'}
              </p>
              <p>
                <strong>Subcategorias diretas:</strong> {olistCategory.filhas.length}
              </p>
            </div>
          )}
          {olistItems.length > 0 && (
            <div className="mt-3 rounded-xl border border-black/10 bg-zinc-50 p-2">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-700">
                <span>
                Categorias encontradas ({olistItems.length})
                </span>
                <span>Página {olistPage}</span>
              </div>
              <div className="max-h-56 space-y-1 overflow-auto pr-1 text-xs text-zinc-700">
                {olistItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-black/10 bg-white px-2 py-1">
                    <div>
                      <strong>{item.id}</strong> - {item.descricao}
                    </div>
                    <div className="text-zinc-500">
                      Pai:{' '}
                      {item.categoriaPai
                        ? `${item.categoriaPai.id} - ${item.categoriaPai.descricao}`
                        : 'sem categoria pai'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = Math.max(1, olistPage - 1);
                    setOlistPage(nextPage);
                    void loadOlistCategories(nextPage);
                  }}
                  disabled={olistBusy || olistPage <= 1}
                  className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
                >
                  Página anterior
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = olistPage + 1;
                    setOlistPage(nextPage);
                    void loadOlistCategories(nextPage);
                  }}
                  disabled={olistBusy || olistItems.length === 0}
                  className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
                >
                  Próxima página
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">
            Encaminhados ao gerente ({salesHandoffs.length})
          </h2>
          {salesHandoffs.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum encaminhamento pendente.</p>
          ) : (
            <div className="space-y-2">
              {salesHandoffs.slice(0, 10).map((h) => (
                <div
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 bg-zinc-50 px-3 py-2"
                >
                  <div className="text-xs text-zinc-700">
                    <div className="font-medium text-zinc-900">{h.title.replace('[HANDOFF_GERENTE] ', '')}</div>
                    <div className="text-zinc-500">{(h.description ?? '').slice(0, 180)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void resolveSalesHandoff(h.id)}
                    disabled={salesBusy}
                    className="rounded-md border border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 px-2 py-1 text-xs text-[var(--mobi-graphite)]"
                  >
                    Marcar resolvido
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Roadmap</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-zinc-500">
            <li>OAuth Microsoft Graph (OneDrive)</li>
            <li>WhatsApp Cloud API com verificação de assinatura</li>
            <li>Múltiplos provedores de modelo</li>
          </ul>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmHandoffOpen}
        title={pendingHandoff?.paused ? 'Assumir atendimento humano' : 'Retomar bot no contato'}
        message={
          pendingHandoff?.paused
            ? 'Confirma pausar o bot para este contato e manter atendimento humano?'
            : 'Confirma reativar o bot para este contato?'
        }
        confirmLabel="Confirmar"
        cancelLabel="Voltar"
        busy={whatsAppBusy}
        onCancel={() => {
          setConfirmHandoffOpen(false);
          setPendingHandoff(null);
        }}
        onConfirm={() => void confirmContactHandoff()}
      />
      <ConfirmDialog
        open={confirmWhatsAppModeOpen}
        title="Alterar modo do WhatsApp"
        message={
          pendingWhatsAppMode === 'manual'
            ? 'Confirma mudar para modo manual? O bot para de responder automaticamente ate nova troca.'
            : 'Confirma mudar para modo agente? O bot volta a responder automaticamente.'
        }
        confirmLabel="Confirmar"
        cancelLabel="Voltar"
        busy={whatsAppBusy}
        onCancel={() => {
          setConfirmWhatsAppModeOpen(false);
          setPendingWhatsAppMode(null);
        }}
        onConfirm={() => void confirmWhatsAppModeChange()}
      />
      <ConfirmDialog
        open={confirmDisconnectOpen}
        title="Desconectar Olist"
        message="Essa ação remove o token atual e exige uma nova autorização OAuth para reconectar. Deseja continuar?"
        confirmLabel="Desconectar"
        cancelLabel="Voltar"
        busy={olistBusy}
        onCancel={() => setConfirmDisconnectOpen(false)}
        onConfirm={() => void disconnectOlist()}
      />
    </div>
  );
}
