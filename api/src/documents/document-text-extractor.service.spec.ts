import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentTextExtractor } from './document-text-extractor.service.js';
import { DocumentFileType } from './schemas/document.schema.js';

describe('DocumentTextExtractor', () => {
  const extractor = new DocumentTextExtractor();

  it('extracts UTF-8 text from TXT files', async () => {
    await expect(
      extractor.extract(DocumentFileType.TXT, Buffer.from('Hello text')),
    ).resolves.toBe('Hello text');
  });

  it('normalizes whitespace and Unicode before downstream processing', async () => {
    await expect(
      extractor.extract(
        DocumentFileType.TXT,
        Buffer.from('\uFEFF  hello \r\n\r\n  world\t!  '),
      ),
    ).resolves.toBe('hello\n\nworld !');
  });

  it('rejects empty or whitespace-only documents', async () => {
    await expect(
      extractor.extract(DocumentFileType.TXT, Buffer.from(' \r\n\t ')),
    ).rejects.toThrow('no extractable text');
  });

  it('rejects invalid UTF-8 in TXT files', async () => {
    await expect(
      extractor.extract(DocumentFileType.TXT, Buffer.from([0xc3, 0x28])),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('extracts text from a valid PDF', async () => {
    const text = await extractor.extract(
      DocumentFileType.PDF,
      createPdfBuffer('Hello PDF'),
    );
    expect(text).toContain('Hello PDF');
  });

  it('returns a safe error for corrupted PDFs', async () => {
    await expect(
      extractor.extract(DocumentFileType.PDF, Buffer.from('%PDF-not-valid')),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

function createPdfBuffer(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}
