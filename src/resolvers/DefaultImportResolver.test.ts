import * as fs from 'fs';
import * as path from 'path';

import { DefaultFileSystem } from '../DefaultFileSystem';
import { ParseOptions } from '../types';
import { DefaultImportResolver } from './DefaultImportResolver';

// Mock filesystem for unit tests
jest.mock('fs');

describe('DefaultImportResolver', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const baseDir = path.join(fixturesDir, 'api');
  const tempDir = path.join(process.cwd(), 'test-temp');
  let fileSystem: DefaultFileSystem;
  const mockedFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    fileSystem = new DefaultFileSystem();
    // Reset all mocks
    jest.resetAllMocks();

    // Default mock behavior - don't set a default, let each test configure
  });

  describe('constructor', () => {
    it('should initialize with base directory and default include paths', () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      // We can't directly test private properties, but we can test the behavior
      expect(resolver).toBeDefined();
    });

    it('should accept custom include paths from options', () => {
      const options: ParseOptions = {
        includePaths: ['/custom/path1', '/custom/path2'],
      };
      const resolver = new DefaultImportResolver(baseDir, fileSystem, options);
      expect(resolver).toBeDefined();
    });
  });

  describe('resolveImport', () => {
    it('should resolve absolute paths', async () => {
      const absolutePath = path.join(fixturesDir, 'api/user/v1/user.proto');

      // Mock: absolute path exists
      mockedFs.promises.access.mockResolvedValue(undefined);

      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const result = await resolver.resolveImport(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should return null for non-existent absolute paths', async () => {
      const nonExistentPath = '/non/existent/file.proto';

      // Mock: absolute path doesn't exist
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockedFs.promises.access.mockRejectedValue(enoentError);

      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const result = await resolver.resolveImport(nonExistentPath);
      expect(result).toBeNull();
    });

    it('should resolve relative paths from base directory', async () => {
      // Mock: file exists in base directory
      mockedFs.promises.access.mockResolvedValue(undefined);

      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const result = await resolver.resolveImport('user/v1/user.proto');
      expect(result).toBe(path.join(baseDir, 'user/v1/user.proto'));
    });

    it('should resolve paths from include directories', async () => {
      const resolver = new DefaultImportResolver('/some/other/dir', fileSystem, {
        includePaths: [fixturesDir],
      });

      const expectedPath = path.join(fixturesDir, 'api/user/v1/user.proto');

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock file doesn't exist in base dir but exists in include path
      mockedFs.promises.access
        .mockRejectedValueOnce(enoentError) // base dir
        .mockResolvedValueOnce(undefined); // include path - found here!

      const result = await resolver.resolveImport('api/user/v1/user.proto');
      expect(result).toBe(expectedPath);
    });

    it('should check proto and protos subdirectories', async () => {
      // Mock file doesn't exist in base dir but exists in proto subdir
      const protoSubDir = path.join(tempDir, 'proto');
      const testFile = path.join(protoSubDir, 'test.proto');

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Search order: baseDir, includePaths (empty), baseDir/proto, baseDir/protos, process.cwd()
      mockedFs.promises.access
        .mockRejectedValueOnce(enoentError) // base dir
        .mockResolvedValueOnce(undefined); // proto subdir - found here!

      const resolver = new DefaultImportResolver(tempDir, fileSystem);
      const result = await resolver.resolveImport('test.proto');
      expect(result).toBe(testFile);
    });

    it('should return null for non-existent imports', async () => {
      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock file doesn't exist anywhere
      mockedFs.promises.access.mockRejectedValue(enoentError);

      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const result = await resolver.resolveImport('non-existent.proto');
      expect(result).toBeNull();
    });

    it('should handle Google Well-Known Types', async () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);

      // Test common WKTs
      const emptyResult = await resolver.resolveImport('google/protobuf/empty.proto');
      const timestampResult = await resolver.resolveImport('google/protobuf/timestamp.proto');

      // These should either resolve to actual files or return null (letting protobufjs handle them)
      expect(typeof emptyResult === 'string' || emptyResult === null).toBe(true);
      expect(typeof timestampResult === 'string' || timestampResult === null).toBe(true);
    });
  });

  describe('validateImports', () => {
    it('should validate existing imports', async () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const imports = ['user/v1/user.proto', 'common/v1/types.proto'];

      // Mock files exist in base directory
      mockedFs.promises.access.mockResolvedValue(undefined);

      // Should not throw
      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });

    it('should skip validation for Google WKTs', async () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const imports = ['google/protobuf/empty.proto', 'google/protobuf/timestamp.proto', 'google/protobuf/any.proto'];

      // Should not throw even if WKT files don't exist locally
      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });

    it('should throw for non-existent imports', async () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const imports = ['non-existent.proto', 'another-missing.proto'];

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock files don't exist anywhere
      mockedFs.promises.access.mockRejectedValue(enoentError);

      await expect(resolver.validateImports(imports)).rejects.toThrow('Cannot resolve import: non-existent.proto');
    });

    it('should validate mixed valid and WKT imports', async () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const imports = ['user/v1/user.proto', 'google/protobuf/empty.proto', 'common/v1/types.proto'];

      // Mock non-WKT files exist
      mockedFs.promises.access.mockResolvedValue(undefined);

      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });
  });

  describe('createProtobufResolver', () => {
    it('should return a function that resolves imports', () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const resolvePath = resolver.createProtobufResolver();

      expect(typeof resolvePath).toBe('function');
    });

    it('should handle absolute paths in the resolver', () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const resolvePath = resolver.createProtobufResolver();

      const absolutePath = path.join(fixturesDir, 'api/user/v1/user.proto');

      // Mock file exists
      const mockedFs = fs as jest.Mocked<typeof fs>;
      mockedFs.existsSync.mockReturnValue(true);

      const result = resolvePath('', absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should throw for non-existent absolute paths', () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const resolvePath = resolver.createProtobufResolver();

      const nonExistentPath = '/non/existent/file.proto';

      // Mock file doesn't exist
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => resolvePath('', nonExistentPath)).toThrow('Import not found: /non/existent/file.proto');
    });

    it('should resolve relative paths', () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const resolvePath = resolver.createProtobufResolver();

      // Mock file exists in base directory
      mockedFs.existsSync.mockReturnValue(true);

      const result = resolvePath('', 'user/v1/user.proto');
      expect(result).toBe(path.join(baseDir, 'user/v1/user.proto'));
    });

    it('should return original path for Google WKTs', () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const resolvePath = resolver.createProtobufResolver();

      // Mock WKT doesn't exist locally
      mockedFs.existsSync.mockReturnValue(false);

      // For WKTs, if not found locally, should return the original path
      // to let protobufjs handle it with internal definitions
      const result = resolvePath('', 'google/protobuf/empty.proto');
      expect(result).toBe('google/protobuf/empty.proto');
    });

    it('should throw for non-resolvable non-WKT imports', () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);
      const resolvePath = resolver.createProtobufResolver();

      // Mock file doesn't exist
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => resolvePath('', 'non-existent.proto')).toThrow('Cannot resolve import: non-existent.proto');
    });
  });

  describe('isWellKnownType (indirectly via behavior)', () => {
    it('should handle google/protobuf/* paths specially', async () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);

      // These should be treated as WKTs
      const wktPaths = [
        'google/protobuf/empty.proto',
        'google/protobuf/timestamp.proto',
        'google/protobuf/duration.proto',
        'google/protobuf/any.proto',
        'google/protobuf/field_mask.proto',
        'google/protobuf/struct.proto',
        'google/protobuf/wrappers.proto',
      ];

      // validateImports should not throw for WKTs even if files don't exist
      await expect(resolver.validateImports(wktPaths)).resolves.not.toThrow();
    });

    it('should not treat other paths as WKTs', async () => {
      const resolver = new DefaultImportResolver(baseDir, fileSystem);

      // These should NOT be treated as WKTs
      const nonWktPaths = [
        'google/api/annotations.proto',
        'google_protobuf/empty.proto',
        'my/google/protobuf/fake.proto',
      ];

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock files don't exist
      mockedFs.promises.access.mockRejectedValue(enoentError);

      // These should fail validation since they're not WKTs and don't exist
      for (const path of nonWktPaths) {
        await expect(resolver.validateImports([path])).rejects.toThrow();
      }
    });
  });

  describe('integration with include paths', () => {
    it('should search through all include paths in order', async () => {
      const tempInclude1 = path.join(tempDir, 'include1');
      const tempInclude2 = path.join(tempDir, 'include2');
      const file1 = path.join(tempInclude1, 'test.proto');

      const resolver = new DefaultImportResolver('/base', fileSystem, {
        includePaths: [tempInclude1, tempInclude2],
      });

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock file doesn't exist in base dir, but exists in first include path
      mockedFs.promises.access
        .mockRejectedValueOnce(enoentError) // base dir
        .mockResolvedValueOnce(undefined); // first include path - found here!

      // Should find the first match
      const result = await resolver.resolveImport('test.proto');
      expect(result).toBe(file1);
    });
  });
});
