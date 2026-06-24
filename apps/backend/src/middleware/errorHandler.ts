import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { extractPrismaErrorCode } from '../lib/prismaRouteLog';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validação falhou',
      details: err.flatten(),
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Erro interno';
  const status = (err as { status?: number }).status ?? 500;
  const prismaCode = extractPrismaErrorCode(err);

  if (status >= 500 || prismaCode) {
    console.error(
      '[api:error]',
      JSON.stringify({
        route: req.originalUrl,
        method: req.method,
        userId: (req as Request & { userId?: string }).userId ?? null,
        status,
        prismaCode,
        message,
      }),
    );
    if (status >= 500 && err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  }

  res.status(status).json({
    error: status >= 500 ? 'Erro interno' : message,
  });
}
