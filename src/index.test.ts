/**
 * @fileoverview Functional integration tests for main module exports
 */
import { ProtoSet, createDefaultParseOptions, parseProto } from './index';

describe('index - functional integration tests', () => {
  describe('parseProto', () => {
    it('should successfully parse valid proto content', async () => {
      const protoContent = `
        syntax = "proto3";
        package test;
        
        message User {
          string name = 1;
          int32 age = 2;
        }
        
        service UserService {
          rpc GetUser(User) returns (User);
        }
      `;

      const result = await parseProto(protoContent);

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].name).toBe('User');
      expect(result.messages![0].namespace).toBe('test');
      expect(result.messages![0].fields).toHaveLength(2);
      expect(result.services).toHaveLength(1);
      expect(result.services![0].name).toBe('UserService');
      expect(result.services![0].methods).toHaveLength(1);
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidProto = 'invalid proto content { missing syntax }';

      await expect(parseProto(invalidProto)).rejects.toThrow();
    });

    it('should respect parsing options', async () => {
      const protoContent = `
        syntax = "proto3";
        message TestMessage {
          string user_name = 1;
        }
      `;

      const resultKeepCase = await parseProto(protoContent, { keepCase: true });
      const resultCamelCase = await parseProto(protoContent, { keepCase: false });

      expect(resultKeepCase.messages![0].fields![0].name).toBe('user_name');
      expect(resultCamelCase.messages![0].fields![0].name).toBe('userName');
    });
  });

  describe('ProtoSet', () => {
    it('should aggregate multiple proto definitions', async () => {
      const proto1 = `
        syntax = "proto3";
        package app.v1;
        message Request { string id = 1; }
      `;
      const proto2 = `
        syntax = "proto3";
        package app.v2;
        message Response { string data = 1; }
      `;

      const protoSet = await ProtoSet.from(proto1, proto2);

      expect(protoSet.size()).toBe(2);
      expect(protoSet.getAllMessages()).toHaveLength(2);

      const messages = protoSet.getAllMessages();
      const namespaces = messages.map(m => m.namespace).sort();
      expect(namespaces).toEqual(['app.v1', 'app.v2']);
    });

    it('should handle partial failures when creating ProtoSet', async () => {
      const validProto = `
        syntax = "proto3";
        message Valid { string id = 1; }
      `;
      const invalidProto = 'invalid proto content';

      const protoSet = await ProtoSet.from(validProto, invalidProto);

      expect(protoSet.size()).toBe(1);
      expect(protoSet.getAllMessages()).toHaveLength(1);
      expect(protoSet.getAllMessages()[0].name).toBe('Valid');
    });

    it('should throw when all inputs fail', async () => {
      await expect(ProtoSet.from('invalid1', 'invalid2')).rejects.toThrow('Failed to parse any of the provided inputs');
    });

    it('should generate unified IDL from multiple protos', async () => {
      const proto1 = `syntax = "proto3"; message A { string id = 1; }`;
      const proto2 = `syntax = "proto3"; message B { int32 num = 1; }`;

      const protoSet = await ProtoSet.from(proto1, proto2);
      const unifiedIdl = protoSet.generateSupersetIdl();

      expect(unifiedIdl).toContain('message A');
      expect(unifiedIdl).toContain('message B');
      expect(unifiedIdl).toContain('string id = 1');
      expect(unifiedIdl).toContain('int32 num = 1');
    });
  });

  describe('createDefaultParseOptions', () => {
    it('should return expected default options', () => {
      const baseDir = '/test/base';
      const defaults = createDefaultParseOptions(baseDir);

      expect(defaults).toBeDefined();
      expect(defaults.keepCase).toBe(true);
      expect(defaults.defaults).toBe(true);
      expect(defaults.oneofs).toBe(true);
      expect(defaults.includePaths).toEqual([]);
      expect(defaults.contentProcessor).toBeDefined();
      expect(defaults.importResolver).toBeDefined();
      expect(defaults.fileSystem).toBeDefined();
    });

    it('should merge custom options with defaults', () => {
      const baseDir = '/test/base';
      const customOptions = { keepCase: false, includePaths: ['/custom'] };
      const options = createDefaultParseOptions(baseDir, customOptions);

      expect(options.keepCase).toBe(false);
      expect(options.includePaths).toEqual(['/custom']);
      expect(options.defaults).toBe(true); // default preserved
      expect(options.oneofs).toBe(true); // default preserved
    });
  });
});
