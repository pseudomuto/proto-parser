import * as fs from 'fs';
import * as path from 'path';

import { DefaultFileSystem } from './DefaultFileSystem';
import { extractNamespace, getProtoDirectory, joinNamespace, resolveImport, validateImportPath } from './utils';

// Mock filesystem for unit tests
jest.mock('fs');

describe('utils', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const userServicePath = path.join(fixturesDir, 'api/user/v1/user_service.proto');

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

  describe('resolveImport', () => {
    let fileSystem: DefaultFileSystem;
    const mockedFs = fs as jest.Mocked<typeof fs>;

    beforeEach(() => {
      fileSystem = new DefaultFileSystem();
      // Reset all mocks
      jest.resetAllMocks();
    });

    test('should resolve imports in base directory', async () => {
      // Mock file exists in base directory
      const baseDir = path.dirname(userServicePath);
      const importPath = 'user_service.proto';
      const expectedPath = path.join(baseDir, importPath);

      mockedFs.promises.access.mockResolvedValue(undefined);

      const result = await resolveImport(importPath, baseDir, [], fileSystem);
      expect(result).toBe(expectedPath);
      expect(mockedFs.promises.access).toHaveBeenCalledWith(expectedPath, fs.constants.F_OK);
    });

    test('should resolve imports in include paths', async () => {
      const baseDir = '/tmp';
      const includePaths = [path.dirname(userServicePath)];
      const importPath = 'user_service.proto';
      const expectedPath = path.join(includePaths[0], importPath);

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock file doesn't exist in base dir, include paths, or proto subdirs
      // Search order: baseDir, includePaths, baseDir/proto, baseDir/protos, process.cwd()
      mockedFs.promises.access
        .mockRejectedValueOnce(enoentError) // baseDir
        .mockResolvedValueOnce(undefined); // includePaths[0] - found here!

      const result = await resolveImport(importPath, baseDir, includePaths, fileSystem);
      expect(result).toBe(expectedPath);
    });

    test('should return null for non-existent imports', async () => {
      const baseDir = '/tmp';
      const importPath = 'non-existent.proto';

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock file doesn't exist anywhere
      mockedFs.promises.access.mockRejectedValue(enoentError);

      const result = await resolveImport(importPath, baseDir, [], fileSystem);
      expect(result).toBe(null);
    });
  });

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

  describe('validateImportPath', () => {
    test('should accept valid import paths', () => {
      expect(() => validateImportPath('buf/validate/validate.proto')).not.toThrow();
      expect(() => validateImportPath('google/protobuf/any.proto')).not.toThrow();
      expect(() => validateImportPath('test/example.proto')).not.toThrow();
      expect(() => validateImportPath('subdirectory/file.proto')).not.toThrow();
    });

    test('should reject path traversal with .. segments', () => {
      expect(() => validateImportPath('../../../etc/passwd')).toThrow(Error);
      expect(() => validateImportPath('test/../../../etc/passwd')).toThrow(Error);
      expect(() => validateImportPath('../test.proto')).toThrow(Error);
      expect(() => validateImportPath('test/../other.proto')).toThrow(Error);
    });

    test('should reject absolute paths', () => {
      expect(() => validateImportPath('/etc/passwd')).toThrow(Error);
      expect(() => validateImportPath('/home/user/test.proto')).toThrow(Error);
      expect(() => validateImportPath('C:\\Windows\\System32\\test.proto')).toThrow(Error);
      expect(() => validateImportPath('D:\\test.proto')).toThrow(Error);
    });

    test('should reject paths with null bytes', () => {
      expect(() => validateImportPath('test\0.proto')).toThrow(Error);
      expect(() => validateImportPath('test/file\0.proto')).toThrow(Error);
    });

    test('should reject empty or invalid import paths', () => {
      expect(() => validateImportPath('')).toThrow(Error);
      expect(() => validateImportPath('.')).toThrow(Error);
      expect(() => validateImportPath('..')).toThrow(Error);
      expect(() => validateImportPath('./test.proto')).toThrow(Error);
      expect(() => validateImportPath('../test.proto')).toThrow(Error);
    });

    test('should reject paths starting with separators', () => {
      expect(() => validateImportPath('/test.proto')).toThrow(Error);
      expect(() => validateImportPath('\\test.proto')).toThrow(Error);
    });

    test('should reject path traversal in Windows-style paths', () => {
      expect(() => validateImportPath('test\\..\\..\\system.proto')).toThrow(Error);
      expect(() => validateImportPath('..\\test.proto')).toThrow(Error);
      expect(() => validateImportPath('test\\..\\other.proto')).toThrow(Error);
    });

    test('should reject paths with invalid directory references', () => {
      expect(() => validateImportPath('test/.')).toThrow(Error);
      expect(() => validateImportPath('test/..')).toThrow(Error);
      expect(() => validateImportPath('test/./file.proto')).toThrow(Error);
      expect(() => validateImportPath('test\\.\\.\\file.proto')).toThrow(Error);
    });

    test('should reject paths with empty segments', () => {
      expect(() => validateImportPath('test//file.proto')).toThrow(Error);
      expect(() => validateImportPath('test\\\\file.proto')).toThrow(Error);
      expect(() => validateImportPath('test/./file.proto')).toThrow(Error);
    });

    test('should validate error messages are descriptive', () => {
      expect(() => validateImportPath('')).toThrow('Import path must be a non-empty string');
      expect(() => validateImportPath('test\0.proto')).toThrow('Import path contains null byte');
      expect(() => validateImportPath('C:\\test.proto')).toThrow('Import path contains Windows drive letter');
      expect(() => validateImportPath('/test.proto')).toThrow('Import path must be relative');
      expect(() => validateImportPath('../test.proto')).toThrow('Import path contains invalid path traversal');
      expect(() => validateImportPath('./test.proto')).toThrow('Import path contains invalid directory reference');
      expect(() => validateImportPath('test//file.proto')).toThrow('Import path contains invalid segments');
    });
  });
});
