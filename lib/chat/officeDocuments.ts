import { OfficeParser } from 'officeparser';
import type { SupportedFileType } from 'officeparser';

const officeTypes: Record<string, SupportedFileType> = {
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
};

const MAX_OFFICE_TEXT_CHARACTERS = 250_000;

export function getOfficeFileType(extension: string): SupportedFileType | null {
  return officeTypes[extension.toLowerCase()] || null;
}

export function isOfficeZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && (
      (bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08)
    );
}

export async function extractOfficeDocumentText(
  bytes: Uint8Array,
  fileType: SupportedFileType,
): Promise<string> {
  if (!isOfficeZipSignature(bytes)) {
    throw new Error('The Office document is not a valid ZIP-based file.');
  }

  const ast = await OfficeParser.parseOffice(bytes, {
    fileType,
    includeRawContent: false,
    extractAttachments: false,
    decompressionLimits: {
      maxUncompressedBytes: 128 * 1024 * 1024,
      maxZipEntries: 10_000,
      maxTableCells: 250_000,
      maxXmlElements: 500_000,
    },
  });
  const result = await ast.to('text');
  return result.value.trim().slice(0, MAX_OFFICE_TEXT_CHARACTERS);
}
