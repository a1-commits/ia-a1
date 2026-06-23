import { ToolType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const TOOL_KEY_TO_TYPE: Record<string, ToolType> = {
  bling: ToolType.BLING,
  gmail: ToolType.GMAIL,
  'google-agenda': ToolType.GOOGLE_CALENDAR,
  webhook: ToolType.WEBHOOK,
  olist: ToolType.CUSTOM_API,
};

const TOOL_TYPE_LABELS: Record<ToolType, string> = {
  [ToolType.BLING]: 'Bling',
  [ToolType.GMAIL]: 'Gmail',
  [ToolType.GOOGLE_CALENDAR]: 'Google Agenda',
  [ToolType.WEBHOOK]: 'Webhook',
  [ToolType.CUSTOM_API]: 'API customizada',
};

export function toolKeyFromType(type: ToolType, name?: string): string {
  if (type === ToolType.CUSTOM_API && name?.toLowerCase().includes('olist')) return 'olist';
  const entry = Object.entries(TOOL_KEY_TO_TYPE).find(([, t]) => t === type);
  return entry?.[0] ?? type.toLowerCase();
}

async function getOrCreateToolConnection(userId: string, key: string): Promise<string | null> {
  const type = TOOL_KEY_TO_TYPE[key];
  if (!type) return null;

  const existing = await prisma.toolConnection.findUnique({
    where: { userId_type: { userId, type } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.toolConnection.create({
    data: {
      userId,
      type,
      name: TOOL_TYPE_LABELS[type],
      isEnabled: false,
      config: {},
    },
    select: { id: true },
  });
  return created.id;
}

export async function syncAgentTools(userId: string, agentId: string, toolKeys: string[]): Promise<void> {
  const toolIds: string[] = [];
  for (const key of toolKeys) {
    const id = await getOrCreateToolConnection(userId, key);
    if (id) toolIds.push(id);
  }

  await prisma.agentTool.deleteMany({ where: { agentId } });
  if (toolIds.length > 0) {
    await prisma.agentTool.createMany({
      data: toolIds.map((toolId) => ({ agentId, toolId })),
      skipDuplicates: true,
    });
  }
}

export function extractToolKeys(
  agentTools: Array<{ tool: { type: ToolType; name: string } }> | undefined,
): string[] {
  if (!agentTools) return [];
  return agentTools.map(({ tool }) => toolKeyFromType(tool.type, tool.name));
}
