import path from 'path';

import { parseFileDescriptorSet, parseFileDescriptorSetSync } from './descriptorParser';
import { FileDescriptorSetParseOptions } from './types';

describe('descriptorParser', () => {
  describe('parseFileDescriptorSet', () => {
    it('should parse a simple FileDescriptorSet object', async () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'test.proto',
              package: 'test',
              syntax: 'proto3',
              messageType: [
                {
                  name: 'TestMessage',
                  field: [
                    {
                      name: 'id',
                      number: 1,
                      label: 1, // LABEL_OPTIONAL
                      type: 5, // TYPE_INT32
                    },
                    {
                      name: 'name',
                      number: 2,
                      label: 1, // LABEL_OPTIONAL
                      type: 9, // TYPE_STRING
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const protos = await parseFileDescriptorSet(descriptorSet);

      expect(protos).toHaveLength(1);
      expect(protos[0].file).toBe('test.proto');
      expect(protos[0].messages).toHaveLength(1);
      expect(protos[0].messages![0].name).toBe('TestMessage');
      expect(protos[0].messages![0].namespace).toBe('test');
      expect(protos[0].messages![0].fields).toHaveLength(2);
      expect(protos[0].messages![0].fields![0].name).toBe('id');
      expect(protos[0].messages![0].fields![0].type).toBe('int32');
      expect(protos[0].messages![0].fields![0].number).toBe(1);
    });

    it('should parse enum types', async () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'enum.proto',
              package: 'test',
              enumType: [
                {
                  name: 'Status',
                  value: [
                    { name: 'UNKNOWN', number: 0 },
                    { name: 'ACTIVE', number: 1 },
                    { name: 'INACTIVE', number: 2 },
                  ],
                },
              ],
            },
          ],
        },
      };

      const protos = await parseFileDescriptorSet(descriptorSet);

      expect(protos).toHaveLength(1);
      expect(protos[0].enums).toHaveLength(1);
      expect(protos[0].enums![0].name).toBe('Status');
      expect(protos[0].enums![0].values).toHaveLength(3);
      expect(protos[0].enums![0].values[0]).toEqual({
        name: 'UNKNOWN',
        number: 0,
        options: {},
      });
    });

    it('should parse service types', async () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'service.proto',
              package: 'test',
              service: [
                {
                  name: 'TestService',
                  method: [
                    {
                      name: 'GetTest',
                      inputType: '.test.GetTestRequest',
                      outputType: '.test.GetTestResponse',
                      clientStreaming: false,
                      serverStreaming: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const protos = await parseFileDescriptorSet(descriptorSet);

      expect(protos).toHaveLength(1);
      expect(protos[0].services).toHaveLength(1);
      expect(protos[0].services![0].name).toBe('TestService');
      expect(protos[0].services![0].methods).toHaveLength(1);
      expect(protos[0].services![0].methods![0]).toEqual({
        name: 'GetTest',
        requestType: '.test.GetTestRequest',
        responseType: '.test.GetTestResponse',
        requestStream: false,
        responseStream: false,
        options: {},
      });
    });

    it('should generate correct IDL', async () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'example.proto',
              package: 'example',
              syntax: 'proto3',
              dependency: ['google/protobuf/timestamp.proto'],
              messageType: [
                {
                  name: 'User',
                  field: [
                    {
                      name: 'id',
                      number: 1,
                      label: 1, // LABEL_OPTIONAL
                      type: 3, // TYPE_INT64
                    },
                    {
                      name: 'email',
                      number: 2,
                      label: 1, // LABEL_OPTIONAL
                      type: 9, // TYPE_STRING
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const protos = await parseFileDescriptorSet(descriptorSet, { generateImports: true });

      expect(protos[0].idl).toContain('syntax = "proto3";');
      expect(protos[0].idl).toContain('package example;');
      expect(protos[0].idl).toContain('message User {');
      expect(protos[0].idl).toContain('int64 id = 1;');
      expect(protos[0].idl).toContain('string email = 2;');
    });

    it('should handle nested messages and enums', async () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'nested.proto',
              package: 'test',
              messageType: [
                {
                  name: 'Outer',
                  field: [
                    {
                      name: 'inner_field',
                      number: 1,
                      label: 1, // LABEL_OPTIONAL
                      type: 11, // TYPE_MESSAGE
                      typeName: '.test.Outer.Inner',
                    },
                  ],
                  nestedType: [
                    {
                      name: 'Inner',
                      field: [
                        {
                          name: 'value',
                          number: 1,
                          label: 1, // LABEL_OPTIONAL
                          type: 9, // TYPE_STRING
                        },
                      ],
                    },
                  ],
                  enumType: [
                    {
                      name: 'State',
                      value: [
                        { name: 'PENDING', number: 0 },
                        { name: 'COMPLETED', number: 1 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const protos = await parseFileDescriptorSet(descriptorSet);

      expect(protos[0].messages).toHaveLength(1);
      expect(protos[0].messages![0].nestedMessages).toHaveLength(1);
      expect(protos[0].messages![0].nestedEnums).toHaveLength(1);
      expect(protos[0].messages![0].nestedMessages![0].name).toBe('Inner');
      expect(protos[0].messages![0].nestedEnums![0].name).toBe('State');
    });

    it('should handle file path input', async () => {
      const filePath = path.join(process.cwd(), 'fixtures', 'bufvalidate.proto.json');

      // This should work with the actual file
      const protos = await parseFileDescriptorSet(filePath);
      expect(protos.length).toBeGreaterThan(0);
      expect(protos.some(p => p.file.includes('validate'))).toBe(true);
    });

    it('should throw error for invalid FileDescriptorSet', async () => {
      const invalidDescriptorSet = {
        fileDescriptorSet: {
          file: [],
        },
      };

      await expect(parseFileDescriptorSet(invalidDescriptorSet)).rejects.toThrow(
        'FileDescriptorSet contains no file descriptors',
      );
    });

    it('should throw error for missing fileDescriptorSet property', async () => {
      const invalidInput = {
        someOtherProperty: 'value',
      };

      // Type assertion to bypass TypeScript checking for test purposes
      await expect(parseFileDescriptorSet(invalidInput as any)).rejects.toThrow();
    });
  });

  describe('parseFileDescriptorSetSync', () => {
    it('should work synchronously', () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'sync.proto',
              package: 'sync',
              messageType: [
                {
                  name: 'SyncMessage',
                  field: [
                    {
                      name: 'data',
                      number: 1,
                      label: 1, // LABEL_OPTIONAL
                      type: 9, // TYPE_STRING
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const protos = parseFileDescriptorSetSync(descriptorSet);

      expect(protos).toHaveLength(1);
      expect(protos[0].messages![0].name).toBe('SyncMessage');
    });
  });

  describe('options handling', () => {
    it('should use default syntax when not specified', async () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'no-syntax.proto',
              messageType: [
                {
                  name: 'Test',
                  field: [],
                },
              ],
            },
          ],
        },
      };

      const options: FileDescriptorSetParseOptions = {
        defaultSyntax: 'proto2',
      };

      const protos = await parseFileDescriptorSet(descriptorSet, options);

      expect(protos[0].idl).toContain('syntax = "proto2";');
    });

    it('should optionally skip import generation', async () => {
      const descriptorSet = {
        fileDescriptorSet: {
          file: [
            {
              name: 'no-imports.proto',
              dependency: ['google/protobuf/timestamp.proto'],
              messageType: [
                {
                  name: 'Test',
                  field: [],
                },
              ],
            },
          ],
        },
      };

      const options: FileDescriptorSetParseOptions = {
        generateImports: false,
      };

      const protos = await parseFileDescriptorSet(descriptorSet, options);

      expect(protos[0].idl).not.toContain('import');
    });
  });
});
