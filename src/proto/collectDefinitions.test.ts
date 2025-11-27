import * as protobuf from 'protobufjs';

import { ProtoParser } from './ProtoParser';
import { collectProtoDefinitions } from './collectDefinitions';

describe('collectProtoDefinitions', () => {
  let protoParser: ProtoParser;

  beforeEach(() => {
    protoParser = new ProtoParser();
  });

  describe('collecting messages', () => {
    it('should collect messages from nested namespaces', () => {
      const root = new protobuf.Root();
      const namespace = root.define('api.v1');

      const message1 = new protobuf.Type('User');
      message1.add(new protobuf.Field('id', 1, 'string'));
      namespace.add(message1);

      const nestedNamespace = namespace.define('admin');
      const message2 = new protobuf.Type('AdminUser');
      message2.add(new protobuf.Field('role', 1, 'string'));
      nestedNamespace.add(message2);

      const result = collectProtoDefinitions(root, protoParser);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].name).toBe('User');
      expect(result.messages[0].namespace).toBe('api.v1');
      expect(result.messages[1].name).toBe('AdminUser');
      expect(result.messages[1].namespace).toBe('api.v1.admin');
    });

    it('should not collect services or standalone enums as messages', () => {
      const root = new protobuf.Root();
      const namespace = root.define('api');

      const message = new protobuf.Type('Message');
      namespace.add(message);

      const service = new protobuf.Service('TestService');
      namespace.add(service);

      const enumObj = new protobuf.Enum('Status');
      namespace.add(enumObj);

      const result = collectProtoDefinitions(root, protoParser);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].name).toBe('Message');
    });
  });

  describe('collecting enums', () => {
    it('should collect enums from all namespaces', () => {
      const root = new protobuf.Root();
      const namespace = root.define('api.v1');

      const enum1 = new protobuf.Enum('Status');
      enum1.add('UNKNOWN', 0);
      namespace.add(enum1);

      const nestedNamespace = namespace.define('types');
      const enum2 = new protobuf.Enum('Priority');
      enum2.add('LOW', 0);
      nestedNamespace.add(enum2);

      const result = collectProtoDefinitions(root, protoParser);

      expect(result.enums).toHaveLength(2);
      expect(result.enums[0].name).toBe('Status');
      expect(result.enums[0].namespace).toBe('api.v1');
      expect(result.enums[1].name).toBe('Priority');
      expect(result.enums[1].namespace).toBe('api.v1.types');
    });
  });

  describe('collecting services', () => {
    it('should collect services from all namespaces', () => {
      const root = new protobuf.Root();
      const namespace = root.define('api.v1');

      const service1 = new protobuf.Service('UserService');
      namespace.add(service1);

      const nestedNamespace = namespace.define('admin');
      const service2 = new protobuf.Service('AdminService');
      nestedNamespace.add(service2);

      const result = collectProtoDefinitions(root, protoParser);

      expect(result.services).toHaveLength(2);
      expect(result.services[0].name).toBe('UserService');
      expect(result.services[0].namespace).toBe('api.v1');
      expect(result.services[1].name).toBe('AdminService');
      expect(result.services[1].namespace).toBe('api.v1.admin');
    });

    it('should not collect messages or types as services', () => {
      const root = new protobuf.Root();
      const namespace = root.define('api');

      const service = new protobuf.Service('RealService');
      namespace.add(service);

      const message = new protobuf.Type('NotAService');
      namespace.add(message);

      const result = collectProtoDefinitions(root, protoParser);

      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('RealService');
    });
  });

  describe('comprehensive collection', () => {
    it('should collect all definition types together', () => {
      const root = new protobuf.Root();
      const namespace = root.define('api');

      const message = new protobuf.Type('User');
      message.add(new protobuf.Field('id', 1, 'string'));
      namespace.add(message);

      const enumObj = new protobuf.Enum('Status');
      enumObj.add('ACTIVE', 0);
      enumObj.add('INACTIVE', 1);
      namespace.add(enumObj);

      const service = new protobuf.Service('UserService');
      service.add(new protobuf.Method('GetUser', 'rpc', 'GetUserRequest', 'GetUserResponse'));
      namespace.add(service);

      const result = collectProtoDefinitions(root, protoParser);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].name).toBe('User');

      expect(result.enums).toHaveLength(1);
      expect(result.enums[0].name).toBe('Status');
      expect(result.enums[0].values).toHaveLength(2);

      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('UserService');
      expect(result.services[0].methods).toHaveLength(1);
    });

    it('should return empty arrays for namespaces with no definitions', () => {
      const root = new protobuf.Root();
      const namespace = root.define('empty');

      const result = collectProtoDefinitions(namespace, protoParser);

      expect(result.messages).toHaveLength(0);
      expect(result.enums).toHaveLength(0);
      expect(result.services).toHaveLength(0);
    });
  });
});
