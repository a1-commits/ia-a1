import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validação falhou',
      details: err.flatten(),
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Erro interno';
  const status = (err as { status?: number }).status ?? 500;

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    error: status >= 500 ? 'Erro interno' : message,
  });
}
