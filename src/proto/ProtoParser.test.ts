import * as protobuf from 'protobufjs';

import { joinNamespace } from '../utils';
import { ProtoParser } from './ProtoParser';

describe('ProtoParser', () => {
  let protoParser: ProtoParser;

  beforeEach(() => {
    protoParser = new ProtoParser();
  });
  describe('parseFieldRule', () => {
    it('should return "repeated" for repeated fields', () => {
      const field = new protobuf.Field('test', 1, 'string');
      field.repeated = true;
      expect(protoParser.parseFieldRule(field)).toBe('repeated');
    });

    it('should return "required" for required fields', () => {
      // Create field and manually set required (protobufjs specific)
      const field = new protobuf.Field('test', 1, 'string');
      Object.defineProperty(field, 'required', { value: true, writable: false });
      expect(protoParser.parseFieldRule(field)).toBe('required');
    });

    it('should return "optional" for optional fields', () => {
      const field = new protobuf.Field('test', 1, 'string', 'optional');
      expect(protoParser.parseFieldRule(field)).toBe('optional');
    });

    it('should return "optional" for proto3 fields by default', () => {
      // In proto3, fields are optional by default
      const field = new protobuf.Field('test', 1, 'string');
      expect(protoParser.parseFieldRule(field)).toBe('optional');
    });
  });

  describe('parseField', () => {
    it('should parse a basic field', () => {
      const field = new protobuf.Field('name', 1, 'string');
      const parsed = protoParser.parseField(field);

      expect(parsed).toEqual({
        name: 'name',
        type: 'string',
        number: 1,
        rule: 'optional', // Proto3 default
        defaultValue: null, // protobufjs uses null for no default
        options: {},
        oneofIndex: undefined,
      });
    });

    it('should parse a field with options and default value', () => {
      const field = new protobuf.Field('count', 2, 'int32');
      field.options = { deprecated: true };
      field.defaultValue = 42;
      field.repeated = true;

      const parsed = protoParser.parseField(field);

      expect(parsed).toEqual({
        name: 'count',
        type: 'int32',
        number: 2,
        rule: 'repeated',
        defaultValue: 42,
        options: { deprecated: true },
        oneofIndex: undefined,
      });
    });

    it('should handle field in oneof', () => {
      // Create a proper oneof structure using protobufjs API
      const oneof = new protobuf.OneOf('choice');
      const field = new protobuf.Field('option1', 1, 'string');

      // Add field to oneof - this sets up the partOf relationship correctly
      oneof.add(field);

      const parsed = protoParser.parseField(field);
      expect(parsed.oneofIndex).toBe(0);
    });
  });

  describe('parseEnumValue', () => {
    it('should parse enum value correctly', () => {
      const enumObj = new protobuf.Enum('TestEnum');
      enumObj.add('VALUE1', 0);
      enumObj.add('VALUE2', 1);
      enumObj.valuesOptions = {
        VALUE1: { deprecated: true },
      };

      const parsed1 = protoParser.parseEnumValue('VALUE1', enumObj);
      expect(parsed1).toEqual({
        name: 'VALUE1',
        number: 0,
        options: { deprecated: true },
      });

      const parsed2 = protoParser.parseEnumValue('VALUE2', enumObj);
      expect(parsed2).toEqual({
        name: 'VALUE2',
        number: 1,
        options: {},
      });
    });
  });

  describe('parseEnum', () => {
    it('should parse enum with namespace', () => {
      const enumObj = new protobuf.Enum('Status');
      enumObj.add('UNKNOWN', 0);
      enumObj.add('ACTIVE', 1);
      enumObj.add('INACTIVE', 2);
      enumObj.options = { allow_alias: true };

      const parsed = protoParser.parseEnum(enumObj, 'api.v1');

      expect(parsed).toEqual({
        name: 'Status',
        namespace: 'api.v1',
        values: [
          { name: 'UNKNOWN', number: 0, options: {} },
          { name: 'ACTIVE', number: 1, options: {} },
          { name: 'INACTIVE', number: 2, options: {} },
        ],
        options: { allow_alias: true },
      });
    });
  });

  describe('parseOneof', () => {
    it('should parse oneof group', () => {
      const oneof = new protobuf.OneOf('choice');
      const field1 = new protobuf.Field('option1', 1, 'string');
      const field2 = new protobuf.Field('option2', 2, 'int32');
      oneof.add(field1);
      oneof.add(field2);

      const parsed = protoParser.parseOneof(oneof);

      expect(parsed).toEqual({
        name: 'choice',
        fieldNames: ['option1', 'option2'],
      });
    });
  });

  describe('parseMessage', () => {
    it('should parse simple message', () => {
      const messageType = new protobuf.Type('User');
      messageType.add(new protobuf.Field('id', 1, 'string'));
      messageType.add(new protobuf.Field('name', 2, 'string'));

      const parsed = protoParser.parseMessage(messageType, 'api.v1');

      expect(parsed.name).toBe('User');
      expect(parsed.namespace).toBe('api.v1');
      expect(parsed.fields).toHaveLength(2);
      expect(parsed.fields![0].name).toBe('id');
      expect(parsed.fields![1].name).toBe('name');
    });

    it('should parse message with nested types', () => {
      const messageType = new protobuf.Type('Parent');
      messageType.add(new protobuf.Field('id', 1, 'string'));

      // Add nested message
      const nestedMessage = new protobuf.Type('Child');
      nestedMessage.add(new protobuf.Field('value', 1, 'int32'));
      messageType.add(nestedMessage);

      // Add nested enum
      const nestedEnum = new protobuf.Enum('Status');
      nestedEnum.add('UNKNOWN', 0);
      nestedEnum.add('ACTIVE', 1);
      messageType.add(nestedEnum);

      const parsed = protoParser.parseMessage(messageType, 'api.v1');

      expect(parsed.name).toBe('Parent');
      expect(parsed.nestedMessages).toHaveLength(1);
      expect(parsed.nestedMessages![0].name).toBe('Child');
      expect(parsed.nestedMessages![0].namespace).toBe('api.v1.Parent');
      expect(parsed.nestedEnums).toHaveLength(1);
      expect(parsed.nestedEnums![0].name).toBe('Status');
    });

    it('should parse message with extensions', () => {
      const root = new protobuf.Root();
      const namespace = root.define('api.v1');
      const messageType = new protobuf.Type('ExtendableMessage');
      messageType.add(new protobuf.Field('base_field', 1, 'string'));
      namespace.add(messageType);

      // Set extensions directly since it's a property we control
      messageType.extensions = [['extension_field', 100, 'string']];

      const parsed = protoParser.parseMessage(messageType, 'api.v1');

      expect(parsed.extensions).toHaveLength(1);
      expect(parsed.extensions![0]).toEqual({
        name: 'extension_field',
        type: 'string',
        extend: '.api.v1.ExtendableMessage', // protobufjs includes leading dot
        number: 100,
      });
    });

    it('should handle message with oneofs', () => {
      const messageType = new protobuf.Type('Request');
      const oneof = new protobuf.OneOf('payload');
      const field1 = new protobuf.Field('text', 1, 'string');
      const field2 = new protobuf.Field('binary', 2, 'bytes');
      oneof.add(field1);
      oneof.add(field2);
      messageType.add(oneof);

      const parsed = protoParser.parseMessage(messageType, '');

      expect(parsed.oneofs).toHaveLength(1);
      expect(parsed.oneofs![0]).toEqual({
        name: 'payload',
        fieldNames: ['text', 'binary'],
      });
    });
  });

  describe('parseServiceMethod', () => {
    it('should parse simple RPC method', () => {
      const method = new protobuf.Method('GetUser', 'rpc', 'GetUserRequest', 'GetUserResponse');
      const parsed = protoParser.parseServiceMethod(method);

      expect(parsed).toEqual({
        name: 'GetUser',
        requestType: 'GetUserRequest',
        responseType: 'GetUserResponse',
        requestStream: false,
        responseStream: false,
        options: {},
      });
    });

    it('should parse streaming RPC methods', () => {
      const method = new protobuf.Method('Subscribe', 'rpc', 'SubscribeRequest', 'Event');
      method.requestStream = true;
      method.responseStream = true;
      method.options = { deprecated: true };

      const parsed = protoParser.parseServiceMethod(method);

      expect(parsed).toEqual({
        name: 'Subscribe',
        requestType: 'SubscribeRequest',
        responseType: 'Event',
        requestStream: true,
        responseStream: true,
        options: { deprecated: true },
      });
    });
  });

  describe('parseService', () => {
    it('should parse service with methods', () => {
      const service = new protobuf.Service('UserService');
      service.add(new protobuf.Method('GetUser', 'rpc', 'GetUserRequest', 'GetUserResponse'));
      service.add(new protobuf.Method('ListUsers', 'rpc', 'ListUsersRequest', 'ListUsersResponse'));

      const parsed = protoParser.parseService(service, 'api.v1');

      expect(parsed).toEqual({
        name: 'UserService',
        namespace: 'api.v1',
        methods: [
          {
            name: 'GetUser',
            requestType: 'GetUserRequest',
            responseType: 'GetUserResponse',
            requestStream: false,
            responseStream: false,
            options: {},
          },
          {
            name: 'ListUsers',
            requestType: 'ListUsersRequest',
            responseType: 'ListUsersResponse',
            requestStream: false,
            responseStream: false,
            options: {},
          },
        ],
      });
    });
  });

  describe('joinNamespace', () => {
    it('should join namespace parts with dots', () => {
      expect(joinNamespace('api', 'v1', 'user')).toBe('api.v1.user');
    });

    it('should filter out empty parts', () => {
      expect(joinNamespace('api', '', 'v1')).toBe('api.v1');
      expect(joinNamespace('', 'api', '')).toBe('api');
    });

    it('should handle single part', () => {
      expect(joinNamespace('api')).toBe('api');
    });

    it('should return empty string for no parts', () => {
      expect(joinNamespace()).toBe('');
      expect(joinNamespace('')).toBe('');
    });
  });
});
