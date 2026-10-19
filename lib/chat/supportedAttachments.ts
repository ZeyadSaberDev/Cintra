export const CHAT_ATTACHMENT_FORMATS = [
  { label: 'PDF', extensions: ['.pdf'] },
  { label: 'TXT', extensions: ['.txt'] },
  { label: 'CSV', extensions: ['.csv'] },
  { label: 'JSON', extensions: ['.json'] },
  { label: 'JPG / JPEG', extensions: ['.jpg', '.jpeg'] },
  { label: 'PNG', extensions: ['.png'] },
  { label: 'GIF', extensions: ['.gif'] },
  { label: 'WebP', extensions: ['.webp'] },
  { label: 'Word (.docx)', extensions: ['.docx'] },
  { label: 'Excel (.xlsx)', extensions: ['.xlsx'] },
  { label: 'PowerPoint (.pptx)', extensions: ['.pptx'] },
] as const;

export const CHAT_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_FORMATS
  .flatMap(({ extensions }) => extensions)
  .join(',');

const supportedExtensions = new Set<string>(CHAT_ATTACHMENT_FORMATS.flatMap(({ extensions }) => extensions));

export function isSupportedChatAttachmentExtension(extension: string): boolean {
  return supportedExtensions.has(extension.toLowerCase());
}
