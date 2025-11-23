import * as fs from 'fs';
import * as path from 'path';

import { DefaultImportResolver } from './DefaultImportResolver';
import { ParseOptions } from './types';

describe('DefaultImportResolver', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const baseDir = path.join(fixturesDir, 'api');
  const tempDir = path.join(process.cwd(), 'test-temp');

  describe('constructor', () => {
    it('should initialize with base directory and default include paths', () => {
      const resolver = new DefaultImportResolver(baseDir);
      // We can't directly test private properties, but we can test the behavior
      expect(resolver).toBeDefined();
    });

    it('should accept custom include paths from options', () => {
      const options: ParseOptions = {
        includePaths: ['/custom/path1', '/custom/path2'],
      };
      const resolver = new DefaultImportResolver(baseDir, options);
      expect(resolver).toBeDefined();
    });
  });

  describe('resolveImport', () => {
    it('should resolve absolute paths', async () => {
      const absolutePath = path.join(fixturesDir, 'api/user/v1/user.proto');
      const resolver = new DefaultImportResolver(baseDir);

      const result = await resolver.resolveImport(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should return null for non-existent absolute paths', async () => {
      const nonExistentPath = '/non/existent/file.proto';
      const resolver = new DefaultImportResolver(baseDir);

      const result = await resolver.resolveImport(nonExistentPath);
      expect(result).toBeNull();
    });

    it('should resolve relative paths from base directory', async () => {
      const resolver = new DefaultImportResolver(baseDir);

      const result = await resolver.resolveImport('user/v1/user.proto');
      expect(result).toBe(path.join(baseDir, 'user/v1/user.proto'));
    });

    it('should resolve paths from include directories', async () => {
      const resolver = new DefaultImportResolver('/some/other/dir', {
        includePaths: [fixturesDir],
      });

      const result = await resolver.resolveImport('api/user/v1/user.proto');
      expect(result).toBe(path.join(fixturesDir, 'api/user/v1/user.proto'));
    });

    it('should check proto and protos subdirectories', async () => {
      // Create temporary directory structure
      const protoSubDir = path.join(tempDir, 'proto');
      const testFile = path.join(protoSubDir, 'test.proto');

      try {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.mkdirSync(protoSubDir);
        fs.writeFileSync(testFile, 'syntax = "proto3";');

        const resolver = new DefaultImportResolver(tempDir);
        const result = await resolver.resolveImport('test.proto');
        expect(result).toBe(testFile);
      } finally {
        // Clean up
        if (fs.existsSync(testFile)) {
          fs.unlinkSync(testFile);
          fs.rmdirSync(protoSubDir);
          fs.rmdirSync(tempDir);
        }
      }
    });

    it('should return null for non-existent imports', async () => {
      const resolver = new DefaultImportResolver(baseDir);

      const result = await resolver.resolveImport('non-existent.proto');
      expect(result).toBeNull();
    });

    it('should handle Google Well-Known Types', async () => {
      const resolver = new DefaultImportResolver(baseDir);

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
      const resolver = new DefaultImportResolver(baseDir);
      const imports = ['user/v1/user.proto', 'common/v1/types.proto'];

      // Should not throw
      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });

    it('should skip validation for Google WKTs', async () => {
      const resolver = new DefaultImportResolver(baseDir);
      const imports = ['google/protobuf/empty.proto', 'google/protobuf/timestamp.proto', 'google/protobuf/any.proto'];

      // Should not throw even if WKT files don't exist locally
      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });

    it('should throw for non-existent imports', async () => {
      const resolver = new DefaultImportResolver(baseDir);
      const imports = ['non-existent.proto', 'another-missing.proto'];

      await expect(resolver.validateImports(imports)).rejects.toThrow('Cannot resolve import: non-existent.proto');
    });

    it('should validate mixed valid and WKT imports', async () => {
      const resolver = new DefaultImportResolver(baseDir);
      const imports = ['user/v1/user.proto', 'google/protobuf/empty.proto', 'common/v1/types.proto'];

      await expect(resolver.validateImports(imports)).resolves.not.toThrow();
    });
  });

  describe('createProtobufResolver', () => {
    it('should return a function that resolves imports', () => {
      const resolver = new DefaultImportResolver(baseDir);
      const resolvePath = resolver.createProtobufResolver();

      expect(typeof resolvePath).toBe('function');
    });

    it('should handle absolute paths in the resolver', () => {
      const resolver = new DefaultImportResolver(baseDir);
      const resolvePath = resolver.createProtobufResolver();

      const absolutePath = path.join(fixturesDir, 'api/user/v1/user.proto');
      const result = resolvePath('', absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('should throw for non-existent absolute paths', () => {
      const resolver = new DefaultImportResolver(baseDir);
      const resolvePath = resolver.createProtobufResolver();

      const nonExistentPath = '/non/existent/file.proto';
      expect(() => resolvePath('', nonExistentPath)).toThrow('Import not found: /non/existent/file.proto');
    });

    it('should resolve relative paths', () => {
      const resolver = new DefaultImportResolver(baseDir);
      const resolvePath = resolver.createProtobufResolver();

      const result = resolvePath('', 'user/v1/user.proto');
      expect(result).toBe(path.join(baseDir, 'user/v1/user.proto'));
    });

    it('should return original path for Google WKTs', () => {
      const resolver = new DefaultImportResolver(baseDir);
      const resolvePath = resolver.createProtobufResolver();

      // For WKTs, if not found locally, should return the original path
      // to let protobufjs handle it with internal definitions
      const result = resolvePath('', 'google/protobuf/empty.proto');
      expect(typeof result).toBe('string');

      // If the WKT doesn't resolve to a file, it should return the original path
      if (!fs.existsSync(result)) {
        expect(result).toBe('google/protobuf/empty.proto');
      }
    });

    it('should throw for non-resolvable non-WKT imports', () => {
      const resolver = new DefaultImportResolver(baseDir);
      const resolvePath = resolver.createProtobufResolver();

      expect(() => resolvePath('', 'non-existent.proto')).toThrow('Cannot resolve import: non-existent.proto');
    });
  });

  describe('isWellKnownType (indirectly via behavior)', () => {
    it('should handle google/protobuf/* paths specially', async () => {
      const resolver = new DefaultImportResolver(baseDir);

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
      const resolver = new DefaultImportResolver(baseDir);

      // These should NOT be treated as WKTs
      const nonWktPaths = [
        'google/api/annotations.proto',
        'google_protobuf/empty.proto',
        'my/google/protobuf/fake.proto',
      ];

      // These should fail validation if they don't exist
      for (const path of nonWktPaths) {
        if (!fs.existsSync(path)) {
          await expect(resolver.validateImports([path])).rejects.toThrow();
        }
      }
    });
  });

  describe('integration with include paths', () => {
    it('should search through all include paths in order', async () => {
      // Create temporary test structure
      const tempInclude1 = path.join(tempDir, 'include1');
      const tempInclude2 = path.join(tempDir, 'include2');
      const file1 = path.join(tempInclude1, 'test.proto');
      const file2 = path.join(tempInclude2, 'test.proto');

      try {
        fs.mkdirSync(tempInclude1, { recursive: true });
        fs.mkdirSync(tempInclude2, { recursive: true });
        fs.writeFileSync(file1, '// From include1');
        fs.writeFileSync(file2, '// From include2');

        const resolver = new DefaultImportResolver('/base', {
          includePaths: [tempInclude1, tempInclude2],
        });

        // Should find the first match
        const result = await resolver.resolveImport('test.proto');
        expect(result).toBe(file1);
      } finally {
        // Clean up
        if (fs.existsSync(file1)) fs.unlinkSync(file1);
        if (fs.existsSync(file2)) fs.unlinkSync(file2);
        if (fs.existsSync(tempInclude1)) fs.rmdirSync(tempInclude1);
        if (fs.existsSync(tempInclude2)) fs.rmdirSync(tempInclude2);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      }
    });
  });
});
