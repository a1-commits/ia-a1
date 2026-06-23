import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BlingConnectionStatus } from '@prisma/client';
import {
  computeStockSituation,
  extractBarcodesFromText,
  formatStockResponse,
  type BlingMultiStoreStockResponse,
} from '../src/domains/integrations/bling.types';

function mockResponse(
  overrides: Partial<BlingMultiStoreStockResponse> & Pick<BlingMultiStoreStockResponse, 'results'>,
): BlingMultiStoreStockResponse {
  return {
    agentId: 'agent-1',
    barcodes: overrides.results.map((r) => r.barcode),
    stores: overrides.stores ?? [
      { connectionId: 'c1', storeLabel: 'Loja 1', status: BlingConnectionStatus.CONNECTED },
      { connectionId: 'c2', storeLabel: 'Loja 2', status: BlingConnectionStatus.CONNECTED },
      { connectionId: 'c3', storeLabel: 'Loja 3', status: BlingConnectionStatus.CONNECTED },
      { connectionId: 'c4', storeLabel: 'Loja 4', status: BlingConnectionStatus.CONNECTED },
    ],
    results: overrides.results,
  };
}

describe('computeStockSituation', () => {
  it('OK quando estoque >= mínimo', () => {
    assert.equal(computeStockSituation(true, 18, 10, false), 'OK');
  });

  it('ABAIXO_DO_MINIMO quando estoque > 0 e < mínimo', () => {
    assert.equal(computeStockSituation(true, 4, 10, false), 'ABAIXO_DO_MINIMO');
  });

  it('SEM_ESTOQUE quando estoque <= 0', () => {
    assert.equal(computeStockSituation(true, 0, 10, false), 'SEM_ESTOQUE');
  });

  it('NAO_ENCONTRADO quando produto não existe', () => {
    assert.equal(computeStockSituation(false, null, null, false), 'NAO_ENCONTRADO');
  });

  it('ERRO_CONSULTA quando houve falha', () => {
    assert.equal(computeStockSituation(false, null, null, true), 'ERRO_CONSULTA');
  });
});

describe('extractBarcodesFromText', () => {
  it('extrai um código de barras', () => {
    assert.deepEqual(extractBarcodesFromText('Consulte 7891234567890'), ['7891234567890']);
  });

  it('extrai múltiplos códigos únicos', () => {
    const text = '7891234567890 e 7899876543210';
    assert.deepEqual(extractBarcodesFromText(text), ['7891234567890', '7899876543210']);
  });
});

describe('formatStockResponse', () => {
  it('informa quando não há lojas conectadas', () => {
    const text = formatStockResponse({
      agentId: 'a1',
      barcodes: ['7891234567890'],
      stores: [],
      results: [],
    });
    assert.match(text, /Não há contas Bling conectadas/);
  });

  it('formata 1 código em 4 lojas com totais', () => {
    const data = mockResponse({
      results: [
        {
          barcode: '7891234567890',
          totalCurrentStock: 22,
          stores: [
            {
              connectionId: 'c1',
              storeLabel: 'Loja 1',
              found: true,
              productName: 'Produto Exemplo',
              internalCode: 'PROD001',
              barcode: '7891234567890',
              currentStock: 18,
              minimumStock: 10,
              situation: 'OK',
              error: null,
            },
            {
              connectionId: 'c2',
              storeLabel: 'Loja 2',
              found: true,
              productName: 'Produto Exemplo',
              internalCode: 'PROD001',
              barcode: '7891234567890',
              currentStock: 4,
              minimumStock: 10,
              situation: 'ABAIXO_DO_MINIMO',
              error: null,
            },
            {
              connectionId: 'c3',
              storeLabel: 'Loja 3',
              found: false,
              productName: null,
              internalCode: null,
              barcode: '7891234567890',
              currentStock: null,
              minimumStock: null,
              situation: 'NAO_ENCONTRADO',
              error: null,
            },
            {
              connectionId: 'c4',
              storeLabel: 'Loja 4',
              found: false,
              productName: null,
              internalCode: null,
              barcode: '7891234567890',
              currentStock: null,
              minimumStock: null,
              situation: 'ERRO_CONSULTA',
              error: 'Timeout',
            },
          ],
        },
      ],
    });
    const text = formatStockResponse(data);
    assert.match(text, /Loja 1/);
    assert.match(text, /Loja 2/);
    assert.match(text, /ABAIXO DO MÍNIMO/);
    assert.match(text, /NÃO ENCONTRADO/);
    assert.match(text, /ERRO NA CONSULTA/);
    assert.match(text, /Total estoque \(lojas com produto\): 22/);
  });

  it('organiza múltiplos códigos separadamente', () => {
    const data = mockResponse({
      results: [
        {
          barcode: '7891234567890',
          totalCurrentStock: 5,
          stores: [
            {
              connectionId: 'c1',
              storeLabel: 'Loja 1',
              found: true,
              productName: 'A',
              internalCode: 'A1',
              barcode: '7891234567890',
              currentStock: 5,
              minimumStock: 2,
              situation: 'OK',
              error: null,
            },
          ],
        },
        {
          barcode: '7899876543210',
          totalCurrentStock: 0,
          stores: [
            {
              connectionId: 'c1',
              storeLabel: 'Loja 1',
              found: true,
              productName: 'B',
              internalCode: 'B1',
              barcode: '7899876543210',
              currentStock: 0,
              minimumStock: 5,
              situation: 'SEM_ESTOQUE',
              error: null,
            },
          ],
        },
      ],
    });
    const text = formatStockResponse(data);
    assert.match(text, /7891234567890/);
    assert.match(text, /7899876543210/);
    assert.match(text, /SEM ESTOQUE/);
  });
});
