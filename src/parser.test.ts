import * as path from 'path';

import { DefaultFileSystem } from './DefaultFileSystem';
import { parseProto } from './parser';

/**
 * Integration tests for the parseProto function.
 *
 * These tests verify the entire parsing pipeline works correctly,
 * including the interaction between:
 * - ImportResolver (for resolving proto imports)
 * - ContentProcessor (for parsing protobuf structures)
 * - Main parser logic (for orchestrating the parsing process)
 *
 * For unit tests of individual components, see:
 * - ContentProcessor.test.ts (parsing logic)
 * - ImportResolver.test.ts (import resolution)
 */
describe('parseProto', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const includePaths = [fixturesDir];
  const userServicePath = path.join(fixturesDir, 'api/user/v1/user_service.proto');
  const userPath = path.join(fixturesDir, 'api/user/v1/user.proto');
  const inventoryServicePath = path.join(fixturesDir, 'api/inventory/v1/inventory_service.proto');
  const nestedPath = path.join(fixturesDir, 'examples/nested_structures.proto');

  describe('async parsing', () => {
    test('should parse proto from file path', async () => {
      const result = await parseProto(userServicePath, { includePaths });

      expect(result.file).toBe('user_service.proto');
      expect(result.path).toBe(userServicePath);
      expect(result.idl).toBeTruthy();
      expect(result.services).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.enums).toBeDefined();
    });

    test('should parse proto from string content', async () => {
      const fileSystem = new DefaultFileSystem();
      const content = await fileSystem.readFile(userServicePath, 'utf-8');
      const result = await parseProto(content, { includePaths });

      expect(result.file).toBe('inline.proto');
      expect(result.path).toBe('');
      expect(result.idl).toBe(content);
      expect(result.services).toBeDefined();
      expect(result.messages).toBeDefined();
    });

    test('should parse services correctly', async () => {
      const result = await parseProto(userServicePath, { includePaths });

      expect(result.services).toHaveLength(1);
      const service = result.services![0];
      expect(service.name).toBe('UserService');
      expect(service.namespace).toBe('api.user.v1');
      expect(service.methods).toHaveLength(7);

      const getUser = service.methods!.find(m => m.name === 'GetUser');
      expect(getUser).toBeDefined();
      expect(getUser!.requestType).toBe('GetUserRequest');
      expect(getUser!.responseType).toBe('GetUserResponse');
      expect(getUser!.requestStream).toBe(false);
      expect(getUser!.responseStream).toBe(false);

      const streamUsers = service.methods!.find(m => m.name === 'StreamUsers');
      expect(streamUsers).toBeDefined();
      expect(streamUsers!.responseStream).toBe(true);
    });

    test('should parse messages correctly', async () => {
      const result = await parseProto(userServicePath, { includePaths });

      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBeGreaterThan(0);

      const getUserRequestMessage = result.messages!.find(m => m.name === 'GetUserRequest');
      expect(getUserRequestMessage).toBeDefined();
      expect(getUserRequestMessage!.namespace).toBe('api.user.v1');
      expect(getUserRequestMessage!.fields).toBeDefined();
      expect(getUserRequestMessage!.fields!.length).toBeGreaterThan(0);

      const idField = getUserRequestMessage!.fields!.find(f => f.name === 'id');
      expect(idField).toBeDefined();
      expect(idField!.type).toBe('int32');
      expect(idField!.number).toBe(1);

      // Test with User message for repeated fields (should be imported from user.proto)
      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage).toBeDefined();
      const addressesField = userMessage!.fields!.find(f => f.name === 'addresses');
      expect(addressesField).toBeDefined();
      expect(addressesField!.rule).toBe('repeated');
    });

    test('should parse nested messages', async () => {
      // Test with User message that has nested Address from user.proto
      const result = await parseProto(userPath, { includePaths });
      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage!.nestedMessages).toBeDefined();
      expect(userMessage!.nestedMessages!.length).toBeGreaterThan(0);

      const addressMessage = userMessage!.nestedMessages!.find(m => m.name === 'Address');
      expect(addressMessage).toBeDefined();
      expect(addressMessage!.namespace).toBe('api.user.v1.User');
    });

    test('should parse enums correctly', async () => {
      const result = await parseProto(userServicePath, { includePaths });

      expect(result.enums).toBeDefined();
      expect(result.enums!.length).toBeGreaterThan(0);

      const statusEnum = result.enums!.find(e => e.name === 'Status');
      expect(statusEnum).toBeDefined();
      expect(statusEnum!.namespace).toBe('api.common.v1');
      expect(statusEnum!.values).toHaveLength(5);

      const unknownValue = statusEnum!.values.find(v => v.name === 'UNKNOWN');
      expect(unknownValue).toBeDefined();
      expect(unknownValue!.number).toBe(0);
    });

    test('should parse oneofs correctly', async () => {
      const result = await parseProto(userPath, { includePaths });

      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage!.oneofs).toBeDefined();
      expect(userMessage!.oneofs!.length).toBeGreaterThan(0);

      const contactOneof = userMessage!.oneofs!.find(o => o.name === 'contact');
      expect(contactOneof).toBeDefined();
      expect(contactOneof!.fieldNames).toContain('phone');
      expect(contactOneof!.fieldNames).toContain('mobile');
    });

    test('should handle imports including WKTs', async () => {
      const result = await parseProto(userServicePath, { includePaths });

      expect(result.imports).toBeDefined();
      expect(result.imports).toContain('google/protobuf/empty.proto');
      expect(result.imports).toContain('google/protobuf/field_mask.proto');
      expect(result.imports).toContain('api/user/v1/user.proto');
      expect(result.imports).toContain('api/common/v1/types.proto');

      const userMessage = result.messages!.find(m => m.name === 'User');
      const createdAtField = userMessage!.fields!.find(f => f.name === 'created_at');
      expect(createdAtField).toBeDefined();
      expect(createdAtField!.type).toBe('google.protobuf.Timestamp');
    });

    test('should parse deeply nested structures', async () => {
      const result = await parseProto(nestedPath);

      const outerMessage = result.messages!.find(m => m.name === 'OuterMessage');
      expect(outerMessage).toBeDefined();
      expect(outerMessage!.namespace).toBe('examples.nested');

      const middleMessage = outerMessage!.nestedMessages!.find(m => m.name === 'MiddleMessage');
      expect(middleMessage).toBeDefined();
      expect(middleMessage!.namespace).toBe('examples.nested.OuterMessage');

      const innerMessage = middleMessage!.nestedMessages!.find(m => m.name === 'InnerMessage');
      expect(innerMessage).toBeDefined();
      expect(innerMessage!.namespace).toBe('examples.nested.OuterMessage.MiddleMessage');

      const innerEnum = middleMessage!.nestedEnums!.find(e => e.name === 'InnerEnum');
      expect(innerEnum).toBeDefined();
      expect(innerEnum!.namespace).toBe('examples.nested.OuterMessage.MiddleMessage');
    });
  });

  describe('options', () => {
    test('should preserve snake_case when keepCase is true', async () => {
      const result = await parseProto(userPath, { keepCase: true, includePaths });
      const userMessage = result.messages!.find(m => m.name === 'User');
      const createdAtField = userMessage!.fields!.find(f => f.name === 'created_at');
      expect(createdAtField).toBeDefined();
      expect(createdAtField!.type).toBe('google.protobuf.Timestamp');
    });

    test('should convert to camelCase when keepCase is false', async () => {
      const result = await parseProto(userPath, { keepCase: false, includePaths });
      const userMessage = result.messages!.find(m => m.name === 'User');
      const createdAtField = userMessage!.fields!.find(f => f.name === 'createdAt');
      expect(createdAtField).toBeDefined();
      expect(createdAtField!.type).toBe('google.protobuf.Timestamp');
    });

    test('should handle custom include paths', async () => {
      const customProto = `
        syntax = "proto3";
        package custom;
        import "api/user/v1/user.proto";

        message CustomMessage {
          api.user.v1.User user = 1;
        }
      `;

      const result = await parseProto(customProto, {
        includePaths,
      });

      expect(result.messages).toBeDefined();
      const customMessage = result.messages!.find(m => m.name === 'CustomMessage');
      expect(customMessage).toBeDefined();
    });

    test('should parse inventory service with cross-service imports', async () => {
      const result = await parseProto(inventoryServicePath, { includePaths });

      expect(result.file).toBe('inventory_service.proto');
      expect(result.services).toHaveLength(1);

      const service = result.services![0];
      expect(service.name).toBe('InventoryService');
      expect(service.namespace).toBe('api.inventory.v1');
      expect(service.methods!.length).toBeGreaterThan(5);

      // Should include messages from inventory.proto and imported User types
      expect(result.messages!.length).toBeGreaterThan(10);

      // Check for User type imported from user service
      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage).toBeDefined();
      expect(userMessage!.namespace).toBe('api.user.v1');

      // Check for inventory-specific types
      const productMessage = result.messages!.find(m => m.name === 'Product');
      expect(productMessage).toBeDefined();
      expect(productMessage!.namespace).toBe('api.inventory.v1');
    });

    test('should handle complex import chains', async () => {
      // Test that user.proto correctly imports common types
      const result = await parseProto(userPath, { includePaths });

      expect(result.imports).toContain('google/protobuf/timestamp.proto');
      expect(result.imports).toContain('api/common/v1/types.proto');

      // Should have both local and imported types
      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage).toBeDefined();

      // Should have imported common types
      const statusEnum = result.enums!.find(e => e.name === 'Status');
      expect(statusEnum).toBeDefined();
      expect(statusEnum!.namespace).toBe('api.common.v1');
    });

    test('should fail when imports cannot be resolved for file paths', async () => {
      // Test that the parser handles missing imports gracefully
      await expect(parseProto(userPath)).rejects.toThrow();
    });

    test('should fail when imports cannot be resolved for content strings', async () => {
      const contentWithMissingImport = `
        syntax = "proto3";
        package test;
        import "nonexistent/import.proto";

        message TestMessage {
          string field = 1;
        }
      `;

      // Content string parsing should now consistently fail when imports can't be resolved
      await expect(parseProto(contentWithMissingImport)).rejects.toThrow(
        'Cannot resolve import: nonexistent/import.proto',
      );
    });
  });

  describe('with moduleProviders', () => {
    let mockModuleProvider: any;

    beforeEach(() => {
      mockModuleProvider = {
        getIncludePaths: jest.fn().mockResolvedValue(['/mock/temp/buf-modules']),
        dispose: jest.fn().mockResolvedValue(undefined),
      };
    });

    test('should call getIncludePaths on all module providers', async () => {
      const mockProvider2 = {
        getIncludePaths: jest.fn().mockResolvedValue(['/mock/temp/buf-modules2']),
        dispose: jest.fn().mockResolvedValue(undefined),
      };

      const result = await parseProto(userServicePath, {
        includePaths,
        moduleProviders: [mockModuleProvider, mockProvider2],
      });

      expect(mockModuleProvider.getIncludePaths).toHaveBeenCalledTimes(1);
      expect(mockProvider2.getIncludePaths).toHaveBeenCalledTimes(1);
      expect(result.file).toBe('user_service.proto');
    });

    test('should automatically dispose all module providers after parsing', async () => {
      const mockProvider2 = {
        getIncludePaths: jest.fn().mockResolvedValue(['/mock/temp/buf-modules2']),
        dispose: jest.fn().mockResolvedValue(undefined),
      };

      await parseProto(userServicePath, {
        includePaths,
        moduleProviders: [mockModuleProvider, mockProvider2],
      });

      expect(mockModuleProvider.dispose).toHaveBeenCalledTimes(1);
      expect(mockProvider2.dispose).toHaveBeenCalledTimes(1);
    });

    test('should dispose module providers even if parsing fails', async () => {
      const mockProvider = {
        getIncludePaths: jest.fn().mockResolvedValue([]),
        dispose: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        parseProto('./non-existent-file.proto', {
          moduleProviders: [mockProvider],
        }),
      ).rejects.toThrow();

      expect(mockProvider.dispose).toHaveBeenCalledTimes(1);
    });

    test('should handle module provider errors gracefully', async () => {
      const failingProvider = {
        getIncludePaths: jest.fn().mockRejectedValue(new Error('Failed to get include paths')),
        dispose: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        parseProto(userServicePath, {
          includePaths,
          moduleProviders: [failingProvider],
        }),
      ).rejects.toThrow('Failed to get include paths');

      expect(failingProvider.dispose).toHaveBeenCalledTimes(1);
    });

    test('should work with content strings and module providers', async () => {
      const fileSystem = new DefaultFileSystem();
      const content = await fileSystem.readFile(userPath, 'utf-8');

      const result = await parseProto(content, {
        includePaths,
        moduleProviders: [mockModuleProvider],
      });

      expect(mockModuleProvider.getIncludePaths).toHaveBeenCalledTimes(1);
      expect(mockModuleProvider.dispose).toHaveBeenCalledTimes(1);
      expect(result.file).toBe('inline.proto');
    });

    test('should merge module provider paths with existing include paths', async () => {
      const result = await parseProto(userServicePath, {
        includePaths, // Use the valid include paths that are needed for this file
        moduleProviders: [mockModuleProvider],
      });

      expect(mockModuleProvider.getIncludePaths).toHaveBeenCalled();
      expect(result.file).toBe('user_service.proto');
    });
  });
});
