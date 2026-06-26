import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyIntent, intentRequiresBling } from '../src/domains/chat/intentRouter.service';

describe('intentRouter — classificação por regras', () => {
  it('código de barras isolado → CONSULTA_CODIGO_BARRAS (sem exigir PERA ou keyword)', () => {
    assert.equal(classifyIntent('7891234567890'), 'CONSULTA_CODIGO_BARRAS');
    assert.equal(intentRequiresBling(classifyIntent('7891234567890')), true);
  });

  it('código com palavra estoque → CONSULTA_ESTOQUE', () => {
    assert.equal(classifyIntent('qual o estoque 7891234567890'), 'CONSULTA_ESTOQUE');
  });

  it('código com palavra preço → CONSULTA_PRECO', () => {
    assert.equal(classifyIntent('preço 7891234567890'), 'CONSULTA_PRECO');
  });

  it('busca por nome → CONSULTA_PRODUTO', () => {
    assert.equal(classifyIntent('porta documento cartão'), 'CONSULTA_PRODUTO');
  });

  it('SKU → CONSULTA_PRODUTO', () => {
    assert.equal(classifyIntent('PORTA-CARTAO'), 'CONSULTA_PRODUTO');
  });

  it('saudação → SAUDACAO sem Bling', () => {
    assert.equal(classifyIntent('oi'), 'SAUDACAO');
    assert.equal(intentRequiresBling(classifyIntent('oi')), false);
  });

  it('despedida → DESPEDIDA', () => {
    assert.equal(classifyIntent('obrigado'), 'DESPEDIDA');
  });

  it('conversa geral → CONVERSA_GERAL', () => {
    assert.equal(classifyIntent('como funciona?'), 'CONVERSA_GERAL');
  });

  it('abaixo do mínimo com código → LISTA_ABAIXO_MINIMO', () => {
    assert.equal(classifyIntent('abaixo do mínimo 7891234567890'), 'LISTA_ABAIXO_MINIMO');
  });

  it('escolha numérica com pending → ESCOLHA_PRODUTO', () => {
    assert.equal(classifyIntent('2', { hasPendingProductChoice: true }), 'ESCOLHA_PRODUTO');
  });

  it('pergunta genérica de estoque sem produto → OUTROS', () => {
    assert.equal(classifyIntent('qual estoque do produto?'), 'OUTROS');
  });
});
