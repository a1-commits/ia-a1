import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Agent } from '@prisma/client';
import { shouldUseBlingStockTool } from '../src/domains/integrations/blingAgent.service';

function agent(name: string): Agent {
  return {
    id: 'agent-pera',
    userId: 'user-1',
    name,
    description: '',
    objective: '',
    instructions: '',
    rules: '',
    forbiddenRules: '',
    examples: '',
    model: 'auto',
    isActive: true,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('shouldUseBlingStockTool', () => {
  it('PERA usa ferramenta ao detectar código de barras', () => {
    assert.equal(
      shouldUseBlingStockTool(agent('PERA'), '7891234567890'),
      true,
    );
  });

  it('agente genérico exige palavra-chave de estoque', () => {
    assert.equal(shouldUseBlingStockTool(agent('Vendas'), '7891234567890'), false);
    assert.equal(
      shouldUseBlingStockTool(agent('Vendas'), 'estoque 7891234567890'),
      true,
    );
  });

  it('sem código de barras não aciona ferramenta', () => {
    assert.equal(shouldUseBlingStockTool(agent('PERA'), 'qual estoque do produto?'), false);
  });
});
