import * as path from 'path';

import { parseProto, parseProtoSync } from './parser';
import { readFile } from './utils';

describe('parseProto', () => {
  const fixturesDir = path.join(process.cwd(), 'fixtures');
  const simplePath = path.join(fixturesDir, 'simple.proto');
  const nestedPath = path.join(fixturesDir, 'nested.proto');

  describe('async parsing', () => {
    test('should parse proto from file path', async () => {
      const result = await parseProto(simplePath);

      expect(result.file).toBe('simple.proto');
      expect(result.path).toBe(simplePath);
      expect(result.idl).toBeTruthy();
      expect(result.services).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.enums).toBeDefined();
    });

    test('should parse proto from string content', async () => {
      const content = await readFile(simplePath);
      const result = await parseProto(content);

      expect(result.file).toBe('inline.proto');
      expect(result.path).toBe('');
      expect(result.idl).toBe(content);
      expect(result.services).toBeDefined();
      expect(result.messages).toBeDefined();
    });

    test('should parse services correctly', async () => {
      const result = await parseProto(simplePath);

      expect(result.services).toHaveLength(1);
      const service = result.services![0];
      expect(service.name).toBe('UserService');
      expect(service.namespace).toBe('example');
      expect(service.methods).toHaveLength(4);

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
      const result = await parseProto(simplePath);

      expect(result.messages).toBeDefined();
      expect(result.messages!.length).toBeGreaterThan(0);

      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage).toBeDefined();
      expect(userMessage!.namespace).toBe('example');
      expect(userMessage!.fields).toBeDefined();
      expect(userMessage!.fields!.length).toBeGreaterThan(0);

      const idField = userMessage!.fields!.find(f => f.name === 'id');
      expect(idField).toBeDefined();
      expect(idField!.type).toBe('int32');
      expect(idField!.number).toBe(1);

      const addressesField = userMessage!.fields!.find(f => f.name === 'addresses');
      expect(addressesField).toBeDefined();
      expect(addressesField!.rule).toBe('repeated');
    });

    test('should parse nested messages', async () => {
      const result = await parseProto(simplePath);

      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage!.nestedMessages).toBeDefined();
      expect(userMessage!.nestedMessages!.length).toBeGreaterThan(0);

      const addressMessage = userMessage!.nestedMessages!.find(m => m.name === 'Address');
      expect(addressMessage).toBeDefined();
      expect(addressMessage!.namespace).toBe('example.User');
    });

    test('should parse enums correctly', async () => {
      const result = await parseProto(simplePath);

      expect(result.enums).toBeDefined();
      expect(result.enums!.length).toBeGreaterThan(0);

      const statusEnum = result.enums!.find(e => e.name === 'Status');
      expect(statusEnum).toBeDefined();
      expect(statusEnum!.namespace).toBe('example');
      expect(statusEnum!.values).toHaveLength(3);

      const unknownValue = statusEnum!.values.find(v => v.name === 'UNKNOWN');
      expect(unknownValue).toBeDefined();
      expect(unknownValue!.number).toBe(0);
    });

    test('should parse oneofs correctly', async () => {
      const result = await parseProto(simplePath);

      const userMessage = result.messages!.find(m => m.name === 'User');
      expect(userMessage!.oneofs).toBeDefined();
      expect(userMessage!.oneofs!.length).toBeGreaterThan(0);

      const contactOneof = userMessage!.oneofs!.find(o => o.name === 'contact');
      expect(contactOneof).toBeDefined();
      expect(contactOneof!.fieldNames).toContain('phone');
      expect(contactOneof!.fieldNames).toContain('mobile');
    });

    test('should handle imports including WKTs', async () => {
      const result = await parseProto(simplePath);

      expect(result.imports).toBeDefined();
      expect(result.imports).toContain('google/protobuf/timestamp.proto');

      const userMessage = result.messages!.find(m => m.name === 'User');
      const createdAtField = userMessage!.fields!.find(f => f.name === 'created_at');
      expect(createdAtField).toBeDefined();
      expect(createdAtField!.type).toBe('google.protobuf.Timestamp');
    });

    test('should parse deeply nested structures', async () => {
      const result = await parseProto(nestedPath);

      const outerMessage = result.messages!.find(m => m.name === 'OuterMessage');
      expect(outerMessage).toBeDefined();
      expect(outerMessage!.namespace).toBe('nested.example');

      const middleMessage = outerMessage!.nestedMessages!.find(m => m.name === 'MiddleMessage');
      expect(middleMessage).toBeDefined();
      expect(middleMessage!.namespace).toBe('nested.example.OuterMessage');

      const innerMessage = middleMessage!.nestedMessages!.find(m => m.name === 'InnerMessage');
      expect(innerMessage).toBeDefined();
      expect(innerMessage!.namespace).toBe('nested.example.OuterMessage.MiddleMessage');

      const innerEnum = middleMessage!.nestedEnums!.find(e => e.name === 'InnerEnum');
      expect(innerEnum).toBeDefined();
      expect(innerEnum!.namespace).toBe('nested.example.OuterMessage.MiddleMessage');
    });
  });

  describe('sync parsing', () => {
    test('should parse proto synchronously', () => {
      const result = parseProtoSync(simplePath);

      expect(result.file).toBe('simple.proto');
      expect(result.path).toBe(simplePath);
      expect(result.services).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.enums).toBeDefined();
    });

    test('should handle errors gracefully', () => {
      const invalidProto = 'invalid proto content';

      expect(() => {
        parseProtoSync(invalidProto);
      }).toThrow('Failed to parse proto');
    });
  });

  describe('options', () => {
    test('should respect keepCase option', async () => {
      const result = await parseProto(simplePath, { keepCase: true });
      const userMessage = result.messages!.find(m => m.name === 'User');
      const createdAtField = userMessage!.fields!.find(f => f.name === 'created_at');
      expect(createdAtField).toBeDefined();
    });

    test('should handle custom include paths', async () => {
      const customProto = `
        syntax = "proto3";
        package custom;
        import "simple.proto";

        message CustomMessage {
          example.User user = 1;
        }
      `;

      const result = await parseProto(customProto, {
        includePaths: [fixturesDir],
      });

      expect(result.messages).toBeDefined();
      const customMessage = result.messages!.find(m => m.name === 'CustomMessage');
      expect(customMessage).toBeDefined();
    });
  });
});
