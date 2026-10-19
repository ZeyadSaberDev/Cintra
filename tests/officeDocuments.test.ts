import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import {
  extractOfficeDocumentText,
  getOfficeFileType,
  isOfficeZipSignature,
} from '../lib/chat/officeDocuments.js';

function createZip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(
    Object.entries(files).map(([fileName, contents]) => [fileName, strToU8(contents)]),
  ));
}

const sharedOfficeParts = {
  '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>',
  '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"',
};

test('maps only supported modern Office extensions and checks ZIP signatures', () => {
  assert.equal(getOfficeFileType('.docx'), 'docx');
  assert.equal(getOfficeFileType('.XLSX'), 'xlsx');
  assert.equal(getOfficeFileType('.pptx'), 'pptx');
  assert.equal(getOfficeFileType('.doc'), null);
  assert.equal(getOfficeFileType('.xls'), null);
  assert.equal(getOfficeFileType('.ppt'), null);
  assert.equal(isOfficeZipSignature(Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(isOfficeZipSignature(Uint8Array.from([0x50, 0x4b, 0x00, 0x00])), false);
});

test('extracts text from DOCX, XLSX, and PPTX packages', async () => {
  const docx = createZip({
    ...sharedOfficeParts,
    '[Content_Types].xml': `${sharedOfficeParts['[Content_Types].xml']}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `${sharedOfficeParts['_rels/.rels']} Target="word/document.xml"/></Relationships>`,
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word office fixture text</w:t></w:r></w:p></w:body></w:document>',
  });
  const xlsx = createZip({
    ...sharedOfficeParts,
    '[Content_Types].xml': `${sharedOfficeParts['[Content_Types].xml']}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `${sharedOfficeParts['_rels/.rels']} Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Revenue</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>',
  });
  const pptx = createZip({
    ...sharedOfficeParts,
    '[Content_Types].xml': `${sharedOfficeParts['[Content_Types].xml']}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    '_rels/.rels': `${sharedOfficeParts['_rels/.rels']} Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml': '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
    'ppt/slides/slide1.xml': '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="TextBox 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/><a:lstStyle xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:t>Quarterly plan</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  });

  assert.match(await extractOfficeDocumentText(docx, 'docx'), /Word office fixture text/u);
  assert.match(await extractOfficeDocumentText(xlsx, 'xlsx'), /Revenue\s+42/u);
  assert.match(await extractOfficeDocumentText(pptx, 'pptx'), /Quarterly plan/u);
});

test('rejects malformed or non-ZIP Office uploads before parsing', async () => {
  await assert.rejects(extractOfficeDocumentText(Buffer.from('not an office archive'), 'docx'), /not a valid ZIP/u);
  await assert.rejects(extractOfficeDocumentText(createZip({ 'unrelated.txt': 'plain text' }), 'pptx'));
});
