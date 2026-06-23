import type { Agent } from '@prisma/client';
import {
  aggregateStockForAgent,
  agentHasBlingTool,
} from './bling.service';
import {
  BLING_TOOL_NAME,
  extractBarcodesFromText,
  formatStockResponse,
} from './bling.types';

const STOCK_KEYWORDS =
  /estoque|c[oó]digo de barras|barras|gtin|ean|saldo|m[ií]nimo|produto|bling|consulta/i;

export function shouldUseBlingStockTool(agent: Agent, content: string): boolean {
  const barcodes = extractBarcodesFromText(content);
  if (barcodes.length === 0) return false;
  if (agent.name.toLowerCase().includes('pera')) return true;
  return STOCK_KEYWORDS.test(content);
}

export async function tryHandleBlingStockQuery(input: {
  userId: string;
  agent: Agent;
  content: string;
}): Promise<string | null> {
  const hasTool = await agentHasBlingTool(input.agent.id);
  if (!hasTool && !input.agent.name.toLowerCase().includes('pera')) return null;
  if (!shouldUseBlingStockTool(input.agent, input.content)) return null;

  const barcodes = extractBarcodesFromText(input.content);
  if (barcodes.length === 0) return null;

  const data = await aggregateStockForAgent({
    userId: input.userId,
    agentId: input.agent.id,
    barcodes,
  });

  return formatStockResponse(data);
}

export { BLING_TOOL_NAME };
