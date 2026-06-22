import { analyzeLeadConversation } from './lead-decision-engine';

export const leadDecisionExamples = [
  analyzeLeadConversation([{ role: 'user', content: 'Quanto fica um guarda-roupa?' }]),
  analyzeLeadConversation([
    {
      role: 'user',
      content: 'Quero uma cozinha planejada de 3 metros, branca com madeira. Estou reformando e queria ver orçamento.',
    },
  ]),
  analyzeLeadConversation([
    {
      role: 'user',
      content: 'Estou fazendo a casa toda, preciso de cozinha, suíte, banheiro e lavanderia. Tenho as plantas.',
    },
  ]),
  analyzeLeadConversation([
    { role: 'user', content: 'Quero uma cozinha planejada de 3 metros, branca com madeira.' },
    { role: 'assistant', content: 'Posso montar uma ideia visual inicial pra você enxergar o estilo?' },
    { role: 'user', content: 'Sim, pode montar a imagem visual.' },
  ]),
];
