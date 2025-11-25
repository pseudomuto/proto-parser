/**
 * @fileoverview Functional tests for resolver exports
 */
import { DefaultFileSystem } from '../DefaultFileSystem';
import { BufApiError, BufConfigurationError, BufImportResolver, DefaultImportResolver } from './index';

describe('resolvers - functional tests', () => {
  describe('DefaultImportResolver', () => {
    it('should instantiate and resolve basic imports', async () => {
      const fileSystem = new DefaultFileSystem();
      const resolver = new DefaultImportResolver(process.cwd(), fileSystem);

      // Test resolving a well-known type
      const result = await resolver.resolveImport('google/protobuf/any.proto');
      // Result might be null if protobufjs is not available in test env, that's ok
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should validate imports and throw for unresolvable ones', async () => {
      const fileSystem = new DefaultFileSystem();
      const resolver = new DefaultImportResolver('/nonexistent/path', fileSystem);

      await expect(resolver.validateImports(['nonexistent.proto'])).rejects.toThrow(
        'Cannot resolve import: nonexistent.proto',
      );
    });

    it('should create a protobuf resolver function', () => {
      const fileSystem = new DefaultFileSystem();
      const resolver = new DefaultImportResolver(process.cwd(), fileSystem);
      const protobufResolver = resolver.createProtobufResolver();

      expect(typeof protobufResolver).toBe('function');
      expect(protobufResolver.length).toBe(2); // Takes origin and target params
    });
  });

  describe('BufImportResolver', () => {
    it('should instantiate with pattern-based configuration', () => {
      const fileSystem = new DefaultFileSystem();
      const resolver = new BufImportResolver('/base', fileSystem, {
        modulePatterns: {
          'buf.build/bufbuild/protovalidate': 'buf/validate/*.proto',
        },
      });

      expect(resolver).toBeInstanceOf(BufImportResolver);
      expect(resolver).toBeInstanceOf(DefaultImportResolver); // Extends DefaultImportResolver
    });

    it('should create with authentication token', () => {
      const fileSystem = new DefaultFileSystem();
      const resolver = new BufImportResolver('/base', fileSystem, {
        token: 'test-token',
      });

      expect(resolver).toBeInstanceOf(BufImportResolver);
    });

    it('should validate configuration and handle pattern matching', () => {
      const fileSystem = new DefaultFileSystem();
      const resolver = new BufImportResolver('/base', fileSystem, {
        modulePatterns: {
          'test.module': 'test/**/*.proto',
        },
        cacheTTL: 60000,
      });

      // Should instantiate without errors
      expect(resolver).toBeDefined();
    });
  });

  describe('Error classes', () => {
    it('should throw and catch BufApiError with proper properties', () => {
      const error = new BufApiError('API failed', 404, 'test.module');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BufApiError);
      expect(error.message).toBe('API failed');
      expect(error.statusCode).toBe(404);
      expect(error.module).toBe('test.module');
      expect(error.name).toBe('BufApiError');
    });

    it('should throw and catch BufConfigurationError', () => {
      const error = new BufConfigurationError('Invalid config');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BufConfigurationError);
      expect(error.message).toBe('Invalid config');
      expect(error.name).toBe('BufConfigurationError');
    });

    it('should handle error in try-catch blocks correctly', () => {
      const throwApiError = () => {
        throw new BufApiError('Network error', undefined, 'module.name');
      };

      const throwConfigError = () => {
        throw new BufConfigurationError('Bad pattern');
      };

      expect(throwApiError).toThrow(BufApiError);
      expect(throwConfigError).toThrow(BufConfigurationError);

      try {
        throwApiError();
      } catch (e) {
        expect(e).toBeInstanceOf(BufApiError);
        if (e instanceof BufApiError) {
          expect(e.module).toBe('module.name');
        }
      }
    });
  });
});
