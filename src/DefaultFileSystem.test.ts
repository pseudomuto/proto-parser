import * as path from 'path';

import { DefaultFileSystem } from './DefaultFileSystem';

describe('DefaultFileSystem', () => {
  let fs: DefaultFileSystem;
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const userServicePath = path.join(fixturesDir, 'api/user/v1/user_service.proto');
  const nestedPath = path.join(fixturesDir, 'examples/nested_structures.proto');
  const nonExistentPath = path.join(fixturesDir, 'non-existent.proto');

  const sampleProtoContent = `syntax = "proto3";

package example;

message Test {
  string value = 1;
}`;

  beforeEach(() => {
    fs = new DefaultFileSystem();
  });

  describe('access', () => {
    test('should not throw for existing files', async () => {
      await expect(fs.access(userServicePath)).resolves.not.toThrow();
      await expect(fs.access(nestedPath)).resolves.not.toThrow();
    });

    test('should throw for non-existent files', async () => {
      await expect(fs.access(nonExistentPath)).rejects.toThrow();
      await expect(fs.access('/non/existent/path.proto')).rejects.toThrow();
    });

    test('should not throw for directories', async () => {
      await expect(fs.access(fixturesDir)).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    test('should return true for existing files', async () => {
      expect(await fs.exists(userServicePath)).toBe(true);
      expect(await fs.exists(nestedPath)).toBe(true);
    });

    test('should return false for non-existent files', async () => {
      expect(await fs.exists(nonExistentPath)).toBe(false);
      expect(await fs.exists('/non/existent/path.proto')).toBe(false);
    });

    test('should return true for existing directories', async () => {
      expect(await fs.exists(fixturesDir)).toBe(true);
    });

    test('should handle relative paths', async () => {
      const relativePath = path.relative(process.cwd(), userServicePath);
      expect(await fs.exists(relativePath)).toBe(true);
    });
  });

  describe('stat', () => {
    test('should return stats for existing files', async () => {
      const stats = await fs.stat(userServicePath);
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    test('should return stats for directories', async () => {
      const stats = await fs.stat(fixturesDir);
      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should throw for non-existent paths', async () => {
      await expect(fs.stat(nonExistentPath)).rejects.toThrow();
    });
  });

  describe('readDir', () => {
    test('should read directory contents as strings by default', async () => {
      const contents = await fs.readDir(fixturesDir);
      expect(Array.isArray(contents)).toBe(true);
      expect(contents.length).toBeGreaterThan(0);
      expect(typeof contents[0]).toBe('string');
    });

    test('should read directory contents as Dirent objects when withFileTypes is true', async () => {
      const contents = await fs.readDir(fixturesDir, { withFileTypes: true });
      expect(Array.isArray(contents)).toBe(true);
      expect(contents.length).toBeGreaterThan(0);
      expect(typeof contents[0]).toBe('object');
      expect('name' in contents[0]).toBe(true);
      expect('isFile' in contents[0]).toBe(true);
    });

    test('should throw for non-existent directories', async () => {
      await expect(fs.readDir('/non/existent/directory')).rejects.toThrow();
    });
  });

  describe('readFile', () => {
    test('should read file contents as Buffer by default', async () => {
      const content = await fs.readFile(userServicePath);
      expect(Buffer.isBuffer(content)).toBe(true);
      expect(content.toString()).toContain('syntax = "proto3"');
    });

    test('should read file contents as string with encoding', async () => {
      const content = await fs.readFile(userServicePath, 'utf-8');
      expect(typeof content).toBe('string');
      expect(content).toContain('syntax = "proto3"');
      expect(content).toContain('package api.user.v1');
    });

    test('should throw for non-existent files', async () => {
      await expect(fs.readFile(nonExistentPath)).rejects.toThrow();
    });

    test('should handle relative paths', async () => {
      const relativePath = path.relative(process.cwd(), userServicePath);
      const content = await fs.readFile(relativePath, 'utf-8');
      expect(content).toContain('syntax = "proto3"');
    });

    test('should read nested file correctly', async () => {
      const content = await fs.readFile(nestedPath, 'utf-8');
      expect(content).toContain('package examples.nested');
      expect(content).toContain('OuterMessage');
    });
  });

  describe('readFileOrLiteral', () => {
    test('should read content from file path', async () => {
      const result = await fs.readFileOrLiteral(userServicePath);
      expect(result.content).toContain('syntax = "proto3"');
      expect(result.content).toContain('package api.user.v1');
      expect(result.content).toContain('service UserService');
      expect(result.filePath).toBe(userServicePath);
    });

    test('should return content string unchanged for proto content', async () => {
      const result = await fs.readFileOrLiteral(sampleProtoContent);
      expect(result.content).toBe(sampleProtoContent);
      expect(result.filePath).toBe('');
    });

    test('should handle relative paths', async () => {
      const relativePath = path.relative(process.cwd(), userServicePath);
      const result = await fs.readFileOrLiteral(relativePath);
      expect(result.content).toContain('syntax = "proto3"');
      expect(result.filePath).toBe(path.resolve(relativePath));
    });

    test('should return proto content for strings with newlines', async () => {
      const multilineContent = 'syntax = "proto3";\nmessage Test {}';
      const result = await fs.readFileOrLiteral(multilineContent);
      expect(result.content).toBe(multilineContent);
      expect(result.filePath).toBe('');
    });

    test('should return proto content for strings with syntax declaration', async () => {
      const syntaxContent = 'syntax = "proto3"';
      const result = await fs.readFileOrLiteral(syntaxContent);
      expect(result.content).toBe(syntaxContent);
      expect(result.filePath).toBe('');
    });

    test('should throw error for non-existent file paths', async () => {
      await expect(fs.readFileOrLiteral(nonExistentPath)).rejects.toThrow();
    });
  });

  describe('filePathIfExists', () => {
    test('should return resolved path for existing file paths', async () => {
      const result = await fs.filePathIfExists(userServicePath);
      expect(result).toBe(path.resolve(userServicePath));
    });

    test('should return resolved path for relative paths to existing files', async () => {
      const relativePath = 'fixtures/api/user/v1/user_service.proto';
      const result = await fs.filePathIfExists(relativePath);
      expect(result).toBe(path.resolve(relativePath));
    });

    test('should return empty string for proto content', async () => {
      const result = await fs.filePathIfExists(sampleProtoContent);
      expect(result).toBe('');
    });

    test('should return empty string for syntax declarations', async () => {
      const result = await fs.filePathIfExists('syntax = "proto3"');
      expect(result).toBe('');
    });

    test('should return empty string for strings with newlines', async () => {
      const result = await fs.filePathIfExists('syntax = "proto3";\nmessage Test {}');
      expect(result).toBe('');
    });

    test('should return resolved path for .proto files even if they do not exist yet', async () => {
      const result = await fs.filePathIfExists('test.proto');
      expect(result).toBe(path.resolve('test.proto'));
    });
  });

  describe('mkdir', () => {
    test('should create directory', async () => {
      const tempDir = path.join(process.cwd(), 'temp-test-dir');
      try {
        await fs.mkdir(tempDir);
        expect(await fs.exists(tempDir)).toBe(true);
        const stats = await fs.stat(tempDir);
        expect(stats.isDirectory()).toBe(true);
      } finally {
        // Cleanup
        if (await fs.exists(tempDir)) {
          await require('fs').promises.rmdir(tempDir);
        }
      }
    });

    test('should create directory recursively', async () => {
      const tempDir = path.join(process.cwd(), 'temp-test-dir', 'nested', 'deep');
      try {
        await fs.mkdir(tempDir, { recursive: true });
        expect(await fs.exists(tempDir)).toBe(true);
        const stats = await fs.stat(tempDir);
        expect(stats.isDirectory()).toBe(true);
      } finally {
        // Cleanup
        const parentDir = path.join(process.cwd(), 'temp-test-dir');
        if (await fs.exists(parentDir)) {
          await require('fs').promises.rm(parentDir, { recursive: true });
        }
      }
    });
  });

  describe('writeFile', () => {
    test('should write file with content', async () => {
      const tempFile = path.join(process.cwd(), 'temp-test-file.txt');
      const testContent = 'Hello, World!';

      try {
        await fs.writeFile(tempFile, testContent, 'utf-8');
        expect(await fs.exists(tempFile)).toBe(true);
        const content = await fs.readFile(tempFile, 'utf-8');
        expect(content).toBe(testContent);
      } finally {
        // Cleanup
        if (await fs.exists(tempFile)) {
          await require('fs').promises.unlink(tempFile);
        }
      }
    });
  });
});
