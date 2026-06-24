import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { env } from '../../config/env';
import type { BlingMultiStoreStockResponse } from '../integrations/bling.types';
import { buildPeraStockExcelBuffer, buildPeraStockExportFileName } from '../integrations/blingStockExcel';

const EXPORTS_DIR = path.resolve(process.cwd(), 'storage', 'exports');
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

type ExportMeta = {
  userId: string;
  fileName: string;
  filePath: string;
  expiresAt: number;
};

function exportMetaPath(fileId: string): string {
  return path.join(EXPORTS_DIR, fileId, 'meta.json');
}

export async function createPeraStockExcelExport(input: {
  userId: string;
  data: BlingMultiStoreStockResponse;
}): Promise<string> {
  const fileId = randomUUID();
  const fileName = buildPeraStockExportFileName();
  const dir = path.join(EXPORTS_DIR, fileId);
  await mkdir(dir, { recursive: true });

  const buffer = await buildPeraStockExcelBuffer(input.data);
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, buffer);

  const meta: ExportMeta = {
    userId: input.userId,
    fileName,
    filePath,
    expiresAt: Date.now() + EXPORT_TTL_MS,
  };
  await writeFile(exportMetaPath(fileId), JSON.stringify(meta), 'utf8');

  const token = jwt.sign(
    { fileId, userId: input.userId, typ: 'export_download' },
    env.JWT_SECRET,
    { expiresIn: '24h' },
  );

  return `/api/exports/${fileId}?token=${encodeURIComponent(token)}`;
}

export async function loadExportFile(input: {
  fileId: string;
  userId: string;
}): Promise<{ filePath: string; fileName: string } | null> {
  let raw: string;
  try {
    raw = await readFile(exportMetaPath(input.fileId), 'utf8');
  } catch {
    return null;
  }

  const meta = JSON.parse(raw) as ExportMeta;
  if (meta.userId !== input.userId) return null;
  if (meta.expiresAt <= Date.now()) return null;

  return { filePath: meta.filePath, fileName: meta.fileName };
}
