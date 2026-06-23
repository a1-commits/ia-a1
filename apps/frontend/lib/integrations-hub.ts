import { api } from '@/lib/api';
import { TOOL_CATALOG, type PlatformTool } from '@/types/platform';

type WhatsAppStatus = {
  connected: boolean;
  startedAt: string | null;
};

type OlistStatus = {
  connected: boolean;
  rateLimit: { updatedAt: string } | null;
};

export async function fetchPlatformTools(): Promise<PlatformTool[]> {
  const [whatsapp, olist] = await Promise.all([
    api<WhatsAppStatus>('/api/whatsapp/status').catch(() => null),
    api<OlistStatus>('/api/integrations/olist/status').catch(() => null),
  ]);

  return TOOL_CATALOG.map((tool) => {
    let connected = false;
    let lastSync: string | null = null;

    if (tool.id === 'whatsapp' && whatsapp) {
      connected = whatsapp.connected;
      lastSync = whatsapp.startedAt;
    }
    if (tool.id === 'olist' && olist) {
      connected = olist.connected;
      lastSync = olist.rateLimit?.updatedAt ?? null;
    }

    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      connected,
      lastSync,
      settingsHref: tool.settingsHref,
    };
  });
}

export async function countConnectedTools(): Promise<number> {
  const tools = await fetchPlatformTools();
  return tools.filter((t) => t.connected).length;
}
