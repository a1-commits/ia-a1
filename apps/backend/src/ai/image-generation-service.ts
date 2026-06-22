export {
  buildImageBrief as createVisualBrief,
  createImageJob,
  generateIllustrativeImage as generateImageFromPrompt,
  getLatestImageJobForConversation,
  persistGeneratedImage as saveGeneratedImage,
  processImageJob,
  startImageJob,
} from '../domains/chat/imageGeneration.service';

export function generateImagePrompt(visualBrief: { visualPrompt?: string } | string): string {
  return typeof visualBrief === 'string' ? visualBrief : (visualBrief.visualPrompt ?? '');
}

export async function sendImageMessage(): Promise<void> {
  // Image messages are appended by processImageJob after the image is persisted.
}
