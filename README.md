# @pseudomutojs/proto-parser

[![NPM Version](https://img.shields.io/npm/v/@pseudomutojs/proto-parser.svg)](https://www.npmjs.com/package/@pseudomutojs/proto-parser)
[![License](https://img.shields.io/npm/l/@pseudomutojs/proto-parser.svg)](https://github.com/pseudomuto/proto-parser/blob/main/LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/pseudomuto/proto-parser/ci.yml?branch=main)](https://github.com/pseudomuto/proto-parser/actions)
[![Coverage](https://codecov.io/gh/pseudomuto/proto-parser/branch/main/graph/badge.svg)](https://codecov.io/gh/pseudomuto/proto-parser)

A TypeScript library for parsing Protocol Buffer (.proto) files and generating unified IDL. Extract messages, services, enums, and other definitions from both file paths and proto content strings, with the ability to merge multiple proto files into a single IDL.

## Features

- 🔍 **Parse from files or strings** - Load proto definitions from file paths or raw content
- 📁 **Directory parsing** - Parse all .proto files in a directory recursively
- 🔄 **Promise-based async API** - Modern async/await patterns throughout
- 🎯 **Complete parsing** - Extract messages, services, enums, oneofs, extensions, and nested structures
- 📦 **Import resolution** - Automatically resolve imports including Google Well-Known Types
- 🔧 **Customizable import resolution** - Implement custom logic for resolving imports (caching, remote files, custom file systems)
- 🛡️ **Type-safe** - Full TypeScript support with comprehensive type definitions
- 📚 **ProtoSet collections** - Manage and query multiple proto files as a unified set
- ✨ **IDL Generation** - Generate unified proto IDL from multiple proto files with smart conflict resolution
- 🔧 **Customizable output** - Control syntax version, package naming, and comment inclusion in generated IDL
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

## Version Notes

**v0.1.0+**: This library provides an async-only API. All parsing operations return Promises and should be used with `await` or `.then()`. Synchronous parsing methods are not available to ensure optimal performance with I/O operations and import resolution.

## Architecture

This library uses an **interface-driven architecture** that enables flexible customization while maintaining strong type safety. The core parsing logic is built around two key interfaces:

- **`ImportResolver`**: Handles resolving import paths, supporting custom logic for different environments (local files, remote sources, caching, etc.)
- **`ContentProcessor`**: Converts protobufjs objects to the library's internal types, enabling custom transformations and metadata extraction

Both interfaces have default implementations (`DefaultImportResolver`, `DefaultContentProcessor`) that can be used as-is or extended for custom behavior. This design allows the library to adapt to different deployment scenarios while maintaining consistent parsing behavior.

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

### Generate Unified IDL

```typescript
import { parseProtoDirectory } from '@pseudomutojs/proto-parser';

// Parse multiple proto files from a directory
const protoSet = await parseProtoDirectory('./api/protos');

// Generate a unified proto IDL containing all definitions
const unifiedIdl = protoSet.generateSupersetIdl({
  syntax: 'proto3',
  packageName: 'unified.api',
  includeComments: true
});

console.log(unifiedIdl);
/* 
Output: A complete proto file with:
- All unique imports
- All messages from all files
- All services from all files  
- All enums from all files
- Proper namespace conflict resolution
*/
```

## API Reference

### Main Functions

#### `parseProto(input, options?)`

Asynchronously parses a Protocol Buffer file or content string.

**Parameters:**

- `input` (string) - Either a file path to a .proto file or proto content string
- `options` (ParseOptions, optional) - Parsing configuration options

**Returns:** `Promise<Proto>` - A promise that resolves to a Proto object containing all parsed definitions


#### `parseProtoDirectory(dirPath, options?)`

Asynchronously parses all Protocol Buffer files in a directory.

**Parameters:**

- `dirPath` (string) - Path to the directory containing .proto files
- `options` (DirectoryParseOptions, optional) - Directory parsing configuration options

**Returns:** `Promise<ProtoSet>` - A promise that resolves to a ProtoSet containing all parsed proto files

#### `DefaultImportResolver` Class

The default implementation of the `ImportResolver` interface, providing standard import resolution logic.

**Constructor:**
```typescript
new DefaultImportResolver(baseDir: string, fileSystem: FileSystem, options?: ParseOptions)
```

**Usage:**
```typescript
import { DefaultImportResolver, DefaultFileSystem } from '@pseudomutojs/proto-parser';

const fileSystem = new DefaultFileSystem();
const resolver = new DefaultImportResolver('/base/directory', fileSystem, {
  includePaths: ['./protos', './third_party']
});

// Extend for custom behavior
class CustomResolver extends DefaultImportResolver {
  async resolveImport(importPath: string): Promise<string | null> {
    // Custom logic
    return super.resolveImport(importPath);
  }
}
```

#### `DefaultContentProcessor` Class

The default implementation of the `ContentProcessor` interface, handling conversion from protobufjs objects to internal types.

**Usage:**
```typescript
import { DefaultContentProcessor } from '@pseudomutojs/proto-parser';

// Extend for custom processing
class CustomProcessor extends DefaultContentProcessor {
  parseMessage(messageType: any, namespace: string) {
    const result = super.parseMessage(messageType, namespace);
    // Add custom processing
    return result;
  }
}
```

#### `DefaultFileSystem` Class

The default implementation of the `FileSystem` interface, providing standard file system operations. This class is used internally by the library and can be extended or replaced with custom implementations for specialized file access patterns (e.g., virtual file systems, in-memory files, or remote file access).

**Constructor:**
```typescript
new DefaultFileSystem()
```

**Usage:**
```typescript
import { DefaultFileSystem } from '@pseudomutojs/proto-parser';

// Use the default file system implementation
const fs = new DefaultFileSystem();

// Check if a file exists
const exists = await fs.exists('/path/to/file.proto');

// Read file content
const content = await fs.readFile('/path/to/file.proto');

// Check if a path is a file
const isFile = await fs.isFile('/path/to/file.proto');

// Get absolute path
const absPath = await fs.resolve('./relative/path.proto');
```

**Methods:**
- `exists(filePath: string): Promise<boolean>` - Check if a file exists
- `readFile(filePath: string): Promise<string>` - Read file content as UTF-8 string
- `isFile(filePath: string): Promise<boolean>` - Check if path points to a file (not directory)
- `resolve(...paths: string[]): Promise<string>` - Resolve to absolute path

#### `BufResolver` Class

The BufResolver downloads complete Buf Schema Registry modules as tar.gz archives and extracts them to temporary directories. This provides superior performance and fidelity compared to individual file requests.

**Constructor:**
```typescript
new BufResolver(modules: string[], options?: BufResolverOptions)
```

**Usage:**
```typescript
import { BufResolver, DefaultFileSystem, DefaultImportResolver, parseProto } from '@pseudomutojs/proto-parser';

// Create resolver with modules to preload
const bufResolver = new BufResolver([
  'buf.build/bufbuild/protovalidate:v1.0.0',
  'buf.build/googleapis/googleapis'
], {
  includeWKTs: true, // Automatically includes protocolbuffers/wellknowntypes (default)
  bufToken: process.env.BUF_TOKEN // Optional: for private modules
});

// Download and extract modules to temporary directories
const tempDirs = await bufResolver.preloadModules();

// Integrate with import resolver
const fileSystem = new DefaultFileSystem();
const importResolver = new DefaultImportResolver(__dirname, fileSystem, {
  includePaths: tempDirs
});

// Parse proto files with Buf module dependencies
const proto = await parseProto('./api.proto', { importResolver });

// Clean up temporary directories when done
await bufResolver.cleanup();
```

**Key advantages:**
- Downloads original proto files (preserves comments and formatting)
- Single request per module vs. multiple file requests
- Automatic dependency resolution with complete module archives
- Integrates seamlessly with existing ImportResolver architecture

**Options:**
```typescript
interface BufResolverOptions {
  /** Optional Buf API token for authenticated requests to private modules */
  bufToken?: string;
  /** Base directory for temporary files (defaults to OS temp directory) */
  tempDir?: string;
  /** FileSystem implementation to use (defaults to DefaultFileSystem) */
  fileSystem?: FileSystem;
  /** Whether to include dependencies when downloading modules (defaults to true) */
  includeDependencies?: boolean;
  /** Whether to automatically include Google Protocol Buffer well-known types (defaults to true) */
  includeWKTs?: boolean;
}
```

#### `createDefaultParseOptions(baseDir, options?)`

Helper function to create fully resolved ParseOptions with defaults populated.

**Parameters:**
- `baseDir` (string) - Base directory for import resolution
- `options` (ParseOptions, optional) - Partial options to merge with defaults

**Returns:** `ResolvedParseOptions` - Complete options with all fields populated

**Usage:**
```typescript
import { createDefaultParseOptions } from '@pseudomutojs/proto-parser';

const resolvedOptions = createDefaultParseOptions('/base/dir', {
  includePaths: ['./protos'],
  importResolver: new CustomImportResolver()
});
```


### ProtoSet Class

A collection of parsed Protocol Buffer files with methods to query and aggregate definitions.

#### Static Methods

##### `ProtoSet.from(...inputs)`

Creates a ProtoSet from multiple file paths and/or proto content strings.

```typescript
const protoSet = await ProtoSet.from(
  './user.proto',
  'syntax = "proto3"; message Test { string id = 1; }',
  { keepCase: false } // optional ParseOptions
);
```

#### Instance Methods

- `getProtos()` - Returns all Proto objects in the set
- `getProtoByFile(filename)` - Find a proto by its filename
- `getAllMessages()` - Get all messages from all protos (including nested)
- `getAllServices()` - Get all services from all protos
- `getAllEnums()` - Get all enums from all protos (including nested)
- `getAllImports()` - Get unique imports across all protos
- `generateSupersetIdl(options?)` - Generate unified proto IDL from all files in the set
- `size()` - Returns the number of proto files in the set
- `isEmpty()` - Check if the set is empty
- `getStats()` - Get statistics about the proto set

##### `generateSupersetIdl(options?)`

Generates a unified Protocol Buffer IDL file containing all definitions from the ProtoSet.

**Parameters:**
- `options` (SupersetOptions, optional) - Configuration options for IDL generation

**Returns:** `string` - A complete proto IDL string

**Example:**
```typescript
const protoSet = await parseProtoDirectory('./api/protos');

// Generate with default options (proto3, with comments)
const basicIdl = protoSet.generateSupersetIdl();

// Generate with custom options
const customIdl = protoSet.generateSupersetIdl({
  syntax: 'proto3',
  packageName: 'unified.api.v1',
  includeComments: true,
  namespaceConflictResolution: 'prefix'
});

console.log(customIdl);
// Output: Complete proto file with all messages, services, enums, and imports
```

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
  /** Custom content processor for converting protobufjs objects to internal types */
  contentProcessor?: ContentProcessor;
  /** Custom import resolver for resolving proto import paths */
  importResolver?: ImportResolver;
}

interface DirectoryParseOptions extends ParseOptions {
  /** Whether to recursively search subdirectories for .proto files (default: true) */
  recursive?: boolean;
}

interface SupersetOptions {
  /** The proto syntax version to use in generated IDL (default: 'proto3') */
  syntax?: 'proto2' | 'proto3';
  /** The package name for the generated proto file */
  packageName?: string;
  /** Whether to include comments indicating source files and section headers (default: true) */
  includeComments?: boolean;
  /** 
   * How to handle namespace conflicts when merging definitions (default: 'prefix')
   * - 'prefix': Adds namespace prefix or numeric suffix to conflicting names
   * - 'ignore': Keeps original names, may result in duplicates
   */
  namespaceConflictResolution?: 'prefix' | 'ignore';
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

### Custom Import Resolution

The library supports custom import resolution logic through the `ImportResolver` interface. This enables powerful customization for different environments and use cases.

#### Caching Import Resolver

Implement caching to improve performance when parsing multiple files that share imports:

```typescript
import { DefaultImportResolver, DefaultFileSystem, parseProto } from '@pseudomutojs/proto-parser';

class CachingImportResolver extends DefaultImportResolver {
  private cache = new Map<string, string | null>();

  async resolveImport(importPath: string): Promise<string | null> {
    if (this.cache.has(importPath)) {
      return this.cache.get(importPath)!;
    }

    const result = await super.resolveImport(importPath);
    this.cache.set(importPath, result);
    return result;
  }
}

// Use the caching resolver
const fileSystem = new DefaultFileSystem();
const proto = await parseProto('./api.proto', {
  importResolver: new CachingImportResolver('/base/dir', fileSystem, { includePaths: ['./protos'] })
});
```

#### Remote Import Resolver

Fetch imports from remote sources like GitHub or package registries:

```typescript
import { ImportResolver, parseProto } from '@pseudomutojs/proto-parser';

class RemoteImportResolver implements ImportResolver {
  constructor(private baseUrl: string) {}

  async resolveImport(importPath: string): Promise<string | null> {
    // Handle Well-Known Types locally
    if (importPath.startsWith('google/protobuf/')) {
      return importPath; // Let protobufjs handle WKTs
    }

    try {
      const response = await fetch(`${this.baseUrl}/${importPath}`);
      if (response.ok) {
        // Return path to temporary file or cache
        const content = await response.text();
        return this.saveTempFile(importPath, content);
      }
    } catch (error) {
      console.warn(`Failed to fetch remote import: ${importPath}`);
    }
    
    return null;
  }

  async validateImports(imports: string[]): Promise<void> {
    // Pre-validate that remote imports are accessible
    for (const importPath of imports) {
      if (!importPath.startsWith('google/protobuf/')) {
        const resolved = await this.resolveImport(importPath);
        if (!resolved) {
          throw new Error(`Cannot resolve remote import: ${importPath}`);
        }
      }
    }
  }

  createProtobufResolver() {
    return (origin: string, target: string) => {
      // Synchronous resolution - assumes imports were pre-cached by validateImports
      return this.getCachedPath(target) || target;
    };
  }

  private async saveTempFile(importPath: string, content: string): Promise<string> {
    // Implementation to save to temp file and return path
    // ...
  }

  private getCachedPath(importPath: string): string | null {
    // Implementation to get cached file path
    // ...
  }
}

// Use remote resolver
const proto = await parseProto('./api.proto', {
  importResolver: new RemoteImportResolver('https://raw.githubusercontent.com/user/protos/main')
});
```


#### Multi-Source Import Resolver

Combine multiple resolution strategies:

```typescript
import { DefaultImportResolver, DefaultFileSystem, FileSystem } from '@pseudomutojs/proto-parser';

class MultiSourceImportResolver extends DefaultImportResolver {
  constructor(
    baseDir: string,
    fileSystem: FileSystem,
    private remoteSources: string[] = [],
    options = {}
  ) {
    super(baseDir, fileSystem, options);
  }

  async resolveImport(importPath: string): Promise<string | null> {
    // First try local resolution
    const localResult = await super.resolveImport(importPath);
    if (localResult) {
      return localResult;
    }

    // Try remote sources
    for (const remoteBase of this.remoteSources) {
      try {
        const remoteUrl = `${remoteBase}/${importPath}`;
        const response = await fetch(remoteUrl);
        if (response.ok) {
          // Cache and return local path
          return this.cacheRemoteFile(importPath, await response.text());
        }
      } catch (error) {
        // Continue to next source
      }
    }

    return null;
  }

  private async cacheRemoteFile(importPath: string, content: string): Promise<string> {
    // Implementation to cache remote content locally
    // ...
  }
}

// Use multi-source resolver
const fileSystem = new DefaultFileSystem();
const proto = await parseProto('./api.proto', {
  importResolver: new MultiSourceImportResolver('/local/protos', fileSystem, [
    'https://raw.githubusercontent.com/googleapis/googleapis/master',
    'https://raw.githubusercontent.com/grpc-ecosystem/grpc-gateway/master'
  ])
});
```

### Custom Content Processing

The library also supports custom content processing through the `ContentProcessor` interface, allowing you to customize how protobufjs objects are converted to the library's internal types.

#### Logging Content Processor

Add logging to track parsing operations:

```typescript
import { DefaultContentProcessor, parseProto } from '@pseudomutojs/proto-parser';

class LoggingContentProcessor extends DefaultContentProcessor {
  parseMessage(messageType: any, namespace: string) {
    console.log(`Parsing message: ${namespace}.${messageType.name}`);
    return super.parseMessage(messageType, namespace);
  }

  parseService(service: any, namespace: string) {
    console.log(`Parsing service: ${namespace}.${service.name} with ${service.methodsArray.length} methods`);
    return super.parseService(service, namespace);
  }
}

// Use logging processor
const proto = await parseProto('./api.proto', {
  contentProcessor: new LoggingContentProcessor()
});
```

#### Custom Field Transformation

Customize how fields are processed:

```typescript
import { DefaultContentProcessor } from '@pseudomutojs/proto-parser';

class CustomFieldProcessor extends DefaultContentProcessor {
  parseField(field: any) {
    const result = super.parseField(field);
    
    // Add custom metadata to fields
    if (field.options?.deprecated) {
      result.customMetadata = { deprecated: true };
    }
    
    // Transform field names for specific patterns
    if (result.name.endsWith('_id')) {
      result.customMetadata = { ...result.customMetadata, isIdentifier: true };
    }
    
    return result;
  }
}

// Use custom field processor
const proto = await parseProto('./api.proto', {
  contentProcessor: new CustomFieldProcessor()
});
```

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

### Generating Unified IDL

The `generateSupersetIdl()` method allows you to merge multiple proto files into a single unified IDL file. This is useful for creating consolidated API documentation, generating single proto files for code generation tools, or merging microservice definitions.

```typescript
import { parseProtoDirectory } from '@pseudomutojs/proto-parser';

// Parse microservice proto files
const protoSet = await parseProtoDirectory('./microservices/protos', {
  recursive: true,
  includePaths: ['./shared/protos']
});

// Generate unified API proto
const unifiedApi = protoSet.generateSupersetIdl({
  syntax: 'proto3',
  packageName: 'unified.microservices.v1',
  includeComments: true,
  namespaceConflictResolution: 'prefix'
});

// Save to file or use for code generation
console.log(unifiedApi);
/*
Output:
syntax = "proto3";

package unified.microservices.v1;

import "google/protobuf/timestamp.proto";
import "google/protobuf/empty.proto";

// Enum definitions
// From: user-service.proto
enum UserStatus {
  USER_STATUS_UNKNOWN = 0;
  USER_STATUS_ACTIVE = 1;
  USER_STATUS_INACTIVE = 2;
}

// Message definitions
// From: user-service.proto
message User {
  string id = 1;
  string name = 2;
  string email = 3;
  UserStatus status = 4;
  google.protobuf.Timestamp created_at = 5;
}

// From: order-service.proto
message Order {
  string id = 1;
  string user_id = 2;
  repeated OrderItem items = 3;
}

// Service definitions
// From: user-service.proto
service UserService {
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc GetUser(GetUserRequest) returns (User);
}
*/

// Handle namespace conflicts
const protoWithConflicts = await parseProtoDirectory('./conflicting-services');
const resolvedIdl = protoWithConflicts.generateSupersetIdl({
  namespaceConflictResolution: 'prefix' // Prefixes conflicting names with namespace
});
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

