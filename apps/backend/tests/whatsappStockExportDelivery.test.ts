import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  transformBulkReplyForWhatsappAttachment,
  formatStockBulkResponse,
} from '../src/domains/chat/stockResponseFormat';
import { prepareWhatsappStockExportReply } from '../src/domains/chat/whatsappStockExportDelivery.service';
import { parseStockExportDownloadUrl } from '../src/domains/exports/peraStockExport.service';

const EXPORTS_DIR = path.resolve(process.cwd(), 'storage', 'exports');
const FILE_ID = '11111111-2222-4333-8444-555555555555';
const USER_ID = 'user-whatsapp-export';

function bulkReplyWithDownload(downloadUrl: string): string {
  return formatStockBulkResponse({
    stats: {
      produtosConsultados: 12,
      produtosEncontrados: 9,
      produtosNaoEncontrados: 3,
    },
    lojas: ['PB1', 'PB2', 'PB3', 'PB4'],
    downloadUrl,
  });
}

describe('parseStockExportDownloadUrl', () => {
  it('extrai fileId da URL interna', () => {
    const fileId = parseStockExportDownloadUrl(
      'Consulta concluída\n/api/exports/11111111-2222-4333-8444-555555555555?token=abc',
    );
    assert.equal(fileId, '11111111-2222-4333-8444-555555555555');
  });
});

describe('transformBulkReplyForWhatsappAttachment', () => {
  it('remove URL e usa mensagem de anexo', () => {
    const text = transformBulkReplyForWhatsappAttachment(
      bulkReplyWithDownload('/api/exports/11111111-2222-4333-8444-555555555555?token=abc'),
    );

    assert.match(text, /Consulta concluída\./);
    assert.match(text, /Pode enviar novos códigos quando desejar\./);
    assert.match(text, /📄 A planilha foi enviada junto desta conversa\./);
    assert.doesNotMatch(text, /\/api\/exports\//);
    assert.doesNotMatch(text, /⬇️ Download:/);
    assert.doesNotMatch(text, /Produtos consultados:/);
  });
});

describe('prepareWhatsappStockExportReply', () => {
  before(async () => {
    const dir = path.join(EXPORTS_DIR, FILE_ID);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'pera-estoque-test.xlsx'), Buffer.from('excel-test'));
    await writeFile(
      path.join(dir, 'meta.json'),
      JSON.stringify({
        userId: USER_ID,
        fileName: 'pera-estoque-test.xlsx',
        filePath: path.join(dir, 'pera-estoque-test.xlsx'),
        expiresAt: Date.now() + 60_000,
      }),
      'utf8',
    );
  });

  after(async () => {
    await rm(path.join(EXPORTS_DIR, FILE_ID), { recursive: true, force: true });
  });

  it('localiza o arquivo e prepara anexo + mensagem sem URL', async () => {
    const prepared = await prepareWhatsappStockExportReply({
      userId: USER_ID,
      replyText: bulkReplyWithDownload(`/api/exports/${FILE_ID}?token=abc`),
    });

    assert.ok(prepared.attachment);
    assert.equal(prepared.attachment.fileName, 'pera-estoque-test.xlsx');
    assert.match(prepared.replyText, /📄 A planilha foi enviada junto desta conversa\./);
    assert.doesNotMatch(prepared.replyText, /\/api\/exports\//);
  });
});
