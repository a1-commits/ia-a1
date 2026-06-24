import type { Request, Response } from 'express';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { authMiddleware } from '../../middleware/authMiddleware';
import { loadExportFile } from './peraStockExport.service';

type ExportDownloadPayload = {
  fileId: string;
  userId: string;
  typ: string;
};

export const exportsRouter = Router();

async function resolveExportUserId(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string; typ?: string };
      if (payload.typ && payload.typ !== 'access') return null;
      return payload.userId;
    } catch {
      return null;
    }
  }

  const queryToken = req.query.token;
  if (typeof queryToken !== 'string' || !queryToken.trim()) return null;

  try {
    const payload = jwt.verify(queryToken, env.JWT_SECRET) as ExportDownloadPayload;
    if (payload.typ !== 'export_download') return null;
    if (payload.fileId !== req.params.fileId) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

exportsRouter.get('/:fileId/meta', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId!;
    const fileId = req.params.fileId;
    const file = await loadExportFile({ fileId, userId });
    if (!file) {
      res.status(404).json({ error: 'Arquivo não encontrado ou expirado' });
      return;
    }
    res.json({ fileName: file.fileName });
  } catch (error) {
    next(error);
  }
});

exportsRouter.get('/:fileId', async (req, res, next) => {
  try {
    const userId = await resolveExportUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Autenticação necessária para baixar o arquivo' });
      return;
    }

    const fileId = req.params.fileId;
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) {
      res.status(404).json({ error: 'Arquivo não encontrado' });
      return;
    }

    const file = await loadExportFile({ fileId, userId });
    if (!file) {
      res.status(404).json({ error: 'Arquivo não encontrado ou expirado' });
      return;
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.download(file.filePath, file.fileName);
  } catch (error) {
    next(error);
  }
});
