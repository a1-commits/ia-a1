import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectStockResultsForBarcodes } from '../src/domains/integrations/bling.service';
import {
  assertBarcodeResultsOrder,
  extractBarcodesFromText,
  type BlingStockStoreResult,
} from '../src/domains/integrations/bling.types';

const CODE_A = '7898956381167';
const CODE_B = '7898215151784';

function mockStoreResult(barcode: string, found: boolean): BlingStockStoreResult {
  return {
    connectionId: 'c1',
    storeLabel: 'Loja 1',
    found,
    productName: found ? 'Produto teste' : null,
    internalCode: found ? 'INT1' : null,
    barcode,
    salePrice: null,
    currentStock: found ? 10 : null,
    minimumStock: found ? 5 : null,
    situation: found ? 'OK' : 'NAO_ENCONTRADO',
    error: null,
  };
}

describe('collectStockResultsForBarcodes', () => {
  it('consulta individual A -> found', async () => {
    const { results } = await collectStockResultsForBarcodes({
      barcodes: [CODE_A],
      connections: [{ id: 'c1' }],
      searchStock: async (_connectionId, barcode) => mockStoreResult(barcode, true),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]!.barcode, CODE_A);
    assert.equal(results[0]!.stores[0]!.found, true);
  });

  it('consulta individual B -> found', async () => {
    const { results } = await collectStockResultsForBarcodes({
      barcodes: [CODE_B],
      connections: [{ id: 'c1' }],
      searchStock: async (_connectionId, barcode) => mockStoreResult(barcode, true),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]!.barcode, CODE_B);
    assert.equal(results[0]!.stores[0]!.found, true);
  });

  it('consulta conjunta A+B -> ambos found com ordem preservada', async () => {
    const calls: string[] = [];
    const barcodes = extractBarcodesFromText(`${CODE_A}\n${CODE_B}`);

    const { uniqueBarcodes, results } = await collectStockResultsForBarcodes({
      barcodes,
      connections: [{ id: 'c1' }],
      searchStock: async (_connectionId, barcode) => {
        calls.push(barcode);
        return mockStoreResult(barcode, true);
      },
    });

    assert.deepEqual(uniqueBarcodes, [CODE_A, CODE_B]);
    assert.equal(results.length, 2);
    assert.equal(results[0]!.barcode, CODE_A);
    assert.equal(results[0]!.stores[0]!.found, true);
    assert.equal(results[1]!.barcode, CODE_B);
    assert.equal(results[1]!.stores[0]!.found, true);
    assert.deepEqual(calls, [CODE_A, CODE_B]);
  });

  it('results[i] corresponde ao barcode[i]', async () => {
    const { uniqueBarcodes, results } = await collectStockResultsForBarcodes({
      barcodes: [CODE_A, CODE_B],
      connections: [{ id: 'c1' }, { id: 'c2' }],
      searchStock: async (_connectionId, barcode) => mockStoreResult(barcode, true),
    });

    assertBarcodeResultsOrder({ requestedBarcodes: uniqueBarcodes, results });
    for (let i = 0; i < uniqueBarcodes.length; i++) {
      assert.equal(results[i]!.barcode, uniqueBarcodes[i]);
      for (const store of results[i]!.stores) {
        assert.equal(store.barcode, uniqueBarcodes[i]);
      }
    }
  });

  it('processa códigos em série (sem paralelismo entre barcodes)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await collectStockResultsForBarcodes({
      barcodes: [CODE_A, CODE_B],
      connections: [{ id: 'c1' }],
      searchStock: async (_connectionId, barcode) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return mockStoreResult(barcode, true);
      },
    });

    assert.equal(maxInFlight, 1);
  });

  it('consulta lojas em paralelo para o mesmo código', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await collectStockResultsForBarcodes({
      barcodes: [CODE_A],
      connections: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }],
      searchStock: async (connectionId, barcode) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return {
          ...mockStoreResult(barcode, connectionId === 'c1'),
          connectionId,
          storeLabel: connectionId.toUpperCase(),
        };
      },
    });

    assert.equal(maxInFlight, 4);
  });
});

describe('assertBarcodeResultsOrder', () => {
  it('lança quando ordem diverge', () => {
    assert.throws(
      () =>
        assertBarcodeResultsOrder({
          requestedBarcodes: [CODE_A, CODE_B],
          results: [
            { barcode: CODE_B },
            { barcode: CODE_A },
          ],
        }),
      /Barcode mismatch at index 0/,
    );
  });
});

describe('extractBarcodesFromText — caso reprodução A+B', () => {
  it('extrai A e B em consulta conjunta', () => {
    assert.deepEqual(extractBarcodesFromText(`${CODE_A}\n${CODE_B}`), [CODE_A, CODE_B]);
    assert.deepEqual(extractBarcodesFromText(`${CODE_A} ${CODE_B}`), [CODE_A, CODE_B]);
  });
});
