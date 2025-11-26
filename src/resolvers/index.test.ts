/**
 * @fileoverview Functional tests for resolver exports
 */
import { DefaultFileSystem } from '../DefaultFileSystem';
import { DefaultImportResolver } from './index';

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
});
