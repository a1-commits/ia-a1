import fs from 'node:fs/promises';
import path from 'node:path';

export type LocalKnowledgeSnippet = {
  id: string;
  name: string;
  source: string;
  snippet: string;
};

type KnowledgeDoc = {
  id: string;
  name: string;
  source: string;
  content: string;
};

const TARGET_FOLDERS = ['empresa', 'clientes', 'conversas', 'playbooks', 'faq'] as const;
const CACHE_TTL_MS = 60_000;
const MAX_DOCS = 80;

let cache: { expiresAt: number; docs: KnowledgeDoc[] } | null = null;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function queryTokens(query: string): string[] {
  const unique = new Set(
    normalizeText(query)
      .split(/[^a-z0-9]+/g)
      .map((x) => x.trim())
      .filter((x) => x.length >= 3),
  );
  return [...unique];
}

function scoreContent(content: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const normalized = normalizeText(content);
  let score = 0;
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = normalized.match(new RegExp(escaped, 'g')) ?? [];
    score += matches.length;
  }
  return score;
}

function clip(text: string, max = 1200): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function bestSnippet(content: string, tokens: string[]): string {
  const raw = content.replace(/\r/g, '');
  if (tokens.length === 0) return clip(raw, 420);

  const lines = raw.split('\n').map((x) => x.trim()).filter(Boolean);
  let best = '';
  let bestScore = -1;
  for (const line of lines) {
    const s = scoreContent(line, tokens);
    if (s > bestScore) {
      bestScore = s;
      best = line;
    }
  }
  if (bestScore <= 0) return clip(raw, 420);
  return clip(best, 420);
}

async function existsDir(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(dir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function resolveDataRoot(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), '../../data'),
    path.resolve(__dirname, '../../../../..', 'data'),
    path.resolve(__dirname, '../../../../../..', 'data'),
  ];
  for (const dir of candidates) {
    if (await existsDir(dir)) return dir;
  }
  return null;
}

async function readFolderDocs(root: string, folder: string): Promise<KnowledgeDoc[]> {
  const folderPath = path.join(root, folder);
  if (!(await existsDir(folderPath))) return [];

  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const docs: KnowledgeDoc[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!['.md', '.txt', '.json'].includes(ext)) continue;
    const full = path.join(folderPath, entry.name);
    let content = '';
    try {
      content = await fs.readFile(full, 'utf8');
    } catch {
      continue;
    }
    if (!content.trim()) continue;
    docs.push({
      id: `${folder}/${entry.name}`,
      name: entry.name,
      source: folder,
      content,
    });
  }
  return docs;
}

async function loadDocs(): Promise<KnowledgeDoc[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.docs;

  const root = await resolveDataRoot();
  if (!root) {
    cache = { expiresAt: now + CACHE_TTL_MS, docs: [] };
    return [];
  }

  const grouped = await Promise.all(TARGET_FOLDERS.map((folder) => readFolderDocs(root, folder)));
  const docs = grouped.flat().slice(0, MAX_DOCS);
  cache = { expiresAt: now + CACHE_TTL_MS, docs };
  return docs;
}

export async function getRelevantLocalKnowledgeSnippets(
  query: string,
): Promise<LocalKnowledgeSnippet[]> {
  const docs = await loadDocs();
  if (docs.length === 0) return [];

  const tokens = queryTokens(query);
  const ranked = docs
    .map((doc) => ({
      doc,
      score: scoreContent(doc.content, tokens),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = ranked
    .filter((x, i) => x.score > 0 || (tokens.length === 0 && i < 3))
    .slice(0, 6)
    .map(({ doc }) => ({
      id: doc.id,
      name: doc.name,
      source: doc.source,
      snippet: bestSnippet(doc.content, tokens),
    }));

  return selected;
}

