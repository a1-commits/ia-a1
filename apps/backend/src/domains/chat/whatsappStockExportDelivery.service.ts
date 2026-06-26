import {
  loadExportFile,
  parseStockExportDownloadUrl,
} from '../exports/peraStockExport.service';
import { transformBulkReplyForWhatsappAttachment } from './stockResponseFormat';

export type WhatsappStockExportAttachment = {
  filePath: string;
  fileName: string;
};

export async function prepareWhatsappStockExportReply(input: {
  replyText: string;
  userId: string;
}): Promise<{ replyText: string; attachment?: WhatsappStockExportAttachment }> {
  const fileId = parseStockExportDownloadUrl(input.replyText);
  if (!fileId) {
    return { replyText: input.replyText };
  }

  const exportFile = await loadExportFile({ fileId, userId: input.userId });
  if (!exportFile) {
    return { replyText: input.replyText };
  }

  return {
    replyText: transformBulkReplyForWhatsappAttachment(input.replyText),
    attachment: {
      filePath: exportFile.filePath,
      fileName: exportFile.fileName,
    },
  };
}
