import * as stream from 'stream';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import { MockFileSystem } from '../__mocks__/MockFileSystem';
import { TarExtractStream } from './TarExtractStream';

/**
 * Utilities for creating tar test data.
 */
class TarTestUtils {
  /**
   * Creates a minimal tar header for testing.
   * This creates a properly formatted tar header with checksum.
   */
  static createTarHeader(name: string, size: number, type: string = '0'): Buffer {
    const header = Buffer.alloc(512, 0);

    // Write file name (offset 0, 100 bytes)
    header.write(name, 0, Math.min(name.length, 99), 'ascii');

    // Write file mode (offset 100, 8 bytes) - default 644
    header.write('0000644\0', 100, 8, 'ascii');

    // Write uid (offset 108, 8 bytes)
    header.write('0000000\0', 108, 8, 'ascii');

    // Write gid (offset 116, 8 bytes)
    header.write('0000000\0', 116, 8, 'ascii');

    // Write size (offset 124, 12 bytes) in octal
    const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
    header.write(sizeOctal, 124, 12, 'ascii');

    // Write mtime (offset 136, 12 bytes)
    header.write('00000000000\0', 136, 12, 'ascii');

    // Write checksum placeholder (offset 148, 8 bytes)
    header.write('        ', 148, 8, 'ascii');

    // Write type flag (offset 156, 1 byte)
    header.write(type, 156, 1, 'ascii');

    // Write magic (offset 257, 6 bytes)
    header.write('ustar\0', 257, 6, 'ascii');

    // Write version (offset 263, 2 bytes)
    header.write('00', 263, 2, 'ascii');

    // Calculate and write checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.write(checksumStr, 148, 8, 'ascii');

    return header;
  }

  /**
   * Creates a complete tar entry (header + data + padding).
   */
  static createTarEntry(name: string, content: string): Buffer {
    const data = Buffer.from(content, 'utf8');
    const header = this.createTarHeader(name, data.length);

    // Calculate padding needed to align to 512 bytes
    const paddingSize = 512 - (data.length % 512);
    const padding = paddingSize === 512 ? Buffer.alloc(0) : Buffer.alloc(paddingSize, 0);

    return Buffer.concat([header, data, padding]);
  }

  /**
   * Creates a complete tar buffer with multiple files and end-of-archive markers.
   */
  static createCompleteTar(files: Record<string, string>): Buffer {
    const entries: Buffer[] = [];

    for (const [name, content] of Object.entries(files)) {
      entries.push(this.createTarEntry(name, content));
    }

    // Add two empty 512-byte blocks to mark end of tar
    entries.push(Buffer.alloc(1024, 0));

    return Buffer.concat(entries);
  }

  /**
   * Creates an invalid tar header for testing error cases.
   */
  static createInvalidHeader(): Buffer {
    const header = Buffer.alloc(512, 0);
    header.write('invalid', 0, 7, 'ascii');
    // No ustar magic number
    return header;
  }
}

/**
 * Stream testing helpers.
 */
async function writeToStream(targetStream: TarExtractStream, data: Buffer): Promise<void> {
  const readable = stream.Readable.from([data]);
  await pipeline(readable, targetStream);
}

async function processFullTar(targetStream: TarExtractStream, tarData: Buffer): Promise<void> {
  await writeToStream(targetStream, tarData);
}

describe('TarExtractStream', () => {
  let mockFileSystem: MockFileSystem;
  let targetDir: string;

  beforeEach(() => {
    mockFileSystem = new MockFileSystem();
    targetDir = '/test/target';
  });

  describe('constructor', () => {
    it('should initialize with target directory and file system', () => {
      const stream = new TarExtractStream(targetDir, mockFileSystem);
      expect(stream).toBeInstanceOf(TarExtractStream);
    });
  });

  describe('private method testing', () => {
    let stream: TarExtractStream;

    beforeEach(() => {
      stream = new TarExtractStream(targetDir, mockFileSystem);
    });

    describe('isValidTarHeader', () => {
      it('should validate ustar magic number', () => {
        const header = TarTestUtils.createTarHeader('test.proto', 100);
        const isValid = (stream as any).isValidTarHeader(header);
        expect(isValid).toBe(true);
      });

      it('should reject invalid magic number', () => {
        const invalidHeader = TarTestUtils.createInvalidHeader();
        const isValid = (stream as any).isValidTarHeader(invalidHeader);
        expect(isValid).toBe(false);
      });

      it('should handle empty header', () => {
        const emptyHeader = Buffer.alloc(512, 0);
        const isValid = (stream as any).isValidTarHeader(emptyHeader);
        expect(isValid).toBe(false);
      });

      it('should handle ustar with null terminator', () => {
        const header = Buffer.alloc(512, 0);
        header.write('ustar\0', 257, 6, 'ascii');
        const isValid = (stream as any).isValidTarHeader(header);
        expect(isValid).toBe(true);
      });
    });

    describe('parseTarHeader', () => {
      it('should parse simple file name', () => {
        const header = TarTestUtils.createTarHeader('test.proto', 42);
        const entry = (stream as any).parseTarHeader(header);

        expect(entry.name).toBe('test.proto');
        expect(entry.size).toBe(42);
        expect(entry.type).toBe('0');
      });

      it('should parse complex file path', () => {
        const header = TarTestUtils.createTarHeader('path/to/file.proto', 1024);
        const entry = (stream as any).parseTarHeader(header);

        expect(entry.name).toBe('path/to/file.proto');
        expect(entry.size).toBe(1024);
      });

      it('should handle zero size file', () => {
        const header = TarTestUtils.createTarHeader('empty.proto', 0);
        const entry = (stream as any).parseTarHeader(header);

        expect(entry.size).toBe(0);
      });

      it('should handle large file size', () => {
        const header = TarTestUtils.createTarHeader('large.proto', 65536);
        const entry = (stream as any).parseTarHeader(header);

        expect(entry.size).toBe(65536);
      });

      it('should parse directory type', () => {
        const header = TarTestUtils.createTarHeader('dir/', 0, '5');
        const entry = (stream as any).parseTarHeader(header);

        expect(entry.type).toBe('5');
        expect(entry.size).toBe(0);
      });

      it('should handle file names with null termination', () => {
        const header = Buffer.alloc(512, 0);
        header.write('test.proto\0\0\0', 0, 13, 'ascii');
        header.write('0000644\0', 100, 8, 'ascii');
        header.write('0000010\0', 124, 8, 'ascii'); // size 8 in octal
        header.write('0', 156, 1, 'ascii');
        header.write('ustar\0', 257, 6, 'ascii');

        const entry = (stream as any).parseTarHeader(header);
        expect(entry.name).toBe('test.proto');
        expect(entry.size).toBe(8);
      });

      it('should handle empty size string', () => {
        const header = Buffer.alloc(512, 0);
        header.write('test.proto', 0, 10, 'ascii');
        header.write('\0\0\0\0\0\0\0\0\0\0\0\0', 124, 12, 'ascii'); // empty size
        header.write('0', 156, 1, 'ascii');
        header.write('ustar\0', 257, 6, 'ascii');

        const entry = (stream as any).parseTarHeader(header);
        expect(entry.size).toBe(0);
      });
    });
  });

  describe('stream processing', () => {
    it('should extract proto files', async () => {
      const files = {
        'test.proto': 'syntax = "proto3";\nmessage Test {}',
        'another.proto': 'syntax = "proto3";\nmessage Another {}',
      };
      const tarData = TarTestUtils.createCompleteTar(files);

      mockFileSystem.access.mockRejectedValue(new Error('Directory does not exist'));

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, tarData);

      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(2);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/test/target/test.proto',
        Buffer.from(files['test.proto']),
      );
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/test/target/another.proto',
        Buffer.from(files['another.proto']),
      );
    });

    it('should skip non-proto files', async () => {
      const files = {
        'test.proto': 'syntax = "proto3";',
        'README.md': 'This is a readme',
        'config.json': '{"key": "value"}',
      };
      const tarData = TarTestUtils.createCompleteTar(files);

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, tarData);

      // Only the .proto file should be written
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/test/target/test.proto',
        Buffer.from(files['test.proto']),
      );
    });

    it('should handle archives with leading directory paths', async () => {
      const files = {
        'module-v1.0.0/proto/test.proto': 'syntax = "proto3";',
      };
      const tarData = TarTestUtils.createCompleteTar(files);

      mockFileSystem.access.mockRejectedValue(new Error('Directory does not exist'));

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, tarData);

      // Should preserve the full directory structure (no path stripping)
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/test/target/module-v1.0.0/proto/test.proto',
        Buffer.from('syntax = "proto3";'),
      );
    });

    it('should create missing directories', async () => {
      const files = {
        'nested/path/test.proto': 'syntax = "proto3";',
      };
      const tarData = TarTestUtils.createCompleteTar(files);

      mockFileSystem.access.mockRejectedValue(new Error('Directory does not exist'));

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, tarData);

      expect(mockFileSystem.mkdir).toHaveBeenCalledWith('/test/target/nested/path', { recursive: true });
    });

    it('should not create directories that already exist', async () => {
      const files = {
        'test.proto': 'syntax = "proto3";',
      };
      const tarData = TarTestUtils.createCompleteTar(files);

      mockFileSystem.access.mockResolvedValue(undefined); // Directory exists

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, tarData);

      expect(mockFileSystem.mkdir).not.toHaveBeenCalled();
    });

    it('should process tar in multiple chunks', async () => {
      const files = {
        'test.proto': 'syntax = "proto3";\nmessage Test {}',
      };
      const tarData = TarTestUtils.createCompleteTar(files);

      const stream = new TarExtractStream(targetDir, mockFileSystem);

      // Split tar data into multiple chunks
      const chunkSize = 256;
      const chunks: Buffer[] = [];
      for (let i = 0; i < tarData.length; i += chunkSize) {
        chunks.push(tarData.subarray(i, Math.min(i + chunkSize, tarData.length)));
      }

      const readable = new Readable({
        read() {
          const chunk = chunks.shift();
          this.push(chunk || null);
        },
      });
      await pipeline(readable, stream);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/test/target/test.proto',
        Buffer.from(files['test.proto']),
      );
    });

    it('should handle empty tar archive', async () => {
      // Just the end-of-archive markers
      const emptyTar = Buffer.alloc(1024, 0);

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, emptyTar);

      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });

    it('should skip directory entries', async () => {
      const entries = [
        TarTestUtils.createTarEntry('directory/', ''), // Directory with 0 size
        TarTestUtils.createTarEntry('test.proto', 'syntax = "proto3";'),
        Buffer.alloc(1024, 0), // End markers
      ];
      const tarData = Buffer.concat(entries);

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, tarData);

      // Only the proto file should be written, directory should be skipped
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw error for incomplete tar entry at end of stream', async () => {
      const header = TarTestUtils.createTarHeader('test.proto', 100);
      const partialData = Buffer.from('incomplete'); // Less than 100 bytes
      const incompleteTar = Buffer.concat([header, partialData]);

      const stream = new TarExtractStream(targetDir, mockFileSystem);

      await expect(processFullTar(stream, incompleteTar)).rejects.toThrow('Incomplete tar entry at end of stream');
    });

    it('should handle filesystem write errors', async () => {
      const files = { 'test.proto': 'syntax = "proto3";' };
      const tarData = TarTestUtils.createCompleteTar(files);

      mockFileSystem.writeFile.mockRejectedValue(new Error('Write failed'));

      const stream = new TarExtractStream(targetDir, mockFileSystem);

      await expect(processFullTar(stream, tarData)).rejects.toThrow('Write failed');
    });

    it('should handle mkdir errors', async () => {
      const files = { 'nested/test.proto': 'syntax = "proto3";' };
      const tarData = TarTestUtils.createCompleteTar(files);

      mockFileSystem.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFileSystem.mkdir.mockRejectedValue(new Error('Cannot create directory'));

      const stream = new TarExtractStream(targetDir, mockFileSystem);

      await expect(processFullTar(stream, tarData)).rejects.toThrow('Cannot create directory');
    });

    it('should handle invalid tar data gracefully', async () => {
      const invalidData = Buffer.from('This is not a tar file');

      const stream = new TarExtractStream(targetDir, mockFileSystem);
      await processFullTar(stream, invalidData);

      // Should not write any files
      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });
  });
});
