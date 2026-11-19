import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DocumentFileType } from './schemas/document.schema.js';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

@Injectable()
export class DocumentStorageService {
  private readonly storageDirectory: string;

  constructor(config: ConfigService) {
    this.storageDirectory = resolve(
      config.get<string>('DOCUMENT_STORAGE_DIR') ||
        join(process.cwd(), '.data', 'documents'),
    );
  }

  async store(buffer: Buffer, fileType: DocumentFileType): Promise<string> {
    const extension = fileType === DocumentFileType.PDF ? 'pdf' : 'txt';
    const storageKey = `${randomUUID()}.${extension}`;
    await mkdir(this.storageDirectory, { recursive: true, mode: 0o700 });
    await writeFile(this.getPath(storageKey), buffer, {
      flag: 'wx',
      mode: 0o600,
    });
    return storageKey;
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.getPath(storageKey));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.getPath(storageKey));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new UnprocessableEntityException(
          'The stored original file is unavailable for processing',
        );
      }
      throw error;
    }
  }

  private getPath(storageKey: string): string {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|txt)$/i.test(
        storageKey,
      )
    ) {
      throw new Error('Invalid document storage key');
    }
    return resolve(this.storageDirectory, storageKey);
  }
}
