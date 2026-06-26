import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BLING_API_UNAVAILABLE_MESSAGE,
  BLING_AUTH_ERROR_MESSAGE,
  EMPTY_PRODUCT_MESSAGE,
  formatBlingStructuredResponse,
  llamaPreservesBlingFacts,
} from '../src/domains/chat/responseFormatter.service';

describe('responseFormatter — dados ERP', () => {
  it('resultado vazio usa mensagem fixa sem inventar', async () => {
    const text = await formatBlingStructuredResponse(
      { kind: 'empty', intent: 'CONSULTA_CODIGO_BARRAS', query: '999' },
      '999',
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
        produto: 'Refrigerante 2L',
        codigoBarras: '7891234567890',
        estoques: [
          {
            loja: 'Loja Centro',
            quantidade: 12,
            minimo: 5,
            situacao: 'OK',
            preco: 8.99,
            codigoInterno: 'SKU-1',
          },
        ],
      },
      '7891234567890',
    );
    assert.match(text, /Refrigerante 2L/);
    assert.match(text, /7891234567890/);
    assert.match(text, /Loja Centro/);
    assert.match(text, /Estoque: 12/);
    assert.match(text, /Preço: R\$ 8\.99/);
  });

  it('consolida todas as lojas em uma única resposta', async () => {
    const text = await formatBlingStructuredResponse(
      {
        kind: 'stock',
        intent: 'CONSULTA_CODIGO_BARRAS',
        produto: 'Refrigerante 2L',
        codigoBarras: '7891234567890',
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
      },
      '7891234567890',
    );
    assert.match(text, /Produto: Refrigerante 2L/);
    assert.match(text, /PB1/);
    assert.match(text, /PB2[\s\S]*Produto não encontrado nesta loja/);
    assert.match(text, /PB3/);
    assert.match(text, /PB4[\s\S]*Produto não encontrado nesta loja/);
    const pbMatches = text.match(/^PB\d$/gm);
    assert.equal(pbMatches?.length, 4);
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
