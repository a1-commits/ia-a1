import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BlingConnectionStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import {
  buildPeraStockExcelRows,
  buildPeraStockExportFileName,
  formatExcelSituationLabel,
  PERA_STOCK_DETAILED_MAX_CODES,
  shouldUsePeraStockSummary,
  buildPeraStockExcelBuffer,
} from '../src/domains/integrations/blingStockExcel';
import { formatPeraStockResponse, formatPeraStockSummaryResponse } from '../src/domains/integrations/blingStockUx';
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
    salePrice: null,
    currentStock: null,
    minimumStock: null,
    error: null,
    ...overrides,
  };
}

function mockData(
  barcodes: string[],
  buildResult: (barcode: string, index: number) => BlingMultiStoreStockResponse['results'][number],
): BlingMultiStoreStockResponse {
  const results = barcodes.map((barcode, index) => buildResult(barcode, index));
  const storeLabels = Array.from(new Set(results.flatMap((r) => r.stores.map((s) => s.storeLabel)))).sort();
  return {
    agentId: 'agent-1',
    barcodes,
    stores: storeLabels.map((storeLabel) => ({
      connectionId: storeLabel,
      storeLabel,
      status: BlingConnectionStatus.CONNECTED,
    })),
    results,
  };
}

describe('PERA stock excel export threshold', () => {
  it('9 códigos não entram no modo resumido', () => {
    assert.equal(PERA_STOCK_DETAILED_MAX_CODES, 10);
    assert.equal(shouldUsePeraStockSummary(9), false);
    assert.equal(shouldUsePeraStockSummary(10), false);
  });

  it('11 códigos entram no modo resumido', () => {
    assert.equal(shouldUsePeraStockSummary(11), true);
  });
});

describe('formatPeraStockSummaryResponse', () => {
  it('formata resumo com link de download', () => {
    const data = mockData(['7891', '7892', '7893'], (barcode, index) => ({
      barcode,
      totalCurrentStock: index === 0 ? 5 : 0,
      stores: [
        store('PB1', {
          found: index === 0,
          situation: index === 0 ? 'OK' : 'NAO_ENCONTRADO',
          barcode,
          productName: index === 0 ? 'Produto A' : null,
          salePrice: index === 0 ? 5.99 : null,
          currentStock: index === 0 ? 5 : null,
          minimumStock: index === 0 ? 2 : null,
        }),
        store('PB2', {
          found: index === 2,
          situation: index === 2 ? 'OK' : 'NAO_ENCONTRADO',
          barcode,
          productName: index === 2 ? 'Produto C' : null,
          salePrice: index === 2 ? 3.49 : null,
          currentStock: index === 2 ? 1 : null,
          minimumStock: 0,
        }),
      ],
    }));

    const text = formatPeraStockSummaryResponse(data, {
      downloadUrl: '/api/exports/abc?token=xyz',
    });

    assert.match(text, /Consulta concluída\./);
    assert.match(text, /Códigos consultados: 3/);
    assert.match(text, /Produtos encontrados: 2/);
    assert.match(text, /Não encontrados: 1/);
    assert.match(text, /Resumo por loja:/);
    assert.match(text, /• PB1: 1 itens/);
    assert.match(text, /• PB2: 1 itens/);
    assert.match(text, /📊 Baixar Excel completo: \/api\/exports\/abc\?token=xyz/);
    assert.doesNotMatch(text, /Total disponível/);
  });

  it('avisa quando Excel falha', () => {
    const data = mockData(['7891'], (barcode) => ({
      barcode,
      totalCurrentStock: 0,
      stores: [store('PB1', { found: false, situation: 'NAO_ENCONTRADO', barcode })],
    }));

    const text = formatPeraStockSummaryResponse(data, { excelGenerationFailed: true });
    assert.match(text, /Não consegui gerar a planilha desta vez\./);
  });
});

describe('buildPeraStockExcelRows', () => {
  it('inclui encontrados e não encontrados em multi-loja', () => {
    const data = mockData(['7891234567890', '7899876543210'], (barcode, index) => ({
      barcode,
      totalCurrentStock: index === 0 ? 5 : 0,
      stores: [
        store('PB1', {
          found: index === 0,
          situation: index === 0 ? 'OK' : 'NAO_ENCONTRADO',
          barcode,
          productName: 'Produto A',
          salePrice: 5.99,
          currentStock: 5,
          minimumStock: 2,
        }),
        store('PB2', {
          found: false,
          situation: 'NAO_ENCONTRADO',
          barcode,
        }),
      ],
    }));

    const rows = buildPeraStockExcelRows(data);
    assert.equal(rows.length, 4);
    assert.equal(rows[0]?.situation, 'Encontrado');
    assert.equal(rows[0]?.price, 'R$ 5,99');
    assert.equal(rows[1]?.situation, 'Não encontrado pelo GTIN/EAN no Bling');
    assert.equal(rows[2]?.situation, 'Não encontrado pelo GTIN/EAN no Bling');
    assert.equal(rows[3]?.situation, 'Não encontrado pelo GTIN/EAN no Bling');
    assert.ok(rows.every((row) => !String(row.price).includes('Total disponível')));
  });

  it('marca erro na consulta', () => {
    const rows = buildPeraStockExcelRows(
      mockData(['7891'], (barcode) => ({
        barcode,
        totalCurrentStock: 0,
        stores: [
          store('PB1', {
            found: false,
            situation: 'ERRO_CONSULTA',
            barcode,
            error: 'timeout',
          }),
        ],
      })),
    );

    assert.match(rows[0]?.situation ?? '', /Erro na consulta/);
  });
});

describe('buildPeraStockExcelBuffer', () => {
  it('gera workbook xlsx com colunas esperadas', async () => {
    const data = mockData(['7891234567890'], () => ({
      barcode: '7891234567890',
      totalCurrentStock: 10,
      stores: [
        store('PB1', {
          found: true,
          situation: 'OK',
          productName: 'Item',
          salePrice: 5.99,
          currentStock: 10,
          minimumStock: 3,
        }),
      ],
    }));

    const buffer = await buildPeraStockExcelBuffer(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.getWorksheet('Estoque');
    assert.ok(sheet);
    assert.deepEqual(
      (sheet.getRow(1).values as string[]).slice(1),
      ['Código GTIN/EAN', 'Loja', 'Produto', 'Preço', 'Estoque', 'Estoque mínimo', 'Situação'],
    );

    const row = sheet.getRow(2);
    assert.equal(row.getCell(1).value, '7891234567890');
    assert.equal(row.getCell(2).value, 'PB1');
    assert.equal(row.getCell(3).value, 'Item');
    assert.equal(row.getCell(4).value, 'R$ 5,99');
    assert.equal(row.getCell(5).value, 10);
    assert.equal(row.getCell(6).value, 3);
    assert.equal(row.getCell(7).value, 'Encontrado');
  });
});

describe('buildPeraStockExportFileName', () => {
  it('gera nome seguro pera-estoque-YYYYMMDD-HHmmss.xlsx', () => {
    const name = buildPeraStockExportFileName(new Date('2026-06-22T15:04:05'));
    assert.equal(name, 'pera-estoque-20260622-150405.xlsx');
  });
});

describe('formatExcelSituationLabel', () => {
  it('rotula situações conforme produto', () => {
    assert.equal(formatExcelSituationLabel(store('PB1', { found: true, situation: 'OK' })), 'Encontrado');
    assert.equal(
      formatExcelSituationLabel(store('PB1', { found: false, situation: 'NAO_ENCONTRADO' })),
      'Não encontrado pelo GTIN/EAN no Bling',
    );
    assert.match(
      formatExcelSituationLabel(
        store('PB1', { found: false, situation: 'ERRO_CONSULTA', error: 'timeout' }),
      ),
      /Erro na consulta/,
    );
  });
});

describe('formatPeraStockResponse detailed mode', () => {
  it('até 10 códigos mantém resposta detalhada no chat', () => {
    const barcodes = Array.from({ length: 10 }, (_, index) => `78900000000${index}`);
    const data = mockData(barcodes, (barcode) => ({
      barcode,
      totalCurrentStock: 1,
      stores: [
        store('PB1', {
          found: true,
          situation: 'OK',
          barcode,
          productName: 'Produto',
          salePrice: 1,
          currentStock: 1,
          minimumStock: 0,
        }),
      ],
    }));

    const text = formatPeraStockResponse(data);
    assert.equal((text.match(/^Código:/gm) ?? []).length, 10);
    assert.doesNotMatch(text, /Consulta concluída\./);
    assert.doesNotMatch(text, /Total disponível/);
  });
});
