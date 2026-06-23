import type { Agent } from '@prisma/client';
import {
  aggregateStockForAgent,
  agentHasBlingTool,
  findProductOptionsByNameForAgent,
} from './bling.service';
import {
  formatProductDisambiguationResponse,
  logGtinSearchDiagnostic,
  parseBlingStockRequest,
  shouldAutoSelectNameMatch,
} from './blingProductSearch';
import {
  BLING_TOOL_NAME,
  formatStockResponse,
} from './bling.types';

const STOCK_KEYWORDS =
  /estoque|c[oó]digo de barras|barras|gtin|ean|saldo|m[ií]nimo|produto|bling|consulta|sku|c[oó]digo interno/i;

export function shouldUseBlingStockTool(agent: Agent, content: string): boolean {
  const request = parseBlingStockRequest(content);
  if (!request) return false;
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

  const request = parseBlingStockRequest(input.content);
  if (!request) return null;

  if (request.kind === 'name') {
    logGtinSearchDiagnostic({
      query: request.query,
      mode: 'NAME',
      endpoint: 'findProductOptionsByNameForAgent',
      phase: 'primary',
      candidateCount: 0,
      firstCandidate: null,
      matched: false,
      matchSource: 'request-start',
    });
    const options = await findProductOptionsByNameForAgent({
      userId: input.userId,
      agentId: input.agent.id,
      nameQuery: request.query,
    });
    if (shouldAutoSelectNameMatch(options)) return null;
    return formatProductDisambiguationResponse(options);
  }

  const data = await aggregateStockForAgent({
    userId: input.userId,
    agentId: input.agent.id,
    barcodes: request.queries,
    queryMode: request.kind === 'sku' ? 'sku' : 'gtin',
  });

  return formatStockResponse(data);
}

export { BLING_TOOL_NAME };
