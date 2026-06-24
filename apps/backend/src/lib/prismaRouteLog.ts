type PrismaLikeError = {
  code?: string;
  message?: string;
};

export function extractPrismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as PrismaLikeError).code;
  return typeof code === 'string' ? code : null;
}

export function logPrismaRouteError(input: {
  route: string;
  userId?: string;
  conversationId?: string;
  error: unknown;
}): void {
  const code = extractPrismaErrorCode(input.error);
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  console.error(
    '[api:prisma]',
    JSON.stringify({
      route: input.route,
      userId: input.userId ?? null,
      conversationId: input.conversationId ?? null,
      prismaCode: code,
      message,
    }),
  );
}
