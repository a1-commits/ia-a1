import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';

function retentionCutoff(): Date {
  const days = Math.max(1, env.SECURITY_AUDIT_RETENTION_DAYS);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function cleanupSecurityAuditMemories(): Promise<number> {
  const cutoff = retentionCutoff();
  const result = await prisma.memory.deleteMany({
    where: {
      title: { startsWith: 'SECURITY_AUDIT:' },
      createdAt: { lt: cutoff },
    },
  });
  return result.count;
}

let timer: NodeJS.Timeout | null = null;

export function startSecurityRetentionWorker(): void {
  if (timer) return;
  void cleanupSecurityAuditMemories().then((count) => {
    if (count > 0) console.log(`[security] limpeza inicial de auditoria: ${count} registros removidos`);
  });
  timer = setInterval(() => {
    void cleanupSecurityAuditMemories().then((count) => {
      if (count > 0) console.log(`[security] limpeza diária de auditoria: ${count} registros removidos`);
    });
  }, 24 * 60 * 60 * 1000);
}

