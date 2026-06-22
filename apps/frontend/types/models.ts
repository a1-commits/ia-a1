import type {
  ContextType,
  MemoryType,
  MessageRole,
  ProposalStatus,
  TaskPriority,
  TaskStatus,
} from '@agente-mobi/shared';

export type { ContextType, MemoryType, MessageRole, ProposalStatus, TaskPriority, TaskStatus };

export type UserRole = 'ADMIN' | 'OPERATOR' | 'READONLY';

export type User = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
};

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  context: ContextType;
  pinned?: boolean;
  archived?: boolean;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type Memory = {
  id: string;
  userId: string;
  title: string;
  content: string;
  context: ContextType;
  type: MemoryType;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  context: ContextType;
  createdAt: string;
  updatedAt: string;
};

export type Proposal = {
  id: string;
  userId: string;
  conversationId: string | null;
  title: string;
  content: string;
  summary: string | null;
  status: ProposalStatus;
  valueEstimate: number | null;
  createdAt: string;
  updatedAt: string;
  conversation?: Conversation | null;
};

export type Reflection = {
  id: string;
  userId: string;
  title: string;
  content: string;
  context: ContextType;
  createdAt: string;
  updatedAt: string;
};
