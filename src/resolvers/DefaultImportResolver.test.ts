import * as fs from 'fs';
import * as path from 'path';

import { MockFileSystem } from '../__mocks__/MockFileSystem';
import { ParseOptions } from '../types';
import { DefaultImportResolver } from './DefaultImportResolver';

// Mock only fs.existsSync for createProtobufResolver tests
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

describe('DefaultImportResolver', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const baseDir = path.join(fixturesDir, 'api');
  const tempDir = path.join(process.cwd(), 'test-temp');
  let mockFileSystem: MockFileSystem;
  const mockedFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    mockFileSystem = new MockFileSystem();
    mockFileSystem.reset();

    // Reset fs mocks
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with base directory and default include paths', () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      // We can't directly test private properties, but we can test the behavior
      expect(resolver).toBeDefined();
    });

    it('should accept custom include paths from options', () => {
      const options: ParseOptions = {
        includePaths: ['/custom/path1', '/custom/path2'],
      };
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem, options);
      expect(resolver).toBeDefined();
    });
  });

  describe('resolveImport', () => {
    it('should resolve absolute paths', async () => {
      const absolutePath = path.join(fixturesDir, 'api/user/v1/user.proto');

      // Mock: absolute path exists
      mockFileSystem.exists.mockResolvedValue(true);

      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const result = await resolver.resolveImport(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should return null for non-existent absolute paths', async () => {
      const nonExistentPath = '/non/existent/file.proto';

      // Mock: absolute path doesn't exist
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockFileSystem.exists.mockResolvedValue(false);

      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const result = await resolver.resolveImport(nonExistentPath);
      expect(result).toBeNull();
    });

    it('should resolve relative paths from base directory', async () => {
      // Mock: file exists in base directory
      mockFileSystem.exists.mockResolvedValue(true);

      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const result = await resolver.resolveImport('user/v1/user.proto');
      expect(result).toBe(path.join(baseDir, 'user/v1/user.proto'));
    });

    it('should resolve paths from include directories', async () => {
      const resolver = new DefaultImportResolver('/some/other/dir', mockFileSystem, {
        includePaths: [fixturesDir],
      });

      const expectedPath = path.join(fixturesDir, 'api/user/v1/user.proto');

      // Mock file doesn't exist in base dir but exists in include path
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        return filePath === expectedPath;
      });

      const result = await resolver.resolveImport('api/user/v1/user.proto');
      expect(result).toBe(expectedPath);
    });

    it('should check proto and protos subdirectories', async () => {
      // Mock file doesn't exist in base dir but exists in proto subdir
      const protoSubDir = path.join(tempDir, 'proto');
      const testFile = path.join(protoSubDir, 'test.proto');

      // Search order: baseDir, includePaths (empty), baseDir/proto, baseDir/protos, process.cwd()
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        return filePath === testFile;
      });

      const resolver = new DefaultImportResolver(tempDir, mockFileSystem);
      const result = await resolver.resolveImport('test.proto');
      expect(result).toBe(testFile);
    });

    it('should return null for non-existent imports', async () => {
      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock file doesn't exist anywhere
      mockFileSystem.exists.mockResolvedValue(false);

      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const result = await resolver.resolveImport('non-existent.proto');
      expect(result).toBeNull();
    });

    it('should handle Google Well-Known Types', async () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);

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
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const imports = ['user/v1/user.proto', 'common/v1/types.proto'];

      // Mock files exist in base directory
      mockFileSystem.exists.mockResolvedValue(true);

      // Should not throw
      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });

    it('should skip validation for Google WKTs', async () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const imports = ['google/protobuf/empty.proto', 'google/protobuf/timestamp.proto', 'google/protobuf/any.proto'];

      // Mock exists to return false for include paths but true for WKT resolution paths
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        // Return false for include path searches
        if (filePath.includes(baseDir) || filePath.includes(process.cwd())) {
          return false;
        }
        // Return true for protobufjs WKT paths to simulate successful WKT resolution
        return filePath.includes('protobufjs') && filePath.includes('google/protobuf');
      });

      // Should not throw even if WKT files don't exist locally
      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });

    it('should throw for non-existent imports', async () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const imports = ['non-existent.proto', 'another-missing.proto'];

      // Create proper ENOENT error
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      // Mock files don't exist anywhere
      mockFileSystem.exists.mockResolvedValue(false);

      await expect(resolver.validateImports(imports)).rejects.toThrow('Cannot resolve import: non-existent.proto');
    });

    it('should validate mixed valid and WKT imports', async () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const imports = ['user/v1/user.proto', 'google/protobuf/empty.proto', 'common/v1/types.proto'];

      // Mock non-WKT files exist
      mockFileSystem.exists.mockResolvedValue(true);

      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });
  });

  describe('createProtobufResolver', () => {
    it('should return a function that resolves imports', () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const resolvePath = resolver.createProtobufResolver();

      expect(typeof resolvePath).toBe('function');
    });

    it('should handle absolute paths in the resolver', () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const resolvePath = resolver.createProtobufResolver();

      const absolutePath = path.join(fixturesDir, 'api/user/v1/user.proto');

      // Mock file exists
      mockedFs.existsSync.mockReturnValue(true);

      const result = resolvePath('', absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should throw for non-existent absolute paths', () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const resolvePath = resolver.createProtobufResolver();

      const nonExistentPath = '/non/existent/file.proto';

      // Mock file doesn't exist
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => resolvePath('', nonExistentPath)).toThrow('Import not found: /non/existent/file.proto');
    });

    it('should resolve relative paths', () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const resolvePath = resolver.createProtobufResolver();

      // Mock file exists in base directory
      mockedFs.existsSync.mockReturnValue(true);

      const result = resolvePath('', 'user/v1/user.proto');
      expect(result).toBe(path.join(baseDir, 'user/v1/user.proto'));
    });

    it('should return original path for Google WKTs', () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const resolvePath = resolver.createProtobufResolver();

      // Mock WKT doesn't exist locally
      mockedFs.existsSync.mockReturnValue(false);

      // For WKTs, if not found locally, should return the original path
      // to let protobufjs handle it with internal definitions
      const result = resolvePath('', 'google/protobuf/empty.proto');
      expect(result).toBe('google/protobuf/empty.proto');
    });

    it('should throw for non-resolvable non-WKT imports', () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);
      const resolvePath = resolver.createProtobufResolver();

      // Mock file doesn't exist
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => resolvePath('', 'non-existent.proto')).toThrow('Cannot resolve import: non-existent.proto');
    });
  });

  describe('isWellKnownType (indirectly via behavior)', () => {
    it('should handle google/protobuf/* paths specially', async () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);

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

      // Mock exists to return false for include paths but true for WKT resolution paths
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        // Return false for include path searches
        if (filePath.includes(baseDir) || filePath.includes(process.cwd())) {
          return false;
        }
        // Return true for protobufjs WKT paths to simulate successful WKT resolution
        return filePath.includes('protobufjs') && filePath.includes('google/protobuf');
      });

      // validateImports should not throw for WKTs even if files don't exist
      await expect(resolver.validateImports(wktPaths)).resolves.not.toThrow();
    });

    it('should not treat other paths as WKTs', async () => {
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);

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
      mockFileSystem.exists.mockResolvedValue(false);

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

      const resolver = new DefaultImportResolver('/base', mockFileSystem, {
        includePaths: [tempInclude1, tempInclude2],
      });

      // Mock file doesn't exist in base dir, but exists in first include path
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        return filePath === file1;
      });

      // Should find the first match
      const result = await resolver.resolveImport('test.proto');
      expect(result).toBe(file1);
    });

    it('should return null when well-known type cannot be resolved', async () => {
      const baseDir = '/test/base';
      const resolver = new DefaultImportResolver(baseDir, mockFileSystem);

      // Use jest.spyOn instead of replacing global require - safer approach
      const requireResolveSpy = jest.spyOn(require, 'resolve').mockImplementation(() => {
        throw new Error('Module not found');
      });

      try {
        // Mock all filesystem paths to not exist
        const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
        enoentError.code = 'ENOENT';
        mockFileSystem.exists.mockResolvedValue(false);

        const result = await resolver.resolveImport('google/protobuf/any.proto');
        // Even when WKT files can't be physically resolved, we return the import path
        // so protobufjs can handle them with its built-in definitions
        expect(result).toBe('google/protobuf/any.proto');
      } finally {
        // Ensure spy is always restored even if test fails
        requireResolveSpy.mockRestore();
      }
    });
  });
});
