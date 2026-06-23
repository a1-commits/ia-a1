import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectGtinFields,
  findExactGtinProduct,
  productMatchesGtin,
  productMatchesSku,
} from '../src/domains/integrations/blingProductSearch';

const wrongProduct = {
  id: 123,
  nome: 'CHIPS FANDANGOS PRESUNTO 85G',
  codigo: 'FAND85',
  gtin: '7892840825065',
};

describe('productMatchesGtin', () => {
  it('4152465545 não corresponde a produto com gtin 7892840825065', () => {
    assert.equal(productMatchesGtin(wrongProduct, '4152465545'), false);
  });

  it('aceita match exato em gtin', () => {
    assert.equal(productMatchesGtin(wrongProduct, '7892840825065'), true);
  });

  it('aceita match exato em codigoBarras', () => {
    assert.equal(
      productMatchesGtin({ id: 1, codigoBarras: '4152465545' }, '4152465545'),
      true,
    );
  });

  it('aceita match exato em ean e barcode', () => {
    assert.equal(productMatchesGtin({ id: 1, ean: '4152465545' }, '4152465545'), true);
    assert.equal(productMatchesGtin({ id: 1, barcode: '4152465545' }, '4152465545'), true);
  });

  it('não usa codigo SKU como GTIN', () => {
    assert.equal(productMatchesGtin({ id: 1, codigo: '4152465545' }, '4152465545'), false);
    assert.equal(productMatchesSku({ id: 1, codigo: '4152465545' }, '4152465545'), true);
  });
});

describe('findExactGtinProduct', () => {
  it('retorna null quando lista tem produto com gtin diferente', () => {
    const match = findExactGtinProduct([wrongProduct], '4152465545');
    assert.equal(match, null);
  });

  it('retorna produto quando gtin bate exatamente', () => {
    const expected = { id: 2, nome: 'Produto certo', gtin: '4152465545' };
    const match = findExactGtinProduct([wrongProduct, expected], '4152465545');
    assert.deepEqual(match, expected);
  });

  it('não retorna o primeiro item sem validação', () => {
    const first = { id: 9, gtin: '1111111111111' };
    const second = { id: 10, gtin: '2222222222222' };
    assert.equal(findExactGtinProduct([first, second], '4152465545'), null);
  });
});

describe('collectGtinFields', () => {
  it('coleta campos aninhados de codigoBarras', () => {
    assert.deepEqual(
      collectGtinFields({ codigoBarras: { principal: '4152465545' } }),
      ['4152465545'],
    );
  });
});
