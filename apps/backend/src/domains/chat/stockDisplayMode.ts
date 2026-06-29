import type { BlingStockProductBlock, BlingStockBulkStats } from '../integrations/blingStructured.types';
import { PERA_STOCK_BULK_MIN_FOUND_PRODUCTS } from '../integrations/blingStockExcel';

export type StockDisplayMode = 'detailed' | 'bulk';

export function resolveStockDisplayMode(foundProductCount: number): StockDisplayMode {
  return foundProductCount >= PERA_STOCK_BULK_MIN_FOUND_PRODUCTS ? 'bulk' : 'detailed';
}

function isProductFound(product: BlingStockProductBlock): boolean {
  return product.estoques.some(
    (row) => row.situacao !== 'NAO_ENCONTRADO' && row.situacao !== 'ERRO_CONSULTA',
  );
}

export function buildStockBulkStats(produtos: BlingStockProductBlock[]): BlingStockBulkStats {
  const produtosEncontrados = produtos.filter(isProductFound).length;
  return {
    produtosConsultados: produtos.length,
    produtosEncontrados,
    produtosNaoEncontrados: produtos.length - produtosEncontrados,
  };
}
