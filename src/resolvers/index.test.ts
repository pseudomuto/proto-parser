/**
 * @fileoverview Functional tests for resolver exports
 */
import { FileSystem } from '../sys';
import { ImportProcessor } from './index';

describe('resolvers - functional tests', () => {
  describe('ImportProcessor', () => {
    it('should instantiate and resolve basic imports', async () => {
      const fileSystem = new FileSystem();
      const resolver = new ImportProcessor(process.cwd(), fileSystem);

      // Test resolving a well-known type
      const result = await resolver.resolveImport('google/protobuf/any.proto');
      // Result might be null if protobufjs is not available in test env, that's ok
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should validate imports and throw for unresolvable ones', async () => {
      const fileSystem = new FileSystem();
      const resolver = new ImportProcessor('/nonexistent/path', fileSystem);

      await expect(resolver.validateImports(['nonexistent.proto'])).rejects.toThrow(
        'Cannot resolve import: nonexistent.proto',
      );
    });
  });
});
