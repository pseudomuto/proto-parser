# @pseudomutojs/proto-parser

[![NPM Version](https://img.shields.io/npm/v/@pseudomutojs/proto-parser.svg)](https://www.npmjs.com/package/@pseudomutojs/proto-parser)
[![License](https://img.shields.io/npm/l/@pseudomutojs/proto-parser.svg)](https://github.com/pseudomuto/proto-parser/blob/main/LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/pseudomuto/proto-parser/ci.yml?branch=main)](https://github.com/pseudomuto/proto-parser/actions)

A TypeScript library for parsing Protocol Buffer (.proto) files, extracting messages, services, enums, and other definitions from both file paths and proto content strings.

## Features

- 🔍 **Parse from files or strings** - Load proto definitions from file paths or raw content
- 📁 **Directory parsing** - Parse all .proto files in a directory recursively
- 🔄 **Async and sync APIs** - Choose between promise-based or blocking operations
- 🎯 **Complete parsing** - Extract messages, services, enums, oneofs, extensions, and nested structures
- 📦 **Import resolution** - Automatically resolve imports including Google Well-Known Types
- 🛡️ **Type-safe** - Full TypeScript support with comprehensive type definitions
- 📚 **ProtoSet collections** - Manage and query multiple proto files as a unified set
- ⚡ **Only 2 dependencies** - Built on `protobufjs` and `@grpc/proto-loader`

### Supported Features

- ✅ Protocol Buffer syntax v2 and v3
- ✅ Messages with all field types
- ✅ Services with streaming methods
- ✅ Enumerations
- ✅ Nested messages and enums
- ✅ OneOf fields
- ✅ Extensions
- ✅ Import statements
- ✅ Google Well-Known Types (WKT)
- ✅ Custom options
- ✅ Package namespaces

## Installation

```bash
npm install @pseudomutojs/proto-parser
```

## Quick Start

### Parse from File

```typescript
import { parseProto } from '@pseudomutojs/proto-parser';

const proto = await parseProto('./path/to/your/file.proto');

console.log('Services:', proto.services);
console.log('Messages:', proto.messages);
console.log('Enums:', proto.enums);
```

### Parse from String Content

```typescript
import { parseProto } from '@pseudomutojs/proto-parser';

const protoContent = `
  syntax = "proto3";
  
  package example;
  
  message User {
    int32 id = 1;
    string name = 2;
    string email = 3;
  }
  
  service UserService {
    rpc GetUser(GetUserRequest) returns (User);
  }
`;

const proto = await parseProto(protoContent);
```

### Synchronous Parsing

```typescript
import { parseProtoSync } from '@pseudomutojs/proto-parser';

const proto = parseProtoSync('./path/to/your/file.proto');
```

### Parse Directory

```typescript
import { parseProtoDirectory } from '@pseudomutojs/proto-parser';

// Parse all .proto files in a directory
const protoSet = await parseProtoDirectory('./protos');

console.log(`Parsed ${protoSet.size()} files`);
console.log('All messages:', protoSet.getAllMessages());
console.log('All services:', protoSet.getAllServices());
```

### Create ProtoSet from Multiple Sources

```typescript
import { ProtoSet } from '@pseudomutojs/proto-parser';

// Mix file paths and literal content
const protoSet = await ProtoSet.from(
  './user.proto',
  './service.proto',
  `syntax = "proto3";
   message Test { string id = 1; }`
);

// Access all definitions
const messages = protoSet.getAllMessages();
const services = protoSet.getAllServices();
```

## API Reference

### Main Functions

#### `parseProto(input, options?)`

Asynchronously parses a Protocol Buffer file or content string.

**Parameters:**

- `input` (string) - Either a file path to a .proto file or proto content string
- `options` (ParseOptions, optional) - Parsing configuration options

**Returns:** `Promise<Proto>` - A promise that resolves to a Proto object containing all parsed definitions

#### `parseProtoSync(input, options?)`

Synchronously parses a Protocol Buffer file or content string.

**Parameters:**

- `input` (string) - Either a file path to a .proto file or proto content string
- `options` (ParseOptions, optional) - Parsing configuration options

**Returns:** `Proto` - A Proto object containing all parsed definitions

#### `parseProtoDirectory(dirPath, options?)`

Asynchronously parses all Protocol Buffer files in a directory.

**Parameters:**

- `dirPath` (string) - Path to the directory containing .proto files
- `options` (DirectoryParseOptions, optional) - Directory parsing configuration options

**Returns:** `Promise<ProtoSet>` - A promise that resolves to a ProtoSet containing all parsed proto files

#### `parseProtoDirectorySync(dirPath, options?)`

Synchronously parses all Protocol Buffer files in a directory.

**Parameters:**

- `dirPath` (string) - Path to the directory containing .proto files
- `options` (DirectoryParseOptions, optional) - Directory parsing configuration options

**Returns:** `ProtoSet` - A ProtoSet containing all parsed proto files

### ProtoSet Class

A collection of parsed Protocol Buffer files with methods to query and aggregate definitions.

#### Static Methods

##### `ProtoSet.from(...inputs)`

Creates a ProtoSet from multiple file paths and/or proto content strings.

```typescript
// Async version
const protoSet = await ProtoSet.from(
  './user.proto',
  'syntax = "proto3"; message Test { string id = 1; }',
  { keepCase: false } // optional ParseOptions
);

// Sync version
const protoSet = ProtoSet.fromSync('./user.proto', './service.proto');
```

#### Instance Methods

- `getProtos()` - Returns all Proto objects in the set
- `getProtoByFile(filename)` - Find a proto by its filename
- `getAllMessages()` - Get all messages from all protos (including nested)
- `getAllServices()` - Get all services from all protos
- `getAllEnums()` - Get all enums from all protos (including nested)
- `getAllImports()` - Get unique imports across all protos
- `size()` - Returns the number of proto files in the set
- `isEmpty()` - Check if the set is empty
- `getStats()` - Get statistics about the proto set

### Configuration Options

```typescript
interface ParseOptions {
  /** Additional directories to search for imported proto files */
  includePaths?: string[];
  /** Whether to preserve field name casing (default: true) - when true, preserves snake_case; when false, converts to camelCase */
  keepCase?: boolean;
  /** Whether to include default values (default: true) */
  defaults?: boolean;
  /** Whether to include oneof definitions (default: true) */
  oneofs?: boolean;
}

interface DirectoryParseOptions extends ParseOptions {
  /** Whether to recursively search subdirectories for .proto files (default: true) */
  recursive?: boolean;
}
```

### Type Definitions

#### Proto

The main result object containing all parsed definitions:

```typescript
type Proto = {
  /** The filename of the proto file */
  file: string;
  /** The full path to the proto file */
  path: string;
  /** The raw IDL content of the proto file */
  idl: string;
  /** Array of service definitions found in the proto file */
  services?: Service[];
  /** Array of message definitions found in the proto file */
  messages?: Message[];
  /** Array of enum definitions found in the proto file */
  enums?: Enum[];
  /** Array of import statements found in the proto file */
  imports?: string[];
};
```

#### Service

gRPC service definition:

```typescript
type Service = {
  /** The name of the service */
  name: string;
  /** The namespace/package the service belongs to */
  namespace: string;
  /** Array of methods defined in this service */
  methods?: ServiceMethod[];
};
```

#### Message

Protocol Buffer message definition:

```typescript
type Message = {
  /** The name of the message */
  name: string;
  /** The namespace/package the message belongs to */
  namespace: string;
  /** Array of fields defined in this message */
  fields?: Field[];
  /** Array of nested message definitions */
  nestedMessages?: Message[];
  /** Array of nested enum definitions */
  nestedEnums?: Enum[];
  /** Array of oneof field groups */
  oneofs?: OneOf[];
  /** Array of extensions defined for this message */
  extensions?: Extension[];
  /** Message-specific options */
  options?: Options;
};
```

For complete type definitions, see the [TypeScript definitions](./src/types.ts).

## Advanced Usage

### Working with ProtoSet

```typescript
import { parseProtoDirectory, ProtoSet } from '@pseudomutojs/proto-parser';

// Parse an entire directory
const protoSet = await parseProtoDirectory('./api/protos', {
  recursive: true,  // Search subdirectories
  includePaths: ['./third_party/googleapis']
});

// Get statistics
const stats = protoSet.getStats();
console.log(`Loaded ${stats.files} proto files containing:`);
console.log(`  - ${stats.messages} messages`);
console.log(`  - ${stats.services} services`);
console.log(`  - ${stats.enums} enums`);

// Find specific proto file
const userProto = protoSet.getProtoByFile('user.proto');

// Get all service methods across all files
const services = protoSet.getAllServices();
services.forEach(service => {
  service.methods?.forEach(method => {
    console.log(`${service.name}.${method.name}`);
  });
});

// Create ProtoSet from mixed sources
const customSet = await ProtoSet.from(
  './common/base.proto',
  './services/api.proto',
  `syntax = "proto3";
   package custom;
   message Config { 
     string key = 1;
     string value = 2;
   }`
);
```

### Custom Include Paths

```typescript
import { parseProto } from '@pseudomutojs/proto-parser';

const proto = await parseProto('./api.proto', {
  includePaths: ['./protos', './third_party/googleapis', './third_party/protobuf'],
});
```

### Field Name Casing

The `keepCase` option controls how field names are handled consistently across both file paths and content strings:

```typescript
// Proto file content:
// message User {
//   string user_name = 1;
//   int32 user_id = 2;
// }

// With keepCase: true (default) - preserves original snake_case
const proto1 = await parseProto('./user.proto', { keepCase: true });
console.log(proto1.messages[0].fields[0].name); // "user_name"

// With keepCase: false - converts to camelCase
const proto2 = await parseProto('./user.proto', { keepCase: false });
console.log(proto2.messages[0].fields[0].name); // "userName"
```

### Working with Parsed Data

```typescript
import { parseProto } from '@pseudomutojs/proto-parser';

const proto = await parseProto('./user-service.proto');

// Access services
proto.services?.forEach(service => {
  console.log(`Service: ${service.namespace}.${service.name}`);

  service.methods?.forEach(method => {
    console.log(`  Method: ${method.name}`);
    console.log(`    Request: ${method.requestType}`);
    console.log(`    Response: ${method.responseType}`);
    console.log(`    Streaming: ${method.requestStream ? 'client' : ''}${method.responseStream ? 'server' : ''}`);
  });
});

// Access messages
proto.messages?.forEach(message => {
  console.log(`Message: ${message.namespace}.${message.name}`);

  message.fields?.forEach(field => {
    console.log(`  Field: ${field.name} (${field.type}) = ${field.number}`);
  });
});

// Access enums
proto.enums?.forEach(enumDef => {
  console.log(`Enum: ${enumDef.namespace}.${enumDef.name}`);

  enumDef.values.forEach(value => {
    console.log(`  ${value.name} = ${value.number}`);
  });
});
```

## Utility Functions

The library also exports utility functions for working with proto files:

### File System Utilities

```typescript
import { fileExists, isFilePath, readFile } from '@pseudomutojs/proto-parser';

// Check if a file exists
const exists = await fileExists('./my-file.proto');

// Read file content
const content = await readFile('./my-file.proto');

// Check if input is a file path vs content
const isPath = await isFilePath('./my-file.proto'); // true
const isContent = await isFilePath('syntax = "proto3";'); // false
```

### Path and Namespace Utilities

```typescript
import { extractNamespace, getProtoDirectory, getProtoPath, joinNamespace } from '@pseudomutojs/proto-parser';

// Get resolved file path
const fullPath = await getProtoPath('./relative/path.proto');

// Extract namespace components
const { namespace, name } = extractNamespace('google.protobuf.Timestamp');
// namespace = 'google.protobuf', name = 'Timestamp'

// Join namespace parts
const fullNamespace = joinNamespace('google', 'protobuf'); // 'google.protobuf'
```

## Error Handling

```typescript
import { parseProto } from '@pseudomutojs/proto-parser';

try {
  const proto = await parseProto('./non-existent.proto');
} catch (error) {
  if (error.message.includes('ENOENT')) {
    console.error('Proto file not found');
  } else if (error.message.includes('Cannot resolve import')) {
    console.error('Import resolution failed:', error.message);
  } else {
    console.error('Failed to parse proto:', error.message);
  }
}
```

### Import Resolution Errors

Both file paths and content strings now handle import resolution errors consistently:

```typescript
// File path - import resolution error
try {
  const proto = await parseProto('./api.proto');
} catch (error) {
  console.error(error.message); // "Cannot resolve import: missing/file.proto"
}

// Content string - same error behavior
try {
  const protoContent = `
    syntax = "proto3";
    import "missing/file.proto";
    message Test { string field = 1; }
  `;
  const proto = await parseProto(protoContent);
} catch (error) {
  console.error(error.message); // "Cannot resolve import: missing/file.proto"
}
```

## License

This project is licensed under the GPL-3.0-or-later License - see the [LICENSE](LICENSE) file for details.

## Related Projects

- [protobufjs](https://github.com/protobufjs/protobuf.js/) - Protocol Buffers for JavaScript
- [@grpc/proto-loader](https://github.com/grpc/grpc-node/tree/master/packages/proto-loader) - gRPC proto loader

