'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MetricCard } from '@/components/MetricCard';
import { OlistFinancePhase1 } from '@/components/OlistFinancePhase1';
import { api } from '@/lib/api';

type OperatorOverview = {
  updatedAt: string;
  ai: {
    mode: 'real' | 'mock';
    provider: 'openai' | 'ollama' | 'mock';
    strategy: 'local_only' | 'hybrid' | 'openai_only';
    reason: string | null;
  };
  whatsapp: {
    status: {
      connected: boolean;
      qrPending: boolean;
      autoReplyMode: 'agent' | 'manual';
      lastError: string | null;
    };
    recentContacts: Array<{
      number: string;
      paused: boolean;
      lastInboundAt: string;
      lastInboundPreview: string;
    }>;
  };
  metrics: {
    openTasks: number;
    openHandoffs: number;
    totalConversations: number;
    archivedConversations: number;
    messagesLast24h: number;
  };
  financeToday: {
    entrada: number;
    saida: number;
    saldo: number;
  };
  operationalSummary?: {
    leads_abertos: number;
    tarefas_pendentes: number;
    contas_a_pagar: number;
    oportunidades: string[];
  };
  commercialFunnel?: {
    hotLeads: number;
    handoffs: number;
    proposals: {
      draft: number;
      sent: number;
      approved: number;
      lost: number;
    };
    recentProposals: Array<{
      id: string;
      title: string;
      status: 'DRAFT' | 'SENT' | 'APPROVED' | 'LOST';
      valueEstimate: number | null;
      updatedAt: string;
    }>;
  };
  recentLeadConversations?: Array<{
    id: string;
    title: string;
    context: string;
    lastMessageAt: string;
    leadScore: number;
    readinessScore: number;
    intentLevel: string;
    recommendedAction: string;
    nextMessageSuggestion: string;
  }>;
  security: {
    recentEvents: Array<{ id: string; title: string; content: string; createdAt: string }>;
  };
};

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

type OperatorTab = 'overview' | 'olist' | 'monitoring';
const OPERATOR_TAB_STORAGE_KEY = 'mobi.operator.active-tab';
const OPERATOR_REDUCE_MOTION_KEY = 'mobi.operator.reduce-motion';
const TAB_ANIMATION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export default function OperatorPage(): React.ReactElement {
  const [data, setData] = useState<OperatorOverview | null>(null);
  const [olistStatus, setOlistStatus] = useState<OlistStatus | null>(null);
  const [olistBusy, setOlistBusy] = useState(false);
  const [confirmWhatsAppModeOpen, setConfirmWhatsAppModeOpen] = useState(false);
  const [pendingWhatsAppMode, setPendingWhatsAppMode] = useState<'agent' | 'manual' | null>(null);
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
  const [olistFeedback, setOlistFeedback] = useState<{
    text: string;
    tone: 'loading' | 'success' | 'warning' | 'error';
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OperatorTab>('overview');
  const [reduceMotion, setReduceMotion] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [overviewRes, olistRes] = await Promise.all([
        api<OperatorOverview>('/api/operator/overview'),
        api<OlistStatus>('/api/integrations/olist/status'),
      ]);
      setData(overviewRes);
      setOlistStatus(olistRes);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao carregar painel do operador');
      setOlistStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 12000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    void handleOlistOAuthReturn();
  }, []);

  useEffect(() => {
    const savedTab = window.localStorage.getItem(OPERATOR_TAB_STORAGE_KEY);
    if (savedTab === 'overview' || savedTab === 'olist' || savedTab === 'monitoring') {
      setActiveTab(savedTab);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(OPERATOR_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const savedPreference = window.localStorage.getItem(OPERATOR_REDUCE_MOTION_KEY);
    if (savedPreference === 'true' || savedPreference === 'false') {
      setReduceMotion(savedPreference === 'true');
      return;
    }
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduceMotion(prefersReducedMotion);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(OPERATOR_REDUCE_MOTION_KEY, String(reduceMotion));
  }, [reduceMotion]);

  async function setMode(mode: 'agent' | 'manual'): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/operator/actions/whatsapp-mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao alterar modo');
    } finally {
      setBusy(false);
    }
  }

  function requestWhatsAppMode(mode: 'agent' | 'manual'): void {
    setPendingWhatsAppMode(mode);
    setConfirmWhatsAppModeOpen(true);
  }

  async function confirmWhatsAppModeChange(): Promise<void> {
    if (!pendingWhatsAppMode) return;
    setConfirmWhatsAppModeOpen(false);
    await setMode(pendingWhatsAppMode);
    setPendingWhatsAppMode(null);
  }

  async function refreshOlistOnly(): Promise<void> {
    try {
      const res = await api<OlistStatus>('/api/integrations/olist/status');
      setOlistStatus(res);
    } catch {
      setOlistStatus(null);
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
      await refreshOlistOnly();
      setOlistAuthUrl(null);
      setOlistFeedback({ text: 'OAuth da Olist concluído com sucesso.', tone: 'success' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao concluir OAuth da Olist';
      setErr(msg);
      setOlistFeedback({ text: msg, tone: 'error' });
    } finally {
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
      await refreshOlistOnly();
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
      await refreshOlistOnly();
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
      await refreshOlistOnly();
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
      await refreshOlistOnly();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao desconectar Olist');
    } finally {
      setOlistBusy(false);
    }
  }

  function requestOlistDisconnect(): void {
    setConfirmDisconnectOpen(true);
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
      setErr('Preencha Client ID, Client Secret e URL de redirecionamento.');
      return;
    }
    if (clientId.includes('@')) {
      setErr('Client ID não é e-mail — use o ID do aplicativo na Olist.');
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
      setErr(e instanceof Error ? e.message : 'Falha ao salvar credenciais OAuth');
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
      setErr(e instanceof Error ? e.message : 'Falha ao remover credenciais OAuth');
    } finally {
      setOlistBusy(false);
    }
  }

  const greeting =
    new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const priorities = [
    (data?.metrics.openHandoffs ?? 0) > 0 ? 'Dar continuidade aos handoffs abertos' : null,
    (data?.metrics.openTasks ?? 0) > 0 ? 'Revisar tarefas abertas da operação' : null,
    (data?.metrics.messagesLast24h ?? 0) > 0 ? 'Acompanhar conversas recentes no chat' : null,
    (data?.financeToday.saldo ?? 0) < 0 ? 'Conferir fluxo financeiro do dia' : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="page-shell">
      <div className="page-container">
      <header className="page-header overflow-hidden rounded-[28px] border border-[var(--moble-border)] bg-white/85 p-6 shadow-[0_18px_60px_rgba(14,14,14,0.06)] backdrop-blur md:p-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-2xl border border-[var(--moble-border)] bg-white px-4 py-3 shadow-sm">
            <div className="text-xl font-bold tracking-tight text-[var(--moble-black)]">Mobi</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Centro de Operações</Badge>
            <Badge>
              Atualizado: {data?.updatedAt ? new Date(data.updatedAt).toLocaleString('pt-BR') : 'carregando...'}
            </Badge>
          </div>
        </div>
        <h1 className="mt-6 max-w-3xl text-3xl font-bold tracking-tight text-[var(--moble-black)] md:text-4xl">
          {greeting}. Aqui está o resumo da operação hoje.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--moble-muted)] md:text-base">
          Visão executiva do MOBI para atendimento, tarefas, WhatsApp, financeiro e integrações.
        </p>
      </header>

      {err && <p className="mb-4 rounded-xl border border-[var(--mobi-orange)]/30 bg-[var(--mobi-orange)]/8 px-3 py-2 text-sm text-zinc-700">{err}</p>}

      <div className="mb-5 rounded-2xl border border-[var(--moble-border)] bg-white/82 p-3 shadow-[0_8px_30px_rgba(14,14,14,0.04)]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--moble-muted)]">Navegação do painel</div>
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`relative rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
            activeTab === 'overview'
              ? 'bg-[var(--moble-black)] text-white shadow-sm'
              : 'bg-[var(--moble-bg)] text-[var(--moble-muted)] hover:-translate-y-[1px] hover:bg-white'
          }`}
        >
          {activeTab === 'overview' && (
            <motion.span
              layoutId="operator-active-tab-indicator"
              className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-white/85"
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
            />
          )}
          Visão geral
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('olist')}
          className={`relative rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
            activeTab === 'olist'
              ? 'bg-[var(--moble-black)] text-white shadow-sm'
              : 'bg-[var(--moble-bg)] text-[var(--moble-muted)] hover:-translate-y-[1px] hover:bg-white'
          }`}
        >
          {activeTab === 'olist' && (
            <motion.span
              layoutId="operator-active-tab-indicator"
              className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-white/85"
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
            />
          )}
          Olist ERP
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('monitoring')}
          className={`relative rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
            activeTab === 'monitoring'
              ? 'bg-[var(--moble-black)] text-white shadow-sm'
              : 'bg-[var(--moble-bg)] text-[var(--moble-muted)] hover:-translate-y-[1px] hover:bg-white'
          }`}
        >
          {activeTab === 'monitoring' && (
            <motion.span
              layoutId="operator-active-tab-indicator"
              className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-white/85"
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
            />
          )}
          Monitoramento
        </button>
        </div>
        <div className="mt-3 border-t border-black/10 pt-3">
        <button
          type="button"
          onClick={() => setReduceMotion((prev) => !prev)}
          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
            reduceMotion
              ? 'border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 text-[var(--mobi-graphite)]'
              : 'border-black/10 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
          title="Ativa ou desativa animações do painel"
        >
          {reduceMotion ? 'Animacoes reduzidas: ON' : 'Animacoes reduzidas: OFF'}
        </button>
        <span className="ml-2 text-xs text-zinc-500">Preferência de acessibilidade visual.</span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'overview' && (
          <motion.div
            key="tab-overview"
            {...TAB_ANIMATION}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
            className="space-y-5"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Conversas"
                value={loading || !data ? '...' : data.metrics.totalConversations}
                hint="Total de conversas registradas"
                tone="accent"
              />
              <MetricCard
                label="Tarefas pendentes"
                value={loading || !data ? '...' : (data.operationalSummary?.tarefas_pendentes ?? data.metrics.openTasks)}
                hint="Ações abertas para a operação"
                tone="warning"
              />
              <MetricCard
                label="Conversas 24h"
                value={loading || !data ? '...' : data.metrics.messagesLast24h}
                hint="Movimento recente no agente"
                tone="neutral"
              />
              <MetricCard
                label="Financeiro previsto"
                value={loading || !data ? '...' : `R$ ${data.financeToday.saldo.toFixed(2)}`}
                hint="Saldo registrado hoje"
                tone={(data?.financeToday.saldo ?? 0) >= 0 ? 'success' : 'danger'}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="eyebrow">Prioridades do dia</div>
                    <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Ações recomendadas</h2>
                  </div>
                  <Badge tone="accent">{priorities.length || 1} foco(s)</Badge>
                </div>
                <div className="space-y-3">
                  {(priorities.length > 0 ? priorities : ['Monitorar conversas e revisar o painel de operação.']).slice(0, 5).map((item, index) => (
                    <div key={`${item}-${index}`} className="flex gap-3 rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 p-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--moble-black)] text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-6 text-[var(--moble-gray)]">{item}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <div className="eyebrow">Inteligência do MOBI</div>
                <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Operação IA + WhatsApp</h2>
                <p className="mt-4 text-sm text-[var(--moble-muted)]">
                  IA: <strong className="text-[var(--moble-black)]">{data?.ai.provider ?? '...'}</strong> ({data?.ai.strategy ?? '...'})
                </p>
                <p className="mt-2 text-sm text-[var(--moble-muted)]">
                  WhatsApp: <strong className="text-[var(--moble-black)]">{data?.whatsapp.status.connected ? 'conectado' : 'desconectado'}</strong> · modo{' '}
                  <strong className="text-[var(--moble-black)]">{data?.whatsapp.status.autoReplyMode ?? '...'}</strong>
                </p>
                {data?.whatsapp.status.lastError && (
                  <p className="mt-2 text-xs text-[var(--mobi-orange)]">{data.whatsapp.status.lastError}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => requestWhatsAppMode('agent')}
                    variant="accent"
                    className="px-3 py-2 text-xs"
                  >
                    Modo agente
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => requestWhatsAppMode('manual')}
                    variant="ghost"
                    className="px-3 py-2 text-xs"
                  >
                    Modo manual
                  </Button>
                </div>
              </Card>

              <Card>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="eyebrow">Financeiro</div>
                    <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Fluxo previsto hoje</h2>
                  </div>
                  <Badge tone={(data?.financeToday.saldo ?? 0) >= 0 ? 'success' : 'danger'}>
                    {(data?.financeToday.saldo ?? 0) >= 0 ? 'positivo' : 'atenção'}
                  </Badge>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">A receber</div>
                    <div className="mt-1 text-2xl font-bold text-[var(--moble-success)]">
                      {loading || !data ? '...' : formatCurrency(data.financeToday.entrada)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/70 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-[var(--moble-muted)]">A pagar</div>
                    <div className="mt-1 text-2xl font-bold text-[var(--moble-danger)]">
                      {loading || !data ? '...' : formatCurrency(data.financeToday.saida)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[var(--moble-black)] p-4 text-white">
                    <div className="text-xs font-bold uppercase tracking-wide text-white/55">Saldo projetado</div>
                    <div className="mt-1 text-3xl font-bold">
                      {loading || !data ? '...' : formatCurrency(data.financeToday.saldo)}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/65">
                      {data?.operationalSummary?.contas_a_pagar ?? 0} conta(s) a pagar monitoradas na operação.
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Conversas recentes</div>
                  <h2 className="mt-1 text-xl font-bold text-[var(--moble-black)]">Últimas interações</h2>
                </div>
                <Badge>{data?.recentLeadConversations?.length ?? 0} conversas</Badge>
              </div>
              <div className="space-y-3">
                {(data?.recentLeadConversations ?? []).slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--moble-border)] bg-[var(--moble-bg)]/60 p-4">
                    <div className="font-semibold text-[var(--moble-black)]">{item.title}</div>
                    <div className="mt-1 text-xs text-[var(--moble-muted)]">
                      {new Date(item.lastMessageAt).toLocaleString('pt-BR')} · {item.context}
                    </div>
                  </div>
                ))}
                {!loading && (data?.recentLeadConversations?.length ?? 0) === 0 && (
                  <p className="text-sm text-[var(--moble-muted)]">Sem conversas recentes.</p>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {activeTab === 'olist' && (
          <motion.div
            key="tab-olist"
            {...TAB_ANIMATION}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
            className="mt-1 grid gap-4 lg:grid-cols-2"
          >
            <Card className="lg:col-span-2">
            <h2 className="mb-3 text-base font-semibold text-[var(--mobi-graphite)]">Integração Olist ERP</h2>
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
            Chamadas usando:{' '}
            <strong className="text-zinc-800">
              {!olistStatus
                ? '…'
                : olistStatus.authMethod === 'api_token'
                  ? `token API (${olistStatus.apiTokenSource === 'env' ? '.env' : 'salvo'})`
                  : olistStatus.authMethod === 'oauth'
                    ? 'OAuth'
                    : 'nenhuma'}
            </strong>
          </p>

          <div className="mb-3 rounded-lg border border-black/10 bg-zinc-50 p-3">
            <div className="mb-2 text-xs font-medium text-[var(--mobi-graphite)]">OAuth — Client ID / Secret</div>
            <p className="mb-2 text-[11px] text-zinc-600">
              Chaves do aplicativo na Olist (não é e-mail de login). Redirect igual ao cadastrado lá.
            </p>
            {(olistStatus?.oauthClientIdMasked || olistStatus?.oauthRedirectUri) && (
              <p className="mb-2 text-[11px] text-zinc-700">
                {olistStatus.oauthClientIdMasked ? <>ID: <strong>{olistStatus.oauthClientIdMasked}</strong></> : null}
                {olistStatus.oauthRedirectUri ? (
                  <>
                    {' '}
                    · Redirect: <strong className="break-all">{olistStatus.oauthRedirectUri}</strong>
                  </>
                ) : null}
                <span className="text-zinc-500">
                  {' '}
                  ({olistStatus.oauthAppUserSaved ? 'salvo aqui' : '.env servidor'})
                </span>
              </p>
            )}
            <div className="mb-2 flex flex-col gap-1.5">
              <input
                type="text"
                autoComplete="off"
                value={olistOAuthClientId}
                onChange={(e) => setOlistOAuthClientId(e.target.value)}
                placeholder="Client ID"
                className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
              />
              <input
                type="password"
                autoComplete="off"
                value={olistOAuthClientSecret}
                onChange={(e) => setOlistOAuthClientSecret(e.target.value)}
                placeholder="Client Secret"
                className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
              />
              <input
                type="url"
                autoComplete="off"
                value={olistOAuthRedirectUri}
                onChange={(e) => setOlistOAuthRedirectUri(e.target.value)}
                placeholder="http://localhost:3000/settings"
                className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveOlistOAuthFromPanel()}
                disabled={
                  olistBusy ||
                  olistOAuthClientId.trim().length < 2 ||
                  olistOAuthClientSecret.trim().length < 4 ||
                  olistOAuthRedirectUri.trim().length < 8
                }
                className="rounded-md border border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 px-2 py-1 text-xs text-[var(--mobi-graphite)] disabled:opacity-50"
              >
                Salvar OAuth
              </button>
              <button
                type="button"
                onClick={() => void removeOlistOAuthFromPanel()}
                disabled={olistBusy || !olistStatus?.oauthAppUserSaved}
                className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
              >
                Remover salvo
              </button>
            </div>
          </div>

          <div className="mb-3 rounded-lg border border-black/10 bg-zinc-50 p-3">
            <div className="mb-2 text-xs font-medium text-[var(--mobi-graphite)]">Token de API</div>
            {olistStatus?.apiTokenMasked && (
              <p className="mb-2 text-xs text-zinc-700">
                Ativo: <strong>{olistStatus.apiTokenMasked}</strong>
                {olistStatus.apiTokenSource === 'env' ? (
                  <span className="text-zinc-500"> (.env servidor)</span>
                ) : null}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                autoComplete="off"
                value={olistApiTokenInput}
                onChange={(e) => setOlistApiTokenInput(e.target.value)}
                placeholder="Colar token"
                className="min-w-[180px] flex-1 rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-[var(--mobi-orange)]/50"
              />
              <button
                type="button"
                onClick={() => void saveOlistApiToken()}
                disabled={olistBusy || olistApiTokenInput.trim().length < 8}
                className="rounded-md border border-[var(--mobi-orange)]/45 bg-[var(--mobi-orange)]/12 px-2 py-1 text-xs text-[var(--mobi-graphite)] disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => void removeOlistApiToken()}
                disabled={olistBusy || olistStatus?.apiTokenSource !== 'user'}
                className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
              >
                Remover salvo
              </button>
            </div>
          </div>

          <div className="space-y-1 text-sm text-zinc-600">
            <p>
              Expiração do token:{' '}
              <strong className="text-zinc-700">
                {olistStatus?.expiresAt ? new Date(olistStatus.expiresAt).toLocaleString('pt-BR') : 'não disponível'}
              </strong>
            </p>
            <p>
              Janela de limite:{' '}
              <strong className="text-zinc-700">
                {olistStatus?.rateLimit
                  ? `${olistStatus.rateLimit.remaining ?? '?'} / ${olistStatus.rateLimit.limit ?? '?'}`
                  : 'sem dados'}
              </strong>
            </p>
            <p>
              Reset estimado:{' '}
              <strong className="text-zinc-700">
                {olistStatus?.rateLimit?.resetSeconds != null
                  ? `${olistStatus.rateLimit.resetSeconds}s`
                  : 'sem dados'}
              </strong>
            </p>
          </div>
          {olistStatus?.oauthTokenDebug && (
            <div className="mt-2 rounded-lg border border-black/10 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-700">
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
          <div className="mt-3 flex flex-wrap gap-2">
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
              onClick={() => void refreshOlistOnly()}
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <div className="mt-3">
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
          </div>
          {olistCategory && (
            <div className="mt-3 rounded-lg border border-black/10 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
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
            <div className="mt-3 rounded-lg border border-black/10 bg-zinc-50 p-2">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-700">
                <span>Categorias encontradas ({olistItems.length})</span>
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
          </motion.div>
        )}

        {activeTab === 'monitoring' && (
          <motion.div
            key="tab-monitoring"
            {...TAB_ANIMATION}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
            className="mt-1 grid gap-4 lg:grid-cols-2"
          >
            <Card>
            <h2 className="mb-3 text-base font-semibold text-[var(--mobi-graphite)]">Contatos recentes no WhatsApp</h2>
            <div className="space-y-2">
              {(data?.whatsapp.recentContacts ?? []).slice(0, 8).map((c) => (
                <div key={`${c.number}-${c.lastInboundAt}`} className="rounded-lg border border-black/10 bg-zinc-50 px-3 py-2 text-xs">
                  <div className="font-medium text-zinc-800">{c.number}</div>
                  <div className="text-zinc-600">{c.lastInboundPreview}</div>
                  <div className="text-zinc-500">{c.paused ? 'handoff humano ativo' : 'bot ativo'}</div>
                </div>
              ))}
              {!loading && (data?.whatsapp.recentContacts?.length ?? 0) === 0 && (
                <div className="text-xs text-zinc-500">Sem contatos recentes.</div>
              )}
            </div>
            </Card>

            <Card>
            <h2 className="mb-3 text-base font-semibold text-[var(--mobi-graphite)]">Eventos de segurança recentes</h2>
            <div className="space-y-2">
              {(data?.security.recentEvents ?? []).slice(0, 8).map((e) => (
                <div key={e.id} className="rounded-lg border border-black/10 bg-zinc-50 px-3 py-2 text-xs">
                  <div className="font-medium text-zinc-800">{e.title}</div>
                  <div className="line-clamp-2 text-zinc-600">{e.content}</div>
                  <div className="text-zinc-500">{new Date(e.createdAt).toLocaleString('pt-BR')}</div>
                </div>
              ))}
              {!loading && (data?.security.recentEvents?.length ?? 0) === 0 && (
                <div className="text-xs text-zinc-500">Sem eventos de segurança recentes.</div>
              )}
            </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
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
        busy={busy}
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
    </div>
  );
}

