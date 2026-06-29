import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLING_API_UNAVAILABLE_MESSAGE,
  BLING_AUTH_ERROR_MESSAGE,
  EMPTY_PRODUCT_MESSAGE,
  formatBlingStructuredResponse,
  formatConversationalResponse,
  llamaPreservesBlingFacts,
  NO_BARCODE_IDENTIFIED_MESSAGE,
  ROBO_COP_GREETING_MESSAGE,
} from '../src/domains/chat/responseFormatter.service';
import { STOCK_QUERY_COMPLETE_MESSAGE } from '../src/domains/chat/stockResponseFormat';

const sampleProduct = {
  codigoBarras: '7891234567890',
  produto: 'Refrigerante 2L',
  estoques: [
    {
      loja: 'PB1',
      quantidade: 12,
      minimo: 5,
      situacao: 'OK',
      preco: 8.99,
      codigoInterno: 'SKU-1',
    },
    {
      loja: 'PB2',
      quantidade: null,
      minimo: null,
      situacao: 'NAO_ENCONTRADO',
      preco: null,
      codigoInterno: null,
    },
    {
      loja: 'PB3',
      quantidade: 3,
      minimo: 2,
      situacao: 'OK',
      preco: 7.5,
      codigoInterno: 'SKU-1',
    },
    {
      loja: 'PB4',
      quantidade: null,
      minimo: null,
      situacao: 'NAO_ENCONTRADO',
      preco: null,
      codigoInterno: null,
    },
  ],
};

describe('responseFormatter — dados ERP', () => {
  it('resultado vazio sem código identificado usa mensagem operacional', async () => {
    const text = await formatBlingStructuredResponse(
      { kind: 'empty', intent: 'CONSULTA_CODIGO_BARRAS', query: '999' },
      '999',
    );
    assert.equal(text, NO_BARCODE_IDENTIFIED_MESSAGE);
  });

  it('resultado vazio por busca de nome usa mensagem de produto não encontrado', async () => {
    const text = await formatBlingStructuredResponse(
      { kind: 'empty', intent: 'CONSULTA_PRODUTO', query: 'porta documento' },
      'porta documento',
    );
    assert.equal(text, EMPTY_PRODUCT_MESSAGE);
  });

  it('erro de API usa mensagem de indisponibilidade', async () => {
    const text = await formatBlingStructuredResponse(
      { kind: 'api_error', intent: 'CONSULTA_CODIGO_BARRAS', errorKind: 'timeout', query: '123' },
      '123',
    );
    assert.equal(text, BLING_API_UNAVAILABLE_MESSAGE);
  });

  it('erro de autenticação usa mensagem específica', async () => {
    const text = await formatBlingStructuredResponse(
      { kind: 'api_error', intent: 'CONSULTA_CODIGO_BARRAS', errorKind: 'auth', query: '123' },
      '123',
    );
    assert.equal(text, BLING_AUTH_ERROR_MESSAGE);
  });

  it('estoque determinístico funciona sem IA', async () => {
    const text = await formatBlingStructuredResponse(
      {
        kind: 'stock',
        intent: 'CONSULTA_CODIGO_BARRAS',
        produtos: [sampleProduct],
      },
      '7891234567890',
    );
    assert.match(text, /Código: 7891234567890/);
    assert.match(text, /Refrigerante 2L/);
    assert.match(text, /🏪 PB1/);
    assert.match(text, /Estoque: 12/);
    assert.match(text, /Preço: R\$ 8,99/);
  });

  it('consolida todas as lojas em uma única resposta', async () => {
    const text = await formatBlingStructuredResponse(
      {
        kind: 'stock',
        intent: 'CONSULTA_CODIGO_BARRAS',
        produtos: [sampleProduct],
      },
      '7891234567890',
    );
    assert.match(text, /🏪 PB1/);
    assert.match(text, /🏪 PB2[\s\S]*❌ Produto não encontrado nesta loja/);
    assert.match(text, /🏪 PB3/);
    assert.match(text, /🏪 PB4[\s\S]*Produto não encontrado nesta loja/);
    const storeMatches = text.match(/^🏪 PB\d$/gm);
    assert.equal(storeMatches?.length, 4);
  });

  it('validação rejeita resposta do Llama com dados alterados', () => {
    const facts = ['Produto Real', 'Loja Centro', '12', '8.99'];
    assert.equal(
      llamaPreservesBlingFacts('[FORÇADO] Produto FALSO XYZ — estoque 9999 un — R$ 0,01', facts),
      false,
    );
    assert.equal(
      llamaPreservesBlingFacts('Produto Real na Loja Centro: 12 un. — R$ 8,99', facts),
      true,
    );
  });

  it('múltiplos produtos lista opções do Bling sem LLM', async () => {
    const text = await formatBlingStructuredResponse(
      {
        kind: 'multiple_products',
        intent: 'CONSULTA_PRODUTO',
        produtos: [
          { nome: 'Coca Cola 2L', sku: null, gtin: '111' },
          { nome: 'Coca Cola Zero 2L', sku: null, gtin: '222' },
        ],
      },
      'coca cola',
    );
    assert.match(text, /Encontrei mais de um produto/);
    assert.match(text, /1 - Coca Cola 2L/);
    assert.match(text, /2 - Coca Cola Zero 2L/);
    assert.match(text, /número da opção/);
  });
});

describe('formatConversationalResponse — Robô-COP V1', () => {
  it('saudação retorna mensagem fixa do Robô-COP', () => {
    assert.equal(
      formatConversationalResponse({ intent: 'SAUDACAO', content: 'oi' }),
      ROBO_COP_GREETING_MESSAGE,
    );
  });

  it('despedida retorna mensagem de consulta concluída', () => {
    assert.equal(
      formatConversationalResponse({ intent: 'DESPEDIDA', content: 'obrigado' }),
      STOCK_QUERY_COMPLETE_MESSAGE,
    );
  });

  it('outros retorna orientação para enviar códigos', () => {
    assert.equal(
      formatConversationalResponse({ intent: 'OUTROS', content: 'ajuda' }),
      NO_BARCODE_IDENTIFIED_MESSAGE,
    );
  });
});
