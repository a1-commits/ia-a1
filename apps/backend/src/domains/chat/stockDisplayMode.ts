import type { BlingStockProductBlock, BlingStockBulkStats } from '../integrations/blingStructured.types';
import { PERA_STOCK_DETAILED_MAX_CODES } from '../integrations/blingStockExcel';

export type StockDisplayMode = 'detailed' | 'bulk';

export function resolveStockDisplayMode(productCount: number): StockDisplayMode {
  return productCount > PERA_STOCK_DETAILED_MAX_CODES ? 'bulk' : 'detailed';
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
