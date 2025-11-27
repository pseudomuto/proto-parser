import { MockFileSystem } from '../__mocks__/MockFileSystem';
import { isWellKnownType, resolveWellKnownType } from './wellKnownTypes';

describe('wellKnownTypes utilities', () => {
  let mockFileSystem: MockFileSystem;

  beforeEach(() => {
    mockFileSystem = new MockFileSystem();
    mockFileSystem.reset();
  });

  describe('isWellKnownType', () => {
    it('should identify Google protobuf well-known types', () => {
      expect(isWellKnownType('google/protobuf/empty.proto')).toBe(true);
      expect(isWellKnownType('google/protobuf/timestamp.proto')).toBe(true);
      expect(isWellKnownType('google/protobuf/duration.proto')).toBe(true);
      expect(isWellKnownType('google/protobuf/any.proto')).toBe(true);
      expect(isWellKnownType('google/protobuf/field_mask.proto')).toBe(true);
      expect(isWellKnownType('google/protobuf/struct.proto')).toBe(true);
      expect(isWellKnownType('google/protobuf/wrappers.proto')).toBe(true);
    });

    it('should not identify non-WKT paths as well-known types', () => {
      expect(isWellKnownType('google/api/annotations.proto')).toBe(false);
      expect(isWellKnownType('user/v1/user.proto')).toBe(false);
      expect(isWellKnownType('my/google/protobuf/fake.proto')).toBe(false);
      expect(isWellKnownType('google_protobuf/empty.proto')).toBe(false);
      expect(isWellKnownType('some/other/file.proto')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isWellKnownType('')).toBe(false);
      expect(isWellKnownType('google/protobuf/')).toBe(true);
      expect(isWellKnownType('google/protobuf')).toBe(false);
    });
  });

  describe('resolveWellKnownType', () => {
    it('should return null for non-WKT imports', async () => {
      const result = await resolveWellKnownType('user/v1/user.proto', mockFileSystem);
      expect(result).toBeNull();
    });

    it('should attempt to resolve WKT from protobufjs directory', async () => {
      const importPath = 'google/protobuf/empty.proto';

      // Mock successful resolution from protobufjs directory
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        return filePath.includes('protobufjs') && filePath.includes('google/protobuf');
      });

      const result = await resolveWellKnownType(importPath, mockFileSystem);
      expect(result).toBeTruthy();
      expect(result).toContain('google/protobuf/empty.proto');
    });

    it('should try node_modules as fallback', async () => {
      const importPath = 'google/protobuf/timestamp.proto';

      // Mock failed resolution from protobufjs directory, success from node_modules
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        // First call fails (protobufjs dir), second succeeds (node_modules)
        return filePath.includes('node_modules') && filePath.includes('protobufjs');
      });

      const result = await resolveWellKnownType(importPath, mockFileSystem);
      expect(result).toBeTruthy();
      expect(result).toContain('node_modules/protobufjs/google/protobuf/timestamp.proto');
    });

    it('should return null if WKT cannot be physically resolved', async () => {
      const importPath = 'google/protobuf/any.proto';

      // Mock failed resolution everywhere
      mockFileSystem.exists.mockResolvedValue(false);

      const result = await resolveWellKnownType(importPath, mockFileSystem);
      expect(result).toBeNull();
    });

    it('should handle require.resolve errors gracefully', async () => {
      const importPath = 'google/protobuf/duration.proto';

      // Mock require.resolve to throw an error
      const originalResolve = require.resolve;
      require.resolve = jest.fn().mockImplementation(() => {
        throw new Error('Module not found');
      });

      try {
        mockFileSystem.exists.mockResolvedValue(false);
        const result = await resolveWellKnownType(importPath, mockFileSystem);
        expect(result).toBeNull();
      } finally {
        require.resolve = originalResolve;
      }
    });

    it('should construct correct paths for protobufjs resolution', async () => {
      const importPath = 'google/protobuf/struct.proto';
      const capturedPaths: string[] = [];

      // Capture paths being checked
      mockFileSystem.exists.mockImplementation(async (filePath: string) => {
        capturedPaths.push(filePath);
        return false; // Return false to see all attempted paths
      });

      await resolveWellKnownType(importPath, mockFileSystem);

      // Should have attempted paths including the expected patterns
      expect(capturedPaths.length).toBeGreaterThan(0);
      // At least one path should include protobufjs and the import path
      expect(capturedPaths.some(p => p.includes('protobufjs') && p.includes(importPath))).toBe(true);
    });
  });
});
