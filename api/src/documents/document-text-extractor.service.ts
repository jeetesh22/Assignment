import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { DocumentFileType } from './schemas/document.schema.js';

@Injectable()
export class DocumentTextExtractor {
  async extract(fileType: DocumentFileType, buffer: Buffer): Promise<string> {
    const extracted =
      fileType === DocumentFileType.TXT
        ? this.extractTextFile(buffer)
        : await this.extractPdf(buffer);
    const normalized = extracted
      .normalize('NFKC')
      .replace(/^\uFEFF/, '')
      .replaceAll('\0', '')
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!normalized) {
      throw new UnprocessableEntityException(
        'The document contains no extractable text',
      );
    }
    return normalized;
  }

  private extractTextFile(buffer: Buffer): string {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      if (text.includes('\0')) {
        throw new BadRequestException('TXT file contains invalid characters');
      }
      return text;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new UnprocessableEntityException('TXT file must contain valid UTF-8');
    }
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({
      data: buffer,
      isEvalSupported: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    try {
      const result = await parser.getText();
      return result.text;
    } catch {
      throw new UnprocessableEntityException(
        'The PDF is corrupted or could not be parsed',
      );
    } finally {
      await parser.destroy();
    }
  }
}
