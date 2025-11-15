# @pseudomutojs/proto-parser

[![NPM Version](https://img.shields.io/npm/v/@pseudomutojs/proto-parser.svg)](https://www.npmjs.com/package/@pseudomutojs/proto-parser)
[![License](https://img.shields.io/npm/l/@pseudomutojs/proto-parser.svg)](https://github.com/pseudomuto/proto-parser/blob/main/LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/pseudomuto/proto-parser/ci.yml?branch=main)](https://github.com/pseudomuto/proto-parser/actions)

A TypeScript library for parsing Protocol Buffer (.proto) files, extracting messages, services, enums, and other definitions from both file paths and proto content strings.

## Features

- 🔍 **Parse from files or strings** - Load proto definitions from file paths or raw content
- 🔄 **Async and sync APIs** - Choose between promise-based or blocking operations
- 🎯 **Complete parsing** - Extract messages, services, enums, oneofs, extensions, and nested structures
- 📦 **Import resolution** - Automatically resolve imports including Google Well-Known Types
- 🛡️ **Type-safe** - Full TypeScript support with comprehensive type definitions
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

### Configuration Options

```typescript
interface ParseOptions {
  /** Additional directories to search for imported proto files */
  includePaths?: string[];
  /** Whether to preserve field name casing (default: true) */
  keepCase?: boolean;
  /** Whether to include default values (default: true) */
  defaults?: boolean;
  /** Whether to include oneof definitions (default: true) */
  oneofs?: boolean;
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

### Custom Include Paths

```typescript
import { parseProto } from '@pseudomutojs/proto-parser';

const proto = await parseProto('./api.proto', {
  includePaths: ['./protos', './third_party/googleapis', './third_party/protobuf'],
});
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
  } else {
    console.error('Failed to parse proto:', error.message);
  }
}
```

## License

This project is licensed under the GPL-3.0-or-later License - see the [LICENSE](LICENSE) file for details.

## Related Projects

- [protobufjs](https://github.com/protobufjs/protobuf.js/) - Protocol Buffers for JavaScript
- [@grpc/proto-loader](https://github.com/grpc/grpc-node/tree/master/packages/proto-loader) - gRPC proto loader

