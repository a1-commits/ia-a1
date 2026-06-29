import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BlingConnectionStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import {
  ESTOQUE_TEMPLATE_PATH,
  adjustFormulaRowReferences,
  listResumoFormulaColumns,
  replicateResumoModelRow,
  resolveResumoInputColumns,
  RESUMO_MODEL_ROW,
  RESUMO_PROTECTED_COLUMNS,
} from '../src/domains/exports/estoqueTemplateExcel.service';
import {
  buildPeraStockExcelRows,
  buildPeraStockExportFileName,
  formatExcelSituationLabel,
  PERA_STOCK_BULK_MIN_FOUND_PRODUCTS,
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
  it('0 ou 1 produto encontrado não entra no modo resumido', () => {
    assert.equal(PERA_STOCK_BULK_MIN_FOUND_PRODUCTS, 2);
    assert.equal(shouldUsePeraStockSummary(0), false);
    assert.equal(shouldUsePeraStockSummary(1), false);
  });

  it('2 ou mais produtos encontrados entram no modo resumido', () => {
    assert.equal(shouldUsePeraStockSummary(2), true);
    assert.equal(shouldUsePeraStockSummary(10), true);
    assert.equal(shouldUsePeraStockSummary(100), true);
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
  it('gera workbook xlsx a partir do template com aba RESUMO', async () => {
    const data = mockData(['7891234567890', '7899876543210'], (barcode, index) => ({
      barcode,
      totalCurrentStock: 10,
      stores: [
        store('CD', {
          found: true,
          situation: 'OK',
          barcode,
          productName: index === 0 ? 'Item A' : 'Item B',
          currentStock: 20 + index,
          minimumStock: null,
        }),
        store('PB1', {
          found: true,
          situation: 'OK',
          barcode,
          productName: index === 0 ? 'Item A' : 'Item B',
          currentStock: 10,
          minimumStock: 3,
          salePrice: 5.99,
        }),
        store('PB2', {
          found: true,
          situation: 'OK',
          barcode,
          currentStock: 5,
          minimumStock: 1,
          salePrice: 3.49,
        }),
        store('PB3', {
          found: true,
          situation: 'OK',
          barcode,
          currentStock: 2,
          minimumStock: 0,
          salePrice: 2.5,
        }),
      ],
    }));

    const buffer = await buildPeraStockExcelBuffer(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['RESUMO', 'PB1', 'PB2', 'PB3']);

    const sheet = workbook.getWorksheet('RESUMO');
    assert.ok(sheet);

    const row1 = sheet.getRow(3);
    assert.equal(row1.getCell(1).value, '7891234567890');
    assert.equal(row1.getCell(2).value, 'Item A');
    assert.equal(row1.getCell(5).value, 20);
    assert.equal(row1.getCell(7).value, 10);
    assert.equal(row1.getCell(8).value, 3);
    assert.equal(row1.getCell(11).value, 5);
    assert.equal(row1.getCell(12).value, 1);
    assert.equal(row1.getCell(15).value, 2);
    assert.equal(row1.getCell(16).value, 0);
    assert.equal(row1.getCell(20).value, 5.99);
    assert.equal(row1.getCell(22).value, 3.49);
    assert.equal(row1.getCell(24).value, 2.5);
    assert.match(String(row1.getCell(9).formula ?? ''), /G3-H3/);

    const row2 = sheet.getRow(4);
    assert.equal(row2.getCell(1).value, '7899876543210');
    assert.equal(row2.getCell(2).value, 'Item B');
    assert.equal(row2.getCell(5).value, 21);

    assert.equal(sheet.getRow(5).getCell(1).value, null);

    const pb1 = workbook.getWorksheet('PB1');
    assert.ok(pb1);
    assert.match(String(pb1.getCell('A3').formula ?? ''), /RESUMO!B3/);
  });

  it('inclui somente produtos encontrados na planilha', async () => {
    const data = mockData(['7891', '7892', '7893'], (barcode, index) => ({
      barcode,
      totalCurrentStock: index === 0 ? 5 : 0,
      stores: [
        store('PB1', {
          found: index < 2,
          situation: index < 2 ? 'OK' : 'NAO_ENCONTRADO',
          barcode,
          productName: index < 2 ? `Produto ${index + 1}` : null,
          currentStock: index < 2 ? 5 : null,
          minimumStock: index < 2 ? 1 : null,
        }),
      ],
    }));

    const buffer = await buildPeraStockExcelBuffer(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('RESUMO')!;

    assert.equal(sheet.getRow(3).getCell(1).value, '7891');
    assert.equal(sheet.getRow(4).getCell(1).value, '7892');
    assert.equal(sheet.getRow(5).getCell(1).value, null);
  });

  it('suporta 100 produtos encontrados com fórmulas na aba RESUMO', async () => {
    const barcodes = Array.from({ length: 100 }, (_, index) => `789000000${String(index).padStart(3, '0')}`);
    const data = mockData(barcodes, (barcode) => ({
      barcode,
      totalCurrentStock: 1,
      stores: [
        store('PB1', {
          found: true,
          situation: 'OK',
          barcode,
          productName: `Produto ${barcode}`,
          currentStock: 1,
          minimumStock: 0,
        }),
      ],
    }));

    const buffer = await buildPeraStockExcelBuffer(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('RESUMO')!;

    assert.equal(sheet.getRow(3).getCell(1).value, barcodes[0]);
    assert.equal(sheet.getRow(102).getCell(1).value, barcodes[99]);
    assert.deepEqual(listResumoFormulaColumns(sheet, 102), [4, 6, 9, 13, 17, 21, 23, 25]);
    assert.equal(sheet.getRow(103).getCell(1).value, null);
  });
});

describe('estoque template — revisão técnica', () => {
  it('não altera o template original em disco após geração', async () => {
    const hashBefore = createHash('sha256').update(readFileSync(ESTOQUE_TEMPLATE_PATH)).digest('hex');

    const data = mockData(['7891234567890', '7899876543210'], (barcode, index) => ({
      barcode,
      totalCurrentStock: 1,
      stores: [
        store('PB1', {
          found: true,
          situation: 'OK',
          barcode,
          productName: `Produto ${index}`,
          currentStock: 3,
          minimumStock: 1,
        }),
      ],
    }));

    await buildPeraStockExcelBuffer(data);

    const hashAfter = createHash('sha256').update(readFileSync(ESTOQUE_TEMPLATE_PATH)).digest('hex');
    assert.equal(hashAfter, hashBefore);
  });

  it('preserva fórmulas e estilos nas linhas pré-existentes do template', async () => {
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.readFile(ESTOQUE_TEMPLATE_PATH);
    const templateSheet = templateWorkbook.getWorksheet('RESUMO')!;
    const templateFormula = templateSheet.getRow(3).getCell(9).formula;
    const templateFont = templateSheet.getRow(3).getCell(9).style?.font;
    const templateBorder = templateSheet.getRow(3).getCell(9).style?.border;

    const data = mockData(['7891234567890'], () => ({
      barcode: '7891234567890',
      totalCurrentStock: 1,
      stores: [
        store('PB1', {
          found: true,
          situation: 'OK',
          productName: 'Item',
          currentStock: 8,
          minimumStock: 2,
        }),
      ],
    }));

    const buffer = await buildPeraStockExcelBuffer(data);
    const outputWorkbook = new ExcelJS.Workbook();
    await outputWorkbook.xlsx.load(buffer);
    const outputSheet = outputWorkbook.getWorksheet('RESUMO')!;

    assert.equal(outputSheet.getRow(3).getCell(9).formula, templateFormula);
    assert.deepEqual(outputSheet.getRow(3).getCell(9).style?.font, templateFont);
    assert.deepEqual(outputSheet.getRow(3).getCell(9).style?.border, templateBorder);
  });

  it('replica linha modelo completa acima de 101 produtos', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(ESTOQUE_TEMPLATE_PATH);
    const sheet = workbook.getWorksheet('RESUMO')!;
    const writableColumns = new Set(Object.values(resolveResumoInputColumns(sheet)));

    replicateResumoModelRow(sheet, 150, writableColumns);

    assert.deepEqual(listResumoFormulaColumns(sheet, RESUMO_MODEL_ROW), [4, 6, 9, 13, 17, 21, 23, 25]);
    assert.deepEqual(listResumoFormulaColumns(sheet, 150), [4, 6, 9, 13, 17, 21, 23, 25]);
    assert.equal(sheet.getRow(150).getCell(4).formula, "'PB1'!H150+'PB2'!G150+'PB3'!G150");
    assert.equal(sheet.getRow(150).getCell(9).formula, 'G150-H150');
    assert.equal(sheet.getRow(150).getCell(21).formula, 'SUM(T150/S150)-1');
    assert.deepEqual(sheet.getRow(150).getCell(9).style, sheet.getRow(RESUMO_MODEL_ROW).getCell(9).style);
  });

  it('mapeia colunas de entrada sem incluir QUANTO ENVIAR', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(ESTOQUE_TEMPLATE_PATH);
    const sheet = workbook.getWorksheet('RESUMO')!;
    const columns = resolveResumoInputColumns(sheet);

    assert.deepEqual(columns, {
      barcode: 1,
      description: 2,
      cdStock: 5,
      pb1Stock: 7,
      pb1Min: 8,
      pb2Stock: 11,
      pb2Min: 12,
      pb3Stock: 15,
      pb3Min: 16,
      pb1Price: 20,
      pb2Price: 22,
      pb3Price: 24,
    });

    for (const protectedColumn of [9, 13, 17]) {
      assert.ok(RESUMO_PROTECTED_COLUMNS.has(protectedColumn));
      assert.notEqual(columns.pb1Min, protectedColumn);
      assert.notEqual(columns.pb2Min, protectedColumn);
      assert.notEqual(columns.pb3Min, protectedColumn);
      assert.notEqual(columns.pb1Stock, protectedColumn);
      assert.notEqual(columns.pb2Stock, protectedColumn);
      assert.notEqual(columns.pb3Stock, protectedColumn);
    }
  });

  it('3 produtos preenchem somente colunas de entrada e preservam QUANTO ENVIAR', async () => {
    const data = mockData(['111', '222', '333'], (barcode, index) => ({
      barcode,
      totalCurrentStock: 10 + index,
      stores: ['CD', 'PB1', 'PB2', 'PB3'].map((label) =>
        store(label, {
          found: true,
          situation: 'OK',
          barcode,
          productName: `Produto ${barcode}`,
          currentStock: 10 + index,
          minimumStock: 2 + index,
          salePrice: 5.99 + index,
        }),
      ),
    }));

    const buffer = await buildPeraStockExcelBuffer(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('RESUMO')!;
    const columns = resolveResumoInputColumns(sheet);
    const writable = new Set(Object.values(columns));

    for (let row = 3; row <= 5; row += 1) {
      const priceIndex = row - 3;
      assert.equal(sheet.getRow(row).getCell(columns.pb1Price).value, 5.99 + priceIndex);
      assert.equal(sheet.getRow(row).getCell(columns.pb2Price).value, 5.99 + priceIndex);
      assert.equal(sheet.getRow(row).getCell(columns.pb3Price).value, 5.99 + priceIndex);

      for (const col of [9, 13, 17]) {
        const cell = sheet.getRow(row).getCell(col);
        assert.match(String(cell.formula ?? ''), /[GKO]\d+-[HLPR]\d+/);
      }

      for (const col of [21, 23, 25]) {
        const cell = sheet.getRow(row).getCell(col);
        assert.match(String(cell.formula ?? ''), /SUM\([TVX]\d+\/S\d+\)-1/);
      }

      for (let col = 1; col <= 18; col += 1) {
        if (writable.has(col) || RESUMO_PROTECTED_COLUMNS.has(col)) continue;
        const cell = sheet.getRow(row).getCell(col);
        assert.equal(cell.value, null, `coluna ${col} da linha ${row} não deveria receber valor`);
      }
    }
  });

  it('ajusta referências de linha ao copiar fórmulas', () => {
    assert.equal(
      adjustFormulaRowReferences("'PB1'!H4+'PB2'!G4+'PB3'!G4", 4, 150),
      "'PB1'!H150+'PB2'!G150+'PB3'!G150",
    );
    assert.equal(
      adjustFormulaRowReferences('MAX((E4-SUM(J4,N4,R4)))', 4, 150),
      'MAX((E150-SUM(J150,N150,R150)))',
    );
    assert.equal(adjustFormulaRowReferences('E14+E4', 4, 150), 'E14+E150');
  });

  it('template está acessível pelo caminho de produção (__dirname)', () => {
    assert.match(ESTOQUE_TEMPLATE_PATH, /templates[\\/]+estoque-template\.xlsx$/);
    assert.ok(readFileSync(ESTOQUE_TEMPLATE_PATH).byteLength > 0);
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
  it('10 códigos encontrados mantém resposta detalhada no chat', () => {
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
