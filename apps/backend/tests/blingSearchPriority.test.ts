import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BlingConnectionStatus } from '@prisma/client';
import { hasAnyProductFoundInAggregate } from '../src/domains/integrations/blingQueryEngine.service';
import type { BlingMultiStoreStockResponse } from '../src/domains/integrations/bling.types';

function mockAggregate(
  stores: Array<{ label: string; found: boolean }>,
  barcode = '7891234567890',
): BlingMultiStoreStockResponse {
  return {
    agentId: 'agent-1',
    barcodes: [barcode],
    stores: stores.map((store, index) => ({
      connectionId: `c${index + 1}`,
      storeLabel: store.label,
      status: BlingConnectionStatus.CONNECTED,
    })),
    results: [
      {
        barcode,
        totalCurrentStock: stores.reduce((sum, store) => sum + (store.found ? 1 : 0), 0),
        stores: stores.map((store, index) => ({
          connectionId: `c${index + 1}`,
          storeLabel: store.label,
          found: store.found,
          productName: store.found ? 'Produto teste' : null,
          internalCode: store.found ? 'SKU-1' : null,
          barcode,
          salePrice: store.found ? 8.99 : null,
          currentStock: store.found ? 5 : null,
          minimumStock: store.found ? 2 : null,
          situation: store.found ? 'OK' : 'NAO_ENCONTRADO',
          error: null,
        })),
      },
    ],
  };
}

describe('hasAnyProductFoundInAggregate', () => {
  it('retorna false quando nenhuma loja encontrou o produto', () => {
    const data = mockAggregate([
      { label: 'PB1', found: false },
      { label: 'PB2', found: false },
    ]);
    assert.equal(hasAnyProductFoundInAggregate(data), false);
  });

  it('retorna true quando ao menos uma loja encontrou o produto', () => {
    const data = mockAggregate([
      { label: 'PB1', found: false },
      { label: 'PB2', found: true },
    ]);
    assert.equal(hasAnyProductFoundInAggregate(data), true);
  });
});
