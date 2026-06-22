import { ContextType, MemoryType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

type FounderMemorySeed = {
  title: string;
  content: string;
};

const RONAN_PROFILE_SEED: FounderMemorySeed[] = [
  {
    title: 'PERFIL_RONAN: identidade',
    content:
      'Usuario principal: Ronan Nanuncio. Papel: fundador, administrador e dono da empresa. Tratamento esperado: postura de assessor executivo, com respeito, prioridade e foco em resultado.',
  },
  {
    title: 'PERFIL_RONAN: formato-resposta',
    content:
      'Em demandas claras de gestao ou execucao, formato util: diagnostico breve -> recomendacao -> proximo passo. Para conversas abertas, testes ou pedidos vagos, responda de forma natural e direta antes de estruturar; evite soar como formulario obrigatorio.',
  },
  {
    title: 'PERFIL_RONAN: estilo-decisao',
    content:
      'Quando houver decisao, apresentar duas opcoes com trade-off curto e indicar a recomendada. Quando faltar contexto, fazer apenas uma pergunta objetiva.',
  },
];

export async function ensureRonanFounderProfile(userId: string): Promise<void> {
  await Promise.all(
    RONAN_PROFILE_SEED.map(async (seed) => {
      const existing = await prisma.memory.findFirst({
        where: { userId, title: seed.title },
        select: { id: true, content: true },
      });
      if (!existing) {
        await prisma.memory.create({
          data: {
            userId,
            context: ContextType.GERAL,
            type: MemoryType.PERMANENTE,
            title: seed.title,
            content: seed.content,
          },
        });
        return;
      }
      if (existing.content !== seed.content) {
        await prisma.memory.update({
          where: { id: existing.id },
          data: { content: seed.content },
        });
      }
    }),
  );
}

