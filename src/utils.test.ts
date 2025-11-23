import * as path from 'path';

import {
  extractNamespace,
  fileExists,
  getProtoDirectory,
  getProtoPath,
  isFilePath,
  joinNamespace,
  loadProtoContent,
  readFile,
} from './utils';

describe('utils', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const userServicePath = path.join(fixturesDir, 'api/user/v1/user_service.proto');
  const nestedPath = path.join(fixturesDir, 'examples/nested_structures.proto');
  const nonExistentPath = path.join(fixturesDir, 'non-existent.proto');

  const sampleProtoContent = `syntax = "proto3";

package example;

message Test {
  string value = 1;
}`;

  describe('isFilePath', () => {
    describe('async version', () => {
      test('should return true for .proto file extensions', async () => {
        expect(await isFilePath('test.proto')).toBe(true);
        expect(await isFilePath('/path/to/file.proto')).toBe(true);
      });

      test('should return true for existing files', async () => {
        expect(await isFilePath(userServicePath)).toBe(true);
        expect(await isFilePath(nestedPath)).toBe(true);
      });

      test('should return false for proto content with newlines', async () => {
        expect(await isFilePath(sampleProtoContent)).toBe(false);
        expect(await isFilePath('syntax = "proto3";\nmessage Test {}')).toBe(false);
      });

      test('should return false for proto content with syntax declaration', async () => {
        expect(await isFilePath('syntax = "proto3"')).toBe(false);
        expect(await isFilePath('message Test { syntax = "test" }')).toBe(false);
      });

      test('should return false for non-existent non-proto files', async () => {
        expect(await isFilePath('test.txt')).toBe(false);
        expect(await isFilePath('/non/existent/file.txt')).toBe(false);
      });
    });
  });

  describe('loadProtoContent', () => {
    describe('async version', () => {
      test('should load content from file path', async () => {
        const content = await loadProtoContent(userServicePath);
        expect(content).toContain('syntax = "proto3"');
        expect(content).toContain('package api.user.v1');
        expect(content).toContain('service UserService');
      });

      test('should return content string unchanged', async () => {
        const content = await loadProtoContent(sampleProtoContent);
        expect(content).toBe(sampleProtoContent);
      });

      test('should handle relative paths', async () => {
        const relativePath = path.relative(process.cwd(), userServicePath);
        const content = await loadProtoContent(relativePath);
        expect(content).toContain('syntax = "proto3"');
      });

      test('should throw error for non-existent file', async () => {
        await expect(loadProtoContent(nonExistentPath)).rejects.toThrow();
      });
    });
  });

  describe('getProtoPath', () => {
    describe('async version', () => {
      test('should return resolved path for file paths', async () => {
        const result = await getProtoPath(userServicePath);
        expect(result).toBe(path.resolve(userServicePath));
      });

      test('should return resolved path for relative paths', async () => {
        const relativePath = 'fixtures/api/user/v1/user_service.proto';
        const result = await getProtoPath(relativePath);
        expect(result).toBe(path.resolve(relativePath));
      });

      test('should return empty string for proto content', async () => {
        const result = await getProtoPath(sampleProtoContent);
        expect(result).toBe('');
      });

      test('should return empty string for syntax declarations', async () => {
        const result = await getProtoPath('syntax = "proto3"');
        expect(result).toBe('');
      });
    });
  });

  describe('getProtoDirectory', () => {
    test('should return directory of proto file', () => {
      const result = getProtoDirectory(userServicePath);
      expect(result).toBe(path.dirname(userServicePath));
    });

    test('should return current working directory for empty path', () => {
      const result = getProtoDirectory('');
      expect(result).toBe(process.cwd());
    });

    test('should handle absolute paths', () => {
      const absolutePath = path.resolve('/tmp/test.proto');
      const result = getProtoDirectory(absolutePath);
      expect(result).toBe('/tmp');
    });
  });

  // Note: resolveImport tests have been moved to ImportResolver.test.ts
  // since that functionality is now handled by the ImportResolver class

  describe('extractNamespace', () => {
    test('should extract namespace and name from qualified names', () => {
      expect(extractNamespace('google.protobuf.Timestamp')).toEqual({
        namespace: 'google.protobuf',
        name: 'Timestamp',
      });
    });

    test('should handle single-level names', () => {
      expect(extractNamespace('User')).toEqual({
        namespace: '',
        name: 'User',
      });
    });

    test('should handle deeply nested names', () => {
      expect(extractNamespace('com.example.service.v1.UserService')).toEqual({
        namespace: 'com.example.service.v1',
        name: 'UserService',
      });
    });

    test('should handle empty strings', () => {
      expect(extractNamespace('')).toEqual({
        namespace: '',
        name: '',
      });
    });

    test('should handle names with trailing dots', () => {
      expect(extractNamespace('com.example.')).toEqual({
        namespace: 'com.example',
        name: '',
      });
    });
  });

  describe('joinNamespace', () => {
    test('should join namespace parts with dots', () => {
      expect(joinNamespace('google', 'protobuf')).toBe('google.protobuf');
    });

    test('should handle empty parts', () => {
      expect(joinNamespace('', 'protobuf', '', 'Timestamp')).toBe('protobuf.Timestamp');
    });

    test('should handle single parts', () => {
      expect(joinNamespace('example')).toBe('example');
    });

    test('should handle no parts', () => {
      expect(joinNamespace()).toBe('');
    });

    test('should handle multiple levels', () => {
      expect(joinNamespace('com', 'example', 'service', 'v1')).toBe('com.example.service.v1');
    });
  });

  describe('fileExists', () => {
    test('should return true for existing files', async () => {
      expect(await fileExists(userServicePath)).toBe(true);
      expect(await fileExists(nestedPath)).toBe(true);
    });

    test('should return false for non-existent files', async () => {
      expect(await fileExists(nonExistentPath)).toBe(false);
      expect(await fileExists('/non/existent/path.proto')).toBe(false);
    });

    test('should handle relative paths', async () => {
      const relativePath = path.relative(process.cwd(), userServicePath);
      expect(await fileExists(relativePath)).toBe(true);
    });
  });

  describe('readFile', () => {
    test('should read file contents as UTF-8 string', async () => {
      const content = await readFile(userServicePath);
      expect(typeof content).toBe('string');
      expect(content).toContain('syntax = "proto3"');
      expect(content).toContain('package api.user.v1');
    });

    test('should throw error for non-existent files', async () => {
      await expect(readFile(nonExistentPath)).rejects.toThrow();
    });

    test('should handle relative paths', async () => {
      const relativePath = path.relative(process.cwd(), userServicePath);
      const content = await readFile(relativePath);
      expect(content).toContain('syntax = "proto3"');
    });

    test('should read nested file correctly', async () => {
      const content = await readFile(nestedPath);
      expect(content).toContain('package examples.nested');
      expect(content).toContain('OuterMessage');
    });
  });
});
