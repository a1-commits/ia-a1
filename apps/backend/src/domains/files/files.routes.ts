import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { prisma } from '../../lib/prisma';

export const filesRouter = Router();
filesRouter.use(authMiddleware);

filesRouter.get('/', (_req, res) => {
  res.json({
    message: 'Módulo de arquivos preparado para uploads futuros.',
    storageHint: 'Use o volume em storage/uploads no host.',
  });
});

filesRouter.get('/generated-images/:id', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const id = req.params.id;
    const image = await prisma.generatedImage.findFirst({
      where: { id, userId },
      select: { storagePath: true, mimeType: true, fileName: true },
    });
    if (!image) {
      res.status(404).json({ error: 'Imagem não encontrada' });
      return;
    }

    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(image.storagePath, { headers: { 'Content-Disposition': `inline; filename="${image.fileName}"` } });
  } catch (e) {
    next(e);
  }
});
