import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildStockBulkStats,
  resolveStockDisplayMode,
} from '../src/domains/chat/stockDisplayMode';
import { formatBlingStructuredResponse } from '../src/domains/chat/responseFormatter.service';
import type { BlingStockProductBlock } from '../src/domains/integrations/blingStructured.types';

function mockProduct(code: string, found = true): BlingStockProductBlock {
  const stores = ['PB1', 'PB2', 'PB3', 'PB4'] as const;
  return {
    codigoBarras: code,
    produto: found ? `Produto ${code}` : 'Produto não encontrado',
    estoques: stores.map((loja) => ({
      loja,
      quantidade: found ? 5 : null,
      minimo: found ? 1 : null,
      situacao: found ? 'OK' : 'NAO_ENCONTRADO',
      preco: found ? 2.5 : null,
      codigoInterno: found ? 'SKU-1' : null,
    })),
  };
}

function mockStock(produtos: BlingStockProductBlock[], downloadUrl?: string) {
  return {
    kind: 'stock' as const,
    intent: 'CONSULTA_CODIGO_BARRAS' as const,
    produtos,
    downloadUrl,
  };
}

describe('resolveStockDisplayMode', () => {
  it('0 produtos encontrados → detailed', () => {
    assert.equal(resolveStockDisplayMode(0), 'detailed');
  });

  it('1 produto encontrado → detailed', () => {
    assert.equal(resolveStockDisplayMode(1), 'detailed');
  });

  it('2 produtos encontrados → bulk', () => {
    assert.equal(resolveStockDisplayMode(2), 'bulk');
  });

  it('10 produtos encontrados → bulk', () => {
    assert.equal(resolveStockDisplayMode(10), 'bulk');
  });

  it('50 produtos encontrados → bulk', () => {
    assert.equal(resolveStockDisplayMode(50), 'bulk');
  });
});

describe('buildStockBulkStats', () => {
  it('conta encontrados e não encontrados', () => {
    const stats = buildStockBulkStats([
      mockProduct('1', true),
      mockProduct('2', false),
      mockProduct('3', true),
    ]);
    assert.equal(stats.produtosConsultados, 3);
    assert.equal(stats.produtosEncontrados, 2);
    assert.equal(stats.produtosNaoEncontrados, 1);
  });
});

describe('formatBlingStructuredResponse — displayMode', () => {
  it('1 produto responde detalhado no WhatsApp', async () => {
    const text = await formatBlingStructuredResponse(mockStock([mockProduct('78908901')]), '78908901');
    assert.match(text, /Código: 78908901/);
    assert.match(text, /🏪 PB1/);
    assert.match(text, /Consulta concluída\./);
    assert.doesNotMatch(text, /Consulta concluída ✅/);
  });

  it('5 produtos encontrados responde bulk no WhatsApp', async () => {
    const produtos = Array.from({ length: 5 }, (_, i) => mockProduct(`789000000${i}`));
    const text = await formatBlingStructuredResponse(
      mockStock(produtos, 'https://example.com/planilha.xlsx'),
      'codes',
    );
    assert.match(text, /Consulta concluída\./);
    assert.match(text, /Pode enviar novos códigos quando desejar\./);
    assert.match(text, /📄 A planilha completa foi gerada\./);
    assert.match(text, /https:\/\/example\.com\/planilha\.xlsx/);
    assert.doesNotMatch(text, /^Código:/m);
    assert.doesNotMatch(text, /Produtos consultados:/);
  });

  it('10 produtos encontrados responde bulk', async () => {
    const produtos = Array.from({ length: 10 }, (_, i) => mockProduct(`789000000${i}`));
    const text = await formatBlingStructuredResponse(
      mockStock(produtos, 'https://example.com/planilha.xlsx'),
      'codes',
    );
    assert.match(text, /Consulta concluída\./);
    assert.match(text, /Pode enviar novos códigos quando desejar\./);
    assert.doesNotMatch(text, /^Código:/m);
    assert.doesNotMatch(text, /Produtos consultados:/);
  });

  it('10 consultados com 1 encontrado responde detalhado', async () => {
    const produtos = [
      mockProduct('7890000000', true),
      ...Array.from({ length: 9 }, (_, i) => mockProduct(`789000000${i + 1}`, false)),
    ];
    const text = await formatBlingStructuredResponse(mockStock(produtos), 'codes');
    assert.equal((text.match(/^Código:/gm) ?? []).length, 10);
    assert.doesNotMatch(text, /Produtos consultados:/);
  });

  it('2 produtos encontrados responde bulk com planilha', async () => {
    const produtos = [mockProduct('7890000001', true), mockProduct('7890000002', true)];
    const text = await formatBlingStructuredResponse(
      mockStock(produtos, 'https://example.com/planilha.xlsx'),
      'codes',
    );
    assert.match(text, /Consulta concluída\./);
    assert.match(text, /📄 A planilha completa foi gerada\./);
    assert.match(text, /https:\/\/example\.com\/planilha\.xlsx/);
    assert.doesNotMatch(text, /^🏪 PB1$/m);
    assert.doesNotMatch(text, /Produtos consultados:/);
  });

  it('11 produtos responde bulk com planilha', async () => {
    const produtos = Array.from({ length: 11 }, (_, i) => mockProduct(`789000000${i}`, i % 2 === 0));
    const text = await formatBlingStructuredResponse(
      mockStock(produtos, 'https://example.com/planilha.xlsx'),
      'codes',
    );
    assert.match(text, /Consulta concluída\./);
    assert.match(text, /📄 A planilha completa foi gerada\./);
    assert.match(text, /⬇️ Download:/);
    assert.match(text, /https:\/\/example\.com\/planilha\.xlsx/);
    assert.doesNotMatch(text, /^🏪 PB1$/m);
    assert.doesNotMatch(text, /Lojas consultadas:/);
  });

  it('50 produtos responde bulk', async () => {
    const produtos = Array.from({ length: 50 }, (_, i) => mockProduct(`7890000${String(i).padStart(4, '0')}`));
    const text = await formatBlingStructuredResponse(mockStock(produtos), 'codes');
    assert.match(text, /Consulta concluída\./);
    assert.doesNotMatch(text, /^Código:/m);
    assert.doesNotMatch(text, /Produtos consultados:/);
  });
});
