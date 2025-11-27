import * as path from 'path';

import { MockFileSystem } from '../__mocks__/MockFileSystem';
import { resolveImport, validateImportPath } from './imports';

describe('import utilities', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const userServicePath = path.join(fixturesDir, 'api/user/v1/user_service.proto');

  describe('resolveImport', () => {
    let mockFileSystem: MockFileSystem;

    beforeEach(() => {
      mockFileSystem = new MockFileSystem();
      mockFileSystem.reset();
    });

    test('should resolve imports in base directory', async () => {
      // Mock file exists in base directory
      const baseDir = path.dirname(userServicePath);
      const importPath = 'user_service.proto';
      const expectedPath = path.join(baseDir, importPath);

      // Configure mock to return true for the expected path
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        return filePath === expectedPath;
      });

      const result = await resolveImport(importPath, baseDir, [], mockFileSystem);
      expect(result).toBe(expectedPath);
      expect(mockFileSystem.exists).toHaveBeenCalledWith(expectedPath);
    });

    test('should resolve imports in include paths', async () => {
      const baseDir = '/tmp';
      const includePaths = [path.dirname(userServicePath)];
      const importPath = 'user_service.proto';
      const expectedPath = path.join(includePaths[0], importPath);

      // Configure mock to return false for base dir paths, but true for include path
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        return filePath === expectedPath;
      });

      const result = await resolveImport(importPath, baseDir, includePaths, mockFileSystem);
      expect(result).toBe(expectedPath);
    });

    test('should return null for non-existent imports', async () => {
      const baseDir = '/tmp';
      const importPath = 'non-existent.proto';

      // Configure mock to return false for all paths (file doesn't exist anywhere)
      mockFileSystem.exists.mockResolvedValue(false);

      const result = await resolveImport(importPath, baseDir, [], mockFileSystem);
      expect(result).toBe(null);
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
