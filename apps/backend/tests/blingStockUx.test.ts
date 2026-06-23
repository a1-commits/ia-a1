import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BlingConnectionStatus } from '@prisma/client';
import { formatPeraStockResponse } from '../src/domains/integrations/blingStockUx';
import type { BlingMultiStoreStockResponse, BlingStockStoreResult } from '../src/domains/integrations/bling.types';

function store(
  label: string,
  overrides: Partial<BlingStockStoreResult> & Pick<BlingStockStoreResult, 'found' | 'situation'>,
): BlingStockStoreResult {
  return {
    connectionId: label,
    storeLabel: label,
    productName: null,
    internalCode: null,
    barcode: '7891234567890',
    currentStock: null,
    minimumStock: null,
    error: null,
    ...overrides,
  };
}

function mockData(
  results: BlingMultiStoreStockResponse['results'],
): BlingMultiStoreStockResponse {
  const storeLabels = Array.from(new Set(results.flatMap((r) => r.stores.map((s) => s.storeLabel)))).sort();
  return {
    agentId: 'agent-1',
    barcodes: results.map((r) => r.barcode),
    stores: storeLabels.map((storeLabel) => ({
      connectionId: storeLabel,
      storeLabel,
      status: BlingConnectionStatus.CONNECTED,
    })),
    results,
  };
}

describe('formatPeraStockResponse UX', () => {
  it('CASO 1: produto encontrado em lojas com total amigável', () => {
    const text = formatPeraStockResponse(
      mockData([
        {
          barcode: '7891234567890',
          totalCurrentStock: 33,
          stores: [
            store('PB2', {
              found: true,
              situation: 'ABAIXO_DO_MINIMO',
              productName: 'FANDANGOS PRESUNTO 85G',
              currentStock: 8,
              minimumStock: 10,
            }),
            store('PB1', {
              found: true,
              situation: 'OK',
              productName: 'FANDANGOS PRESUNTO 85G',
              currentStock: 25,
              minimumStock: 10,
            }),
            store('PB3', { found: false, situation: 'NAO_ENCONTRADO' }),
            store('PB4', { found: false, situation: 'NAO_ENCONTRADO' }),
          ],
        },
      ]),
    );

    assert.match(text, /^Código: 7891234567890/);
    assert.match(text, /PB1\nProduto: FANDANGOS PRESUNTO 85G\nEstoque: 25\nEstoque mínimo: 10/);
    assert.match(text, /PB2\nProduto: FANDANGOS PRESUNTO 85G\nEstoque: 8\nEstoque mínimo: 10/);
    assert.match(text, /PB3\nProduto não encontrado/);
    assert.match(text, /PB4\nProduto não encontrado/);
    assert.match(text, /Total disponível: 33 unidades/);
    assert.doesNotMatch(text, /\| --- \|/);
    assert.doesNotMatch(text, /Consulta de estoque Bling/);
  });

  it('CASO 2: produto não encontrado em nenhuma loja', () => {
    const text = formatPeraStockResponse(
      mockData([
        {
          barcode: '4152465547',
          totalCurrentStock: 0,
          stores: [
            store('PB3', { found: false, situation: 'NAO_ENCONTRADO' }),
            store('PB1', { found: false, situation: 'NAO_ENCONTRADO' }),
            store('PB4', { found: false, situation: 'NAO_ENCONTRADO' }),
            store('PB2', { found: false, situation: 'NAO_ENCONTRADO' }),
          ],
        },
      ]),
    );

    assert.match(text, /Código: 4152465547/);
    assert.match(text, /❌ Produto não encontrado em nenhuma loja conectada\./);
    assert.match(text, /• PB1/);
    assert.match(text, /• PB4/);
    assert.doesNotMatch(text, /Total disponível/);
    assert.doesNotMatch(text, /\|/);
    assert.doesNotMatch(text, /---/);
  });

  it('CASO 3: consulta múltipla separada por código', () => {
    const text = formatPeraStockResponse(
      mockData([
        {
          barcode: '7891234567890',
          totalCurrentStock: 5,
          stores: [
            store('PB1', {
              found: true,
              situation: 'OK',
              productName: 'Produto A',
              currentStock: 5,
              minimumStock: 2,
            }),
          ],
        },
        {
          barcode: '7899876543210',
          totalCurrentStock: 0,
          stores: [store('PB1', { found: false, situation: 'NAO_ENCONTRADO' })],
        },
      ]),
    );

    assert.match(text, /=== Código 7891234567890 ===/);
    assert.match(text, /=== Código 7899876543210 ===/);
    assert.match(text, /Produto: Produto A/);
    assert.match(text, /❌ Produto não encontrado em nenhuma loja conectada\./);
  });

  it('ordena lojas pelo nome', () => {
    const text = formatPeraStockResponse(
      mockData([
        {
          barcode: '7891234567890',
          totalCurrentStock: 1,
          stores: [
            store('PB3', { found: false, situation: 'NAO_ENCONTRADO' }),
            store('PB1', {
              found: true,
              situation: 'OK',
              productName: 'X',
              currentStock: 1,
              minimumStock: 0,
            }),
            store('PB2', { found: false, situation: 'NAO_ENCONTRADO' }),
          ],
        },
      ]),
    );

    assert.ok(text.indexOf('PB1') < text.indexOf('PB2'));
    assert.ok(text.indexOf('PB2') < text.indexOf('PB3'));
  });

  it('exibe estoque como inteiro', () => {
    const text = formatPeraStockResponse(
      mockData([
        {
          barcode: '7891234567890',
          totalCurrentStock: 10,
          stores: [
            store('PB1', {
              found: true,
              situation: 'OK',
              productName: 'Item',
              currentStock: 10.9,
              minimumStock: 3.2,
            }),
          ],
        },
      ]),
    );

    assert.match(text, /Estoque: 10/);
    assert.match(text, /Estoque mínimo: 3/);
  });
});
