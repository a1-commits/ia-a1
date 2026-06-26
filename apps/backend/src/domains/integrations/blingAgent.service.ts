import type { Agent } from '@prisma/client';
import { BLING_TOOL_NAME } from './bling.types';

/** @deprecated Use intentRouter + blingQueryEngine. Mantido apenas para compatibilidade de import. */
export { BLING_TOOL_NAME };

/** @deprecated Substituído por classifyIntent() em intentRouter.service.ts */
export function shouldUseBlingStockTool(_agent: Agent, _content: string): boolean {
  return false;
}

/** @deprecated Substituído por runAgentEngine() + executeBlingQuery() */
export async function tryHandleBlingStockQuery(_input: {
  userId: string;
  agent: Agent;
  content: string;
}): Promise<string | null> {
  return null;
}
