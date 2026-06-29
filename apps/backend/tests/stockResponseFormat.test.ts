import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatStockBulkResponse,
  formatStockDetailedResponse,
  formatStockProductBlock,
  STOCK_BLOCK_SEPARATOR,
  STOCK_QUERY_COMPLETE_MESSAGE,
} from '../src/domains/chat/stockResponseFormat';
import type { BlingStockProductBlock } from '../src/domains/integrations/blingStructured.types';
import { formatBlingStructuredResponse } from '../src/domains/chat/responseFormatter.service';

function product(overrides: Partial<BlingStockProductBlock> = {}): BlingStockProductBlock {
  return {
    codigoBarras: '78908901',
    produto: 'REFRIGERANTE COCA COLA PET 200ML - ORIGINAL',
    estoques: [
      {
        loja: 'PB1',
        quantidade: 13,
        minimo: 0,
        situacao: 'OK',
        preco: 2.5,
        codigoInterno: 'SKU-1',
      },
      {
        loja: 'PB2',
        quantidade: -1,
        minimo: 0,
        situacao: 'OK',
        preco: 2.5,
        codigoInterno: 'SKU-1',
      },
      {
        loja: 'PB3',
        quantidade: null,
        minimo: null,
        situacao: 'NAO_ENCONTRADO',
        preco: null,
        codigoInterno: null,
      },
      {
        loja: 'PB4',
        quantidade: 5,
        minimo: 2,
        situacao: 'OK',
        preco: 2.5,
        codigoInterno: 'SKU-1',
      },
    ],
    ...overrides,
  };
}

describe('formatStockProductBlock — padrão WhatsApp', () => {
  it('1 produto com todas as lojas no formato obrigatório', () => {
    const text = formatStockProductBlock(product());

    assert.match(text, /^Código: 78908901/);
    assert.match(text, /Produto:\nREFRIGERANTE COCA COLA PET 200ML - ORIGINAL/);
    assert.match(text, new RegExp(`${STOCK_BLOCK_SEPARATOR}\\n🏪 PB1`));
    assert.match(text, new RegExp(`${STOCK_BLOCK_SEPARATOR}\\n🏪 PB2`));
    assert.match(text, /Preço: R\$ 2,50/);
    assert.match(text, /Estoque: 13/);
    assert.match(text, /Estoque mínimo: 0/);
    assert.match(text, /🏪 PB2[\s\S]*Estoque: -1[\s\S]*⚠ Estoque negativo/);
    assert.match(text, /🏪 PB3[\s\S]*❌ Produto não encontrado nesta loja\./);
    assert.match(text, /🏪 PB4[\s\S]*Estoque: 5[\s\S]*Estoque mínimo: 2/);
    assert.doesNotMatch(text, /^• /m);
  });

  it('loja offline usa mensagem de erro', () => {
    const text = formatStockProductBlock(
      product({
        estoques: [
          {
            loja: 'PB2',
            quantidade: null,
            minimo: null,
            situacao: 'ERRO_CONSULTA',
            preco: null,
            codigoInterno: null,
          },
        ],
      }),
    );

    assert.match(text, /🏪 PB2[\s\S]*⚠ Não foi possível consultar esta loja\./);
    assert.doesNotMatch(text, /Produto não encontrado nesta loja/);
  });

  it('abaixo do mínimo exibe alerta', () => {
    const text = formatStockProductBlock(
      product({
        estoques: [
          {
            loja: 'PB1',
            quantidade: 1,
            minimo: 5,
            situacao: 'ABAIXO_DO_MINIMO',
            preco: 2.5,
            codigoInterno: 'SKU-1',
          },
        ],
      }),
    );

    assert.match(text, /⚠ Abaixo do estoque mínimo/);
  });
});

describe('formatStockDetailedResponse — vários produtos', () => {
  it('gera bloco independente por código', () => {
    const text = formatStockDetailedResponse([
      product({ codigoBarras: '11111111', produto: 'Produto A', estoques: product().estoques }),
      product({ codigoBarras: '22222222', produto: 'Produto B', estoques: product().estoques }),
    ]);

    assert.equal((text.match(/^Código:/gm) ?? []).length, 2);
    assert.match(text, /Código: 11111111/);
    assert.match(text, /Código: 22222222/);
    assert.match(text, new RegExp(`${STOCK_QUERY_COMPLETE_MESSAGE.replace(/\n/g, '\\n')}$`));
  });
});

describe('formatStockBulkResponse — modo resumido', () => {
  it('responde apenas com conclusão e link para anexo', () => {
    const text = formatStockBulkResponse({
      stats: {
        produtosConsultados: 12,
        produtosEncontrados: 9,
        produtosNaoEncontrados: 3,
      },
      lojas: ['PB1', 'PB2', 'PB3', 'PB4'],
      downloadUrl: 'https://example.com/planilha.xlsx',
    });

    assert.equal(text, `${STOCK_QUERY_COMPLETE_MESSAGE}

📄 A planilha completa foi gerada.

⬇️ Download:
https://example.com/planilha.xlsx`);
    assert.doesNotMatch(text, /Produtos consultados:/);
    assert.doesNotMatch(text, /🏪 PB1/);
  });
});

describe('formatBlingStructuredResponse — integração', () => {
  it('usa o novo padrão determinístico sem bullets', async () => {
    const text = await formatBlingStructuredResponse(
      {
        kind: 'stock',
        intent: 'CONSULTA_CODIGO_BARRAS',
        produtos: [product()],
      },
      '78908901',
    );

    assert.match(text, /🏪 PB1/);
    assert.doesNotMatch(text, /^• /m);
  });
});
