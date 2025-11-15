import { ProtoSet } from './ProtoSet';
import { parseProtoDirectory, parseProtoDirectorySync } from './parser';
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

describe('parseProtoDirectorySync', () => {
  it('should synchronously parse all proto files in fixtures/api directory', () => {
    const protoSet = parseProtoDirectorySync('./fixtures/api');

    expect(protoSet.size()).toBeGreaterThan(0);

    // Check that we have some expected files
    const fileNames = protoSet.getProtos().map(p => p.file);
    expect(fileNames).toContain('errors.proto');
    expect(fileNames).toContain('types.proto');

    // Verify we have messages
    const stats = protoSet.getStats();
    expect(stats.messages).toBeGreaterThan(0);
  });

  it('should handle non-recursive parsing synchronously', () => {
    const protoSet = parseProtoDirectorySync('./fixtures/examples', { recursive: false });

    // Should only find files directly in fixtures/examples, not in subdirectories
    const fileNames = protoSet.getProtos().map(p => p.file);
    expect(fileNames).toContain('nested_structures.proto');

    // Should not contain files from subdirectories
    expect(fileNames).not.toContain('user.proto');
  });

  it('should throw error for non-existent directory synchronously', () => {
    expect(() => parseProtoDirectorySync('./non-existent')).toThrow('Directory not found');
  });

  it('should return empty ProtoSet for directory with no proto files synchronously', () => {
    const protoSet = parseProtoDirectorySync('./src');
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

  describe('fromSync() synchronous method', () => {
    it('should create ProtoSet from multiple proto content strings', () => {
      const protoSet = ProtoSet.fromSync(protoContent1, protoContent2);

      expect(protoSet.size()).toBe(2);
      const messages = protoSet.getAllMessages();
      expect(messages.map(m => m.name)).toContain('TestMessage1');
      expect(messages.map(m => m.name)).toContain('Request');
      expect(messages.map(m => m.name)).toContain('Response');
    });

    it('should create ProtoSet from file paths', () => {
      const protoSet = ProtoSet.fromSync(
        './fixtures/api/common/v1/errors.proto',
        './fixtures/api/common/v1/types.proto',
      );

      expect(protoSet.size()).toBe(2);
      expect(protoSet.getProtoByFile('errors.proto')).toBeDefined();
      expect(protoSet.getProtoByFile('types.proto')).toBeDefined();
    });

    it('should create ProtoSet from mixed file paths and content', () => {
      const protoSet = ProtoSet.fromSync('./fixtures/api/common/v1/errors.proto', protoContent1);

      expect(protoSet.size()).toBe(2);
      const messages = protoSet.getAllMessages();
      expect(messages.some(m => m.name === 'TestMessage1')).toBe(true);
    });

    it('should accept ParseOptions as last argument', () => {
      const protoSet = ProtoSet.fromSync(protoContent1, protoContent2, { keepCase: false });

      expect(protoSet.size()).toBe(2);
    });

    it('should handle empty input list', () => {
      const protoSet = ProtoSet.fromSync();
      expect(protoSet.isEmpty()).toBe(true);
    });

    it('should continue parsing valid inputs when some fail', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const protoSet = ProtoSet.fromSync('./non-existent-file.proto', protoContent1, 'invalid proto content');

      expect(protoSet.size()).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error when all inputs fail to parse', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(() => ProtoSet.fromSync('./non-existent-file.proto', 'invalid proto content')).toThrow(
        'Failed to parse any of the provided inputs',
      );

      consoleSpy.mockRestore();
    });
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
});
