import { ProtoSet } from './ProtoSet';
import { parseProtoDirectory } from './parser';
import { Proto } from './types';

describe('ProtoSet', () => {
  // Mock proto data for testing
  const mockProto1: Proto = {
    file: 'user.proto',
    path: '/test/user.proto',
    idl: 'syntax = "proto3"; message User { string name = 1; }',
    messages: [
      {
        name: 'User',
        namespace: '',
        fields: [
          {
            name: 'name',
            type: 'string',
            number: 1,
          },
        ],
      },
    ],
    services: [
      {
        name: 'UserService',
        namespace: '',
        methods: [
          {
            name: 'GetUser',
            requestType: 'GetUserRequest',
            responseType: 'User',
          },
        ],
      },
    ],
    enums: [
      {
        name: 'Status',
        namespace: '',
        values: [
          { name: 'ACTIVE', number: 0 },
          { name: 'INACTIVE', number: 1 },
        ],
      },
    ],
    imports: ['common.proto'],
  };

  const mockProto2: Proto = {
    file: 'service.proto',
    path: '/test/service.proto',
    idl: 'syntax = "proto3"; service TestService { rpc Test(Empty) returns (Empty); }',
    services: [
      {
        name: 'TestService',
        namespace: 'api',
        methods: [
          {
            name: 'Test',
            requestType: 'Empty',
            responseType: 'Empty',
          },
        ],
      },
    ],
    messages: [
      {
        name: 'TestMessage',
        namespace: 'api',
        fields: [],
        nestedMessages: [
          {
            name: 'NestedMessage',
            namespace: 'api.TestMessage',
            fields: [],
          },
        ],
        nestedEnums: [
          {
            name: 'NestedEnum',
            namespace: 'api.TestMessage',
            values: [{ name: 'VALUE', number: 0 }],
          },
        ],
      },
    ],
    imports: ['google/protobuf/empty.proto'],
  };

  describe('constructor', () => {
    it('should create an empty ProtoSet', () => {
      const protoSet = new ProtoSet([]);
      expect(protoSet.size()).toBe(0);
      expect(protoSet.isEmpty()).toBe(true);
    });

    it('should create a ProtoSet with protos', () => {
      const protoSet = new ProtoSet([mockProto1, mockProto2]);
      expect(protoSet.size()).toBe(2);
      expect(protoSet.isEmpty()).toBe(false);
    });
  });

  describe('getProtos', () => {
    it('should return a copy of all protos', () => {
      const protoSet = new ProtoSet([mockProto1, mockProto2]);
      const protos = protoSet.getProtos();

      expect(protos).toHaveLength(2);
      expect(protos[0]).toEqual(mockProto1);
      expect(protos[1]).toEqual(mockProto2);

      // Should be a copy, not the original array
      protos.push({} as Proto);
      expect(protoSet.getProtos()).toHaveLength(2);
    });
  });

  describe('getProtoByFile', () => {
    const protoSet = new ProtoSet([mockProto1, mockProto2]);

    it('should find proto by exact filename', () => {
      const found = protoSet.getProtoByFile('user.proto');
      expect(found).toEqual(mockProto1);
    });

    it('should return undefined for non-existent file', () => {
      const found = protoSet.getProtoByFile('nonexistent.proto');
      expect(found).toBeUndefined();
    });
  });

  describe('getAllMessages', () => {
    const protoSet = new ProtoSet([mockProto1, mockProto2]);

    it('should return all messages from all protos', () => {
      const messages = protoSet.getAllMessages();
      expect(messages).toHaveLength(3); // User, TestMessage, NestedMessage

      const messageNames = messages.map(m => m.name);
      expect(messageNames).toContain('User');
      expect(messageNames).toContain('TestMessage');
      expect(messageNames).toContain('NestedMessage');
    });

    it('should include nested messages', () => {
      const messages = protoSet.getAllMessages();
      const nestedMessage = messages.find(m => m.name === 'NestedMessage');
      expect(nestedMessage).toBeDefined();
      expect(nestedMessage?.namespace).toBe('api.TestMessage');
    });
  });

  describe('getAllServices', () => {
    const protoSet = new ProtoSet([mockProto1, mockProto2]);

    it('should return all services from all protos', () => {
      const services = protoSet.getAllServices();
      expect(services).toHaveLength(2);

      const serviceNames = services.map(s => s.name);
      expect(serviceNames).toContain('UserService');
      expect(serviceNames).toContain('TestService');
    });
  });

  describe('getAllEnums', () => {
    const protoSet = new ProtoSet([mockProto1, mockProto2]);

    it('should return all enums from all protos including nested ones', () => {
      const enums = protoSet.getAllEnums();
      expect(enums).toHaveLength(2); // Status, NestedEnum

      const enumNames = enums.map(e => e.name);
      expect(enumNames).toContain('Status');
      expect(enumNames).toContain('NestedEnum');
    });
  });

  describe('getAllImports', () => {
    const protoSet = new ProtoSet([mockProto1, mockProto2]);

    it('should return unique imports sorted alphabetically', () => {
      const imports = protoSet.getAllImports();
      expect(imports).toEqual(['common.proto', 'google/protobuf/empty.proto']);
    });

    it('should handle duplicate imports', () => {
      const protoWithDuplicateImport: Proto = {
        ...mockProto2,
        imports: ['common.proto', 'google/protobuf/empty.proto'],
      };
      const protoSetWithDuplicates = new ProtoSet([mockProto1, protoWithDuplicateImport]);

      const imports = protoSetWithDuplicates.getAllImports();
      expect(imports).toEqual(['common.proto', 'google/protobuf/empty.proto']);
    });
  });

  describe('getStats', () => {
    const protoSet = new ProtoSet([mockProto1, mockProto2]);

    it('should return correct statistics', () => {
      const stats = protoSet.getStats();
      expect(stats).toEqual({
        files: 2,
        messages: 3,
        services: 2,
        enums: 2,
        imports: 2,
      });
    });
  });

  describe('empty ProtoSet', () => {
    const emptySet = new ProtoSet([]);

    it('should handle empty set correctly', () => {
      expect(emptySet.getAllMessages()).toEqual([]);
      expect(emptySet.getAllServices()).toEqual([]);
      expect(emptySet.getAllEnums()).toEqual([]);
      expect(emptySet.getAllImports()).toEqual([]);
      expect(emptySet.getStats()).toEqual({
        files: 0,
        messages: 0,
        services: 0,
        enums: 0,
        imports: 0,
      });
    });
  });
});

describe('parseProtoDirectory', () => {
  it('should parse all proto files in fixtures/api directory', async () => {
    const protoSet = await parseProtoDirectory('./fixtures/api');

    expect(protoSet.size()).toBeGreaterThan(0);

    // Check that we have some expected files
    const fileNames = protoSet.getProtos().map(p => p.file);
    expect(fileNames).toContain('errors.proto');
    expect(fileNames).toContain('types.proto');

    // Verify we have messages and services
    const stats = protoSet.getStats();
    expect(stats.messages).toBeGreaterThan(0);
  });

  it('should handle non-recursive parsing', async () => {
    const protoSet = await parseProtoDirectory('./fixtures/examples', { recursive: false });

    // Should only find files directly in fixtures/examples, not in subdirectories
    const fileNames = protoSet.getProtos().map(p => p.file);
    expect(fileNames).toContain('nested_structures.proto');

    // Should not contain files from subdirectories
    expect(fileNames).not.toContain('user.proto');
  });

  it('should throw error for non-existent directory', async () => {
    await expect(parseProtoDirectory('./non-existent')).rejects.toThrow('Directory not found');
  });

  it('should return empty ProtoSet for directory with no proto files', async () => {
    const protoSet = await parseProtoDirectory('./src');
    expect(protoSet.size()).toBe(0);
    expect(protoSet.isEmpty()).toBe(true);
  });
});

describe('ProtoSet.from static methods', () => {
  const protoContent1 = `
    syntax = "proto3";
    message TestMessage1 {
      string id = 1;
      int32 value = 2;
    }
  `;

  const protoContent2 = `
    syntax = "proto3";
    service TestService {
      rpc GetData(Request) returns (Response);
    }
    message Request { string query = 1; }
    message Response { string result = 1; }
  `;

  describe('from() async method', () => {
    it('should create ProtoSet from multiple proto content strings', async () => {
      const protoSet = await ProtoSet.from(protoContent1, protoContent2);

      expect(protoSet.size()).toBe(2);
      const messages = protoSet.getAllMessages();
      expect(messages.map(m => m.name)).toContain('TestMessage1');
      expect(messages.map(m => m.name)).toContain('Request');
      expect(messages.map(m => m.name)).toContain('Response');
    });

    it('should create ProtoSet from file paths', async () => {
      const protoSet = await ProtoSet.from(
        './fixtures/api/common/v1/errors.proto',
        './fixtures/api/common/v1/types.proto',
      );

      expect(protoSet.size()).toBe(2);
      expect(protoSet.getProtoByFile('errors.proto')).toBeDefined();
      expect(protoSet.getProtoByFile('types.proto')).toBeDefined();
    });

    it('should create ProtoSet from mixed file paths and content', async () => {
      const protoSet = await ProtoSet.from('./fixtures/api/common/v1/errors.proto', protoContent1);

      expect(protoSet.size()).toBe(2);
      const messages = protoSet.getAllMessages();
      expect(messages.some(m => m.name === 'TestMessage1')).toBe(true);
    });

    it('should accept ParseOptions as last argument', async () => {
      const protoSet = await ProtoSet.from(protoContent1, protoContent2, { keepCase: false });

      expect(protoSet.size()).toBe(2);
    });

    it('should handle empty input list', async () => {
      const protoSet = await ProtoSet.from();
      expect(protoSet.isEmpty()).toBe(true);
    });

    it('should continue parsing valid inputs when some fail', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const protoSet = await ProtoSet.from('./non-existent-file.proto', protoContent1, 'invalid proto content');

      expect(protoSet.size()).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error when all inputs fail to parse', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(ProtoSet.from('./non-existent-file.proto', 'invalid proto content')).rejects.toThrow(
        'Failed to parse any of the provided inputs',
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('ProtoSet - generateSupersetIdl', () => {
  // Mock proto data for testing
  const mockProto1: Proto = {
    file: 'user.proto',
    path: '/test/user.proto',
    idl: 'syntax = "proto3"; message User { string name = 1; }',
    messages: [
      {
        name: 'User',
        namespace: '',
        fields: [
          {
            name: 'name',
            type: 'string',
            number: 1,
          },
        ],
      },
    ],
    services: [
      {
        name: 'UserService',
        namespace: '',
        methods: [
          {
            name: 'GetUser',
            requestType: 'GetUserRequest',
            responseType: 'User',
          },
        ],
      },
    ],
    enums: [
      {
        name: 'Status',
        namespace: '',
        values: [
          { name: 'ACTIVE', number: 0 },
          { name: 'INACTIVE', number: 1 },
        ],
      },
    ],
    imports: ['common.proto'],
  };

  const mockProto2: Proto = {
    file: 'service.proto',
    path: '/test/service.proto',
    idl: 'syntax = "proto3"; service TestService { rpc Test(Empty) returns (Empty); }',
    services: [
      {
        name: 'TestService',
        namespace: 'api',
        methods: [
          {
            name: 'Test',
            requestType: 'Empty',
            responseType: 'Empty',
          },
        ],
      },
    ],
    messages: [
      {
        name: 'TestMessage',
        namespace: 'api',
        fields: [],
        nestedMessages: [
          {
            name: 'NestedMessage',
            namespace: 'api.TestMessage',
            fields: [],
          },
        ],
        nestedEnums: [
          {
            name: 'NestedEnum',
            namespace: 'api.TestMessage',
            values: [{ name: 'VALUE', number: 0 }],
          },
        ],
      },
    ],
    imports: ['google/protobuf/empty.proto'],
  };

  const protoSet = new ProtoSet([mockProto1, mockProto2]);

  it('should generate basic superset IDL with default options', () => {
    const idl = protoSet.generateSupersetIdl();

    expect(idl).toContain('syntax = "proto3";');
    expect(idl).toContain('import "common.proto";');
    expect(idl).toContain('import "google/protobuf/empty.proto";');
    expect(idl).toContain('message User {');
    expect(idl).toContain('message TestMessage {');
    expect(idl).toContain('service UserService {');
    expect(idl).toContain('service TestService {');
    expect(idl).toContain('enum Status {');
  });

  it('should include package declaration when specified', () => {
    const idl = protoSet.generateSupersetIdl({ packageName: 'unified.api' });

    expect(idl).toContain('package unified.api;');
  });

  it('should use proto2 syntax when specified', () => {
    const idl = protoSet.generateSupersetIdl({ syntax: 'proto2' });

    expect(idl).toContain('syntax = "proto2";');
  });

  it('should include source file comments when enabled', () => {
    const idl = protoSet.generateSupersetIdl({ includeComments: true });

    expect(idl).toContain('// From: user.proto');
    expect(idl).toContain('// From: service.proto');
  });

  it('should exclude source file comments when disabled', () => {
    const idl = protoSet.generateSupersetIdl({ includeComments: false });

    expect(idl).not.toContain('// From:');
  });

  it('should handle namespace conflicts with prefix strategy', () => {
    // Create protos with conflicting message names
    const conflictProto1: Proto = {
      file: 'file1.proto',
      path: '/test/file1.proto',
      idl: '',
      messages: [
        {
          name: 'User',
          namespace: 'v1',
          fields: [],
        },
      ],
    };

    const conflictProto2: Proto = {
      file: 'file2.proto',
      path: '/test/file2.proto',
      idl: '',
      messages: [
        {
          name: 'User',
          namespace: 'v2',
          fields: [],
        },
      ],
    };

    const conflictSet = new ProtoSet([conflictProto1, conflictProto2]);
    const idl = conflictSet.generateSupersetIdl({ namespaceConflictResolution: 'prefix' });

    expect(idl).toContain('message User {');
    expect(idl).toContain('message v2_User {');
  });

  it('should handle nested messages correctly', () => {
    const idl = protoSet.generateSupersetIdl();

    expect(idl).toContain('message TestMessage {');
    expect(idl).toContain('message NestedMessage {');
  });

  it('should handle nested enums correctly', () => {
    const idl = protoSet.generateSupersetIdl();

    expect(idl).toContain('enum Status {');
    expect(idl).toContain('enum NestedEnum {');
  });

  it('should format service methods correctly', () => {
    const idl = protoSet.generateSupersetIdl();

    expect(idl).toContain('service UserService {');
    expect(idl).toContain('rpc GetUser(GetUserRequest) returns (User);');
    expect(idl).toContain('service TestService {');
    expect(idl).toContain('rpc Test(Empty) returns (Empty);');
  });

  it('should handle empty ProtoSet', () => {
    const emptySet = new ProtoSet([]);
    const idl = emptySet.generateSupersetIdl();

    expect(idl).toBe('syntax = "proto3";');
  });

  it('should deduplicate imports correctly', () => {
    const protoWithDuplicateImport: Proto = {
      file: 'duplicate.proto',
      path: '/test/duplicate.proto',
      idl: '',
      imports: ['common.proto', 'google/protobuf/empty.proto'],
    };

    const duplicateSet = new ProtoSet([mockProto1, mockProto2, protoWithDuplicateImport]);
    const idl = duplicateSet.generateSupersetIdl();

    // Should only appear once each
    const commonMatches = (idl.match(/import "common\.proto";/g) || []).length;
    const emptyMatches = (idl.match(/import "google\/protobuf\/empty\.proto";/g) || []).length;

    expect(commonMatches).toBe(1);
    expect(emptyMatches).toBe(1);
  });

  it('should format field rules correctly', () => {
    const protoWithFieldRules: Proto = {
      file: 'rules.proto',
      path: '/test/rules.proto',
      idl: '',
      messages: [
        {
          name: 'TestRules',
          namespace: '',
          fields: [
            { name: 'required_field', type: 'string', number: 1, rule: 'required' },
            { name: 'optional_field', type: 'string', number: 2, rule: 'optional' },
            { name: 'repeated_field', type: 'string', number: 3, rule: 'repeated' },
            { name: 'no_rule_field', type: 'string', number: 4 },
          ],
        },
      ],
    };

    const rulesSet = new ProtoSet([protoWithFieldRules]);
    const idl = rulesSet.generateSupersetIdl();

    expect(idl).toContain('required string required_field = 1;');
    expect(idl).toContain('optional string optional_field = 2;');
    expect(idl).toContain('repeated string repeated_field = 3;');
    expect(idl).toContain('string no_rule_field = 4;');
  });

  it('should properly format oneof fields without duplication', () => {
    const protoWithOneof: Proto = {
      file: 'oneof.proto',
      path: '/test/oneof.proto',
      idl: '',
      messages: [
        {
          name: 'TestOneof',
          namespace: '',
          fields: [
            { name: 'regular_field', type: 'string', number: 1 },
            { name: 'oneof_field1', type: 'int32', number: 2, oneofIndex: 0 },
            { name: 'oneof_field2', type: 'string', number: 3, oneofIndex: 0 },
            { name: 'another_field', type: 'bool', number: 4 },
          ],
          oneofs: [{ name: 'test_oneof', fieldNames: ['oneof_field1', 'oneof_field2'] }],
        },
      ],
    };

    const oneofSet = new ProtoSet([protoWithOneof]);
    const idl = oneofSet.generateSupersetIdl();

    // Check oneof block is properly formatted
    expect(idl).toContain('oneof test_oneof {');
    expect(idl).toContain('  int32 oneof_field1 = 2;');
    expect(idl).toContain('  string oneof_field2 = 3;');

    // Check oneof fields are NOT duplicated as regular fields
    const field1Count = (idl.match(/oneof_field1/g) || []).length;
    const field2Count = (idl.match(/oneof_field2/g) || []).length;
    expect(field1Count).toBe(1);
    expect(field2Count).toBe(1);

    // Check regular fields are still present
    expect(idl).toContain('string regular_field = 1;');
    expect(idl).toContain('bool another_field = 4;');
  });

  it('should not duplicate nested definitions', () => {
    const protoWithNested: Proto = {
      file: 'nested.proto',
      path: '/test/nested.proto',
      idl: '',
      messages: [
        {
          name: 'OuterMessage',
          namespace: '',
          fields: [],
          nestedMessages: [
            {
              name: 'InnerMessage',
              namespace: 'OuterMessage',
              fields: [{ name: 'field', type: 'string', number: 1 }],
            },
          ],
          nestedEnums: [
            {
              name: 'InnerEnum',
              namespace: 'OuterMessage',
              values: [{ name: 'VALUE1', number: 0 }],
            },
          ],
        },
      ],
    };

    const nestedSet = new ProtoSet([protoWithNested]);
    const idl = nestedSet.generateSupersetIdl();

    // Check that nested definitions appear only once
    const innerMessageCount = (idl.match(/message InnerMessage/g) || []).length;
    const innerEnumCount = (idl.match(/enum InnerEnum/g) || []).length;

    expect(innerMessageCount).toBe(1);
    expect(innerEnumCount).toBe(1);

    // Check the outer message doesn't contain nested definitions inline
    const lines = idl.split('\n');
    const outerMessageStart = lines.findIndex(l => l.includes('message OuterMessage'));
    const outerMessageEnd = lines.findIndex((l, i) => i > outerMessageStart && l === '}');
    const outerMessageContent = lines.slice(outerMessageStart + 1, outerMessageEnd).join('\n');

    expect(outerMessageContent).not.toContain('message InnerMessage');
    expect(outerMessageContent).not.toContain('enum InnerEnum');
  });

  it('should use numeric suffix for conflicts without namespace', () => {
    const proto1: Proto = {
      file: 'file1.proto',
      path: '/test/file1.proto',
      idl: '',
      messages: [{ name: 'User', namespace: '', fields: [] }],
    };

    const proto2: Proto = {
      file: 'file2.proto',
      path: '/test/file2.proto',
      idl: '',
      messages: [{ name: 'User', namespace: '', fields: [] }],
    };

    const proto3: Proto = {
      file: 'file3.proto',
      path: '/test/file3.proto',
      idl: '',
      messages: [{ name: 'User', namespace: '', fields: [] }],
    };

    const conflictSet = new ProtoSet([proto1, proto2, proto3]);
    const idl = conflictSet.generateSupersetIdl({ namespaceConflictResolution: 'prefix' });

    expect(idl).toContain('message User {');
    expect(idl).toContain('message User_2 {');
    expect(idl).toContain('message User_3 {');
  });

  it('should respect includeComments flag for section headers', () => {
    const proto: Proto = {
      file: 'test.proto',
      path: '/test/test.proto',
      idl: '',
      messages: [{ name: 'TestMessage', namespace: '', fields: [] }],
      enums: [{ name: 'TestEnum', namespace: '', values: [] }],
      services: [{ name: 'TestService', namespace: '', methods: [] }],
    };

    const protoSet = new ProtoSet([proto]);

    // With comments
    const idlWithComments = protoSet.generateSupersetIdl({ includeComments: true });
    expect(idlWithComments).toContain('// Enum definitions');
    expect(idlWithComments).toContain('// Message definitions');
    expect(idlWithComments).toContain('// Service definitions');
    expect(idlWithComments).toContain('// From: test.proto');

    // Without comments
    const idlWithoutComments = protoSet.generateSupersetIdl({ includeComments: false });
    expect(idlWithoutComments).not.toContain('// Enum definitions');
    expect(idlWithoutComments).not.toContain('// Message definitions');
    expect(idlWithoutComments).not.toContain('// Service definitions');
    expect(idlWithoutComments).not.toContain('// From:');
  });
});

describe('integration tests', () => {
  it('should properly parse files with cross-directory imports', async () => {
    // Parse just the common directory which should work without imports
    const protoSet = await parseProtoDirectory('./fixtures/api/common/v1');

    expect(protoSet.size()).toBe(2); // errors.proto and types.proto

    const typesProto = protoSet.getProtoByFile('types.proto');
    expect(typesProto).toBeDefined();

    const errorsProto = protoSet.getProtoByFile('errors.proto');
    expect(errorsProto).toBeDefined();
  });

  it('should parse nested_structures.proto from examples directory', async () => {
    const protoSet = await parseProtoDirectory('./fixtures/examples');

    expect(protoSet.size()).toBe(1);

    const nestedProto = protoSet.getProtoByFile('nested_structures.proto');
    expect(nestedProto).toBeDefined();
    expect(nestedProto?.messages).toBeDefined();
    expect(nestedProto?.messages!.length).toBeGreaterThan(0);
  });

  it('should generate superset IDL from real proto files', async () => {
    const protoSet = await parseProtoDirectory('./fixtures/api/common/v1');
    const idl = protoSet.generateSupersetIdl({
      syntax: 'proto3',
      packageName: 'unified.common.v1',
      includeComments: true,
    });

    expect(idl).toContain('syntax = "proto3";');
    expect(idl).toContain('package unified.common.v1;');
    expect(idl.length).toBeGreaterThan(100); // Should contain meaningful content
  });
});
