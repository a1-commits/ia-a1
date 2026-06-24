import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGtinSearchPaths,
  collectGtinFields,
  collectSkuField,
  findExactGtinProduct,
  findExactSkuProduct,
  formatProductDisambiguationResponse,
  formatProductOptionLine,
  isNumericGtinInput,
  parseBlingStockRequest,
  productMatchesGtin,
  productMatchesSku,
  shouldAutoSelectNameMatch,
  summarizeBlingProductCandidate,
} from '../src/domains/integrations/blingProductSearch';

const GTIN_SAMPLE = '0751320654120';
const SKU_SAMPLE = 'PORTA-CARTAO';

const portaCartaoProduct = {
  id: 10,
  nome: 'PORTA DOCUMENTO CARTAO DE CREDITO',
  codigo: SKU_SAMPLE,
  gtin: GTIN_SAMPLE,
};

const wrongSkuStorageProduct = {
  id: 11,
  nome: 'Produto cadastrado errado',
  codigo: GTIN_SAMPLE,
  gtin: undefined,
};

describe('productMatchesGtin — campo real Bling: gtin/gtinEmbalagem/codigoBarras/ean', () => {
  it('0751320654120 encontrado pelo campo gtin sem depender do SKU', () => {
    assert.equal(productMatchesGtin(portaCartaoProduct, GTIN_SAMPLE), true);
    assert.equal(collectSkuField(portaCartaoProduct), SKU_SAMPLE);
  });

  it('não confunde SKU com GTIN na validação de código de barras', () => {
    assert.equal(productMatchesGtin(wrongSkuStorageProduct, GTIN_SAMPLE), false);
    assert.equal(productMatchesSku(wrongSkuStorageProduct, GTIN_SAMPLE), true);
  });

  it('coleta gtinEmbalagem e codigoBarras aninhado', () => {
    assert.deepEqual(
      collectGtinFields({
        gtinEmbalagem: '17891234567890',
        codigoBarras: { principal: GTIN_SAMPLE },
      }).sort(),
      [GTIN_SAMPLE, '17891234567890'].sort(),
    );
  });
});

describe('findExactGtinProduct / findExactSkuProduct', () => {
  it('CASO 1: GTIN 0751320654120 encontrado sem usar SKU', () => {
    const match = findExactGtinProduct([wrongSkuStorageProduct, portaCartaoProduct], GTIN_SAMPLE);
    assert.equal(match, portaCartaoProduct);
  });

  it('CASO 2: SKU PORTA-CARTAO encontrado como fallback', () => {
    const match = findExactSkuProduct([portaCartaoProduct], SKU_SAMPLE);
    assert.deepEqual(match, portaCartaoProduct);
  });
});

describe('GTIN/EAN strict — numérico nunca casa com product.codigo', () => {
  it('código numérico igual ao SKU interno não encontra produto sem GTIN cadastrado', () => {
    assert.equal(findExactGtinProduct([wrongSkuStorageProduct], GTIN_SAMPLE), null);
    assert.equal(productMatchesGtin(wrongSkuStorageProduct, GTIN_SAMPLE), false);
  });

  it('GTIN inexistente retorna null na lista', () => {
    assert.equal(findExactGtinProduct([portaCartaoProduct], '0000000000000'), null);
  });
});

describe('parseBlingStockRequest', () => {
  it('CASO 1: classifica GTIN numérico', () => {
    assert.deepEqual(parseBlingStockRequest(GTIN_SAMPLE), {
      kind: 'barcode',
      queries: [GTIN_SAMPLE],
    });
  });

  it('CASO 2: classifica SKU alfanumérico', () => {
    assert.deepEqual(parseBlingStockRequest(`estoque ${SKU_SAMPLE}`), {
      kind: 'sku',
      queries: [SKU_SAMPLE],
    });
  });

  it('CASO 3: classifica busca por nome', () => {
    assert.deepEqual(parseBlingStockRequest('porta documento cartão'), {
      kind: 'name',
      query: 'porta documento cartão',
    });
  });

  it('código numérico nunca classifica como SKU', () => {
    assert.equal(isNumericGtinInput(GTIN_SAMPLE), true);
    assert.deepEqual(parseBlingStockRequest(GTIN_SAMPLE), {
      kind: 'barcode',
      queries: [GTIN_SAMPLE],
    });
    assert.equal(parseBlingStockRequest(`estoque ${GTIN_SAMPLE}`)?.kind, 'barcode');
  });

  it('buildGtinSearchPaths usa somente parâmetros GTIN/EAN (sem ?codigo= SKU)', () => {
    const paths = buildGtinSearchPaths('0751320654120');
    assert.deepEqual(paths, [
      '/produtos?pagina=1&limite=50&gtin=0751320654120',
      '/produtos?pagina=1&limite=50&codigoBarras=0751320654120',
      '/produtos?pagina=1&limite=50&ean=0751320654120',
    ]);
    for (const path of paths) {
      assert.doesNotMatch(path, /[?&]codigo=/);
      assert.doesNotMatch(path, /[?&]nome=/);
    }
  });

  it('summarizeBlingProductCandidate expõe campos GTIN do Bling', () => {
    const summary = summarizeBlingProductCandidate({
      id: 10,
      nome: 'PORTA DOCUMENTO',
      codigo: 'PORTA-CARTAO',
      gtin: '0751320654120',
      gtinEmbalagem: '17891234567890',
      ean: '0751320654120',
      codigoBarras: { principal: '0751320654120' },
    });
    assert.equal(summary?.gtin, '0751320654120');
    assert.equal(summary?.codigo, 'PORTA-CARTAO');
    assert.ok(summary?.gtinFields.includes('0751320654120'));
  });
});

describe('busca por nome — confirmação obrigatória', () => {
  it('CASO 3: formata opções para o usuário escolher', () => {
    const text = formatProductDisambiguationResponse([
      {
        id: 1,
        nome: 'PORTA DOCUMENTO CARTAO DE CREDITO',
        sku: SKU_SAMPLE,
        gtin: GTIN_SAMPLE,
      },
      {
        id: 2,
        nome: 'Outro produto',
        sku: 'OUTRO-SKU',
        gtin: null,
      },
    ]);

    assert.match(text, /Qual desses produtos você deseja consultar/i);
    assert.ok(text.includes(formatProductOptionLine(
      { id: 1, nome: 'PORTA DOCUMENTO CARTAO DE CREDITO', sku: SKU_SAMPLE, gtin: GTIN_SAMPLE },
      1,
    )));
    assert.match(text, /GTIN\/EAN: 0751320654120/);
    assert.match(text, /sem sua confirmação/i);
  });

  it('CASO 4: nome ambíguo nunca seleciona automaticamente', () => {
    assert.equal(
      shouldAutoSelectNameMatch([
        { id: 1, nome: 'A', sku: 'A', gtin: null },
        { id: 2, nome: 'B', sku: 'B', gtin: null },
      ]),
      false,
    );
    assert.equal(
      shouldAutoSelectNameMatch([{ id: 1, nome: 'Único', sku: 'U', gtin: GTIN_SAMPLE }]),
      false,
    );
  });
});
