import type { ContextType } from '@prisma/client';
import type { LeadDecision } from '../../ai/lead-decision-engine';

export type InterpretedKind = 'message' | 'memory' | 'task' | 'reflection';

export type AgentInterpretation = {
  context: ContextType;
  kind: InterpretedKind;
  confidence: number;
  rationale: string;
};

export type AgentAutoCreated = {
  memoryId?: string;
  taskId?: string;
  reflectionId?: string;
};

export type AgentImageJobMeta = {
  id: string;
  status: string;
};

export type AgentMeta = {
  contextDetected: ContextType;
  kindDetected: InterpretedKind;
  confidence: number;
  autoCreated: AgentAutoCreated;
  rationale: string;
  leadDecision?: LeadDecision;
  imageJob?: AgentImageJobMeta;
};

export type RelatedContextBundle = {
  openTasks: Array<{ id: string; title: string; description: string | null }>;
  recentMemories: Array<{ id: string; title: string; content: string }>;
  founderProfileMemories: Array<{ id: string; title: string; content: string }>;
  recentReflections: Array<{ id: string; title: string; content: string }>;
  oneDriveSnippets: Array<{ id: string; name: string; snippet: string }>;
  localKnowledgeSnippets: Array<{ id: string; name: string; source: string; snippet: string }>;
};
