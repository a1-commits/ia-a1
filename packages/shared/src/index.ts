/** Tipos e constantes compartilhados (espelham enums do Prisma no backend). */

export const ContextType = {
  PESSOAL: 'PESSOAL',
  MOBLE: 'MOBLE',
  KARRUN: 'KARRUN',
  GERAL: 'GERAL',
} as const;
export type ContextType = (typeof ContextType)[keyof typeof ContextType];

export const MemoryType = {
  TEMPORARIA: 'TEMPORARIA',
  PERMANENTE: 'PERMANENTE',
} as const;
export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const MessageRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const ProposalStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  APPROVED: 'APPROVED',
  LOST: 'LOST',
} as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];
