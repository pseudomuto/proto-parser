import * as path from 'path';
import * as stream from 'stream';

import { IFileSystem } from '../types';

/**
 * Simple tar extraction stream that processes tar file entries.
 * This is a minimal implementation that handles the specific case of
 * extracting proto files from Buf archives.
 *
 * @internal
 * @since 0.3.0
 */
export class TarExtractStream extends stream.Writable {
  #targetDir: string;
  #fileSystem: IFileSystem;
  #buffer: Buffer = Buffer.alloc(0);

  constructor(targetDir: string, fileSystem: IFileSystem) {
    super();
    this.#targetDir = targetDir;
    this.#fileSystem = fileSystem;
  }

  async _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error) => void): Promise<void> {
    try {
      this.#buffer = Buffer.concat([this.#buffer, chunk]);
      await this.processBuffer();
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async _final(callback: (error?: Error) => void): Promise<void> {
    try {
      // Process any remaining data
      await this.processBuffer(true);
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Processes the accumulated buffer to extract tar entries.
   * This is a simplified tar parser that handles the basic case.
   */
  private async processBuffer(final = false): Promise<void> {
    while (this.#buffer.length >= 512) {
      // Tar header is 512 bytes
      const header = this.#buffer.subarray(0, 512);

      // Check if this is a valid tar header
      if (!this.isValidTarHeader(header)) {
        if (final) {
          // End of tar file or padding
          break;
        }
        // Wait for more data
        return;
      }

      const entry = this.parseTarHeader(header);

      if (entry.size === 0) {
        // Directory or empty file, skip
        this.#buffer = this.#buffer.subarray(512);
        continue;
      }

      // Calculate total entry size (header + data, padded to 512 bytes)
      const dataBlocks = Math.ceil(entry.size / 512);
      const totalSize = 512 + dataBlocks * 512;

      if (this.#buffer.length < totalSize) {
        if (final) {
          throw new Error('Incomplete tar entry at end of stream');
        }
        // Wait for more data
        return;
      }

      // Extract file data
      const data = this.#buffer.subarray(512, 512 + entry.size);

      // Only extract .proto files and skip directories
      if (entry.name.endsWith('.proto') && entry.type === '0') {
        await this.extractFile(entry.name, data);
      }

      // Move buffer past this entry
      this.#buffer = this.#buffer.subarray(totalSize);
    }
  }

  /**
   * Checks if a buffer contains a valid tar header.
   */
  private isValidTarHeader(header: Buffer): boolean {
    // Check for tar magic number (at offset 257)
    const magic = header.subarray(257, 263).toString('ascii');
    return magic === 'ustar\0' || magic.startsWith('ustar');
  }

  /**
   * Parses a tar header to extract file information.
   */
  private parseTarHeader(header: Buffer): { name: string; size: number; type: string } {
    // File name is at offset 0, up to 100 bytes
    const nameBytes = header.subarray(0, 100);
    const nullIndex = nameBytes.indexOf(0);
    const name = nameBytes.subarray(0, nullIndex >= 0 ? nullIndex : 100).toString('ascii');

    // File size is at offset 124, 12 bytes in octal
    const sizeStr = header.subarray(124, 136).toString('ascii').trim().replace(/\0/g, '');
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;

    // File type is at offset 156, 1 byte
    const type = header.subarray(156, 157).toString('ascii');

    return { name, size, type };
  }

  /**
   * Extracts a file to the target directory.
   */
  private async extractFile(name: string, data: Buffer): Promise<void> {
    // Use the full path from the tar - don't strip directory components
    // Users expect imports like "buf/validate/validate.proto" and "google/api/annotations.proto"
    const normalizedPath = name;
    const fullPath = path.join(this.#targetDir, normalizedPath);

    // Ensure the directory exists
    const dir = path.dirname(fullPath);
    try {
      await this.#fileSystem.access(dir);
    } catch {
      await this.#fileSystem.mkdir(dir, { recursive: true });
    }

    // Write the file
    await this.#fileSystem.writeFile(fullPath, data);
  }
}
