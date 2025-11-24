# BufImportResolver Example

This example demonstrates how to extend the `DefaultImportResolver` to add support for resolving Protocol Buffer imports from the [Buf Schema Registry (BSR)](https://buf.build).

## Overview

The `BufImportResolver` class extends `DefaultImportResolver` to provide:

- Resolution of imports from the Buf Schema Registry
- Support for both public and private BSR modules
- Local caching of downloaded proto files
- Fallback to default resolution for non-Buf imports
- Full compatibility with existing import resolution features

## Key Features

### 1. Pattern/Prefix-Based Module Mapping

Map import patterns or prefixes to Buf module coordinates:

```typescript
const resolver = new BufImportResolver(
  baseDir,
  {
    // Prefix matching - resolves all files under buf/validate/
    'buf/validate/': 'buf.build/bufbuild/protovalidate:v1.0.0',
    
    // Wildcard matching - resolves .proto files in google/type/
    'google/type/*.proto': 'buf.build/googleapis/googleapis',
    
    // Multi-level wildcard - any .proto file in company subdirectories
    'company/**/*.proto': 'buf.build/mycompany/protos:latest',
    
    // No version specified - uses Buf's default
    'third-party/': 'buf.build/vendor/external'
  }
);
```

#### Pattern Types:
- **Prefix matching**: `'buf/validate/'` - matches all files starting with `buf/validate/`
- **Single wildcard**: `'google/type/*.proto'` - matches files directly in the directory
- **Multi-level wildcard**: `'company/**/*.proto'` - matches files in any subdirectory
- **Exact matching**: `'specific/file.proto'` - matches exactly that file

### 2. Optional Authentication

Provide an optional token for private modules:

```typescript
const resolver = new BufImportResolver(
  baseDir,
  moduleMapping,
  {
    bufToken: 'your-token-here'  // Optional - caller controls token management
  }
);
```

The token is completely optional and controlled by the caller. You can obtain it from:
- Configuration files
- Environment variables (if you choose)
- Command-line arguments
- Secrets management systems
- Hard-coded for development

### 3. Custom Cache Directory

Control where downloaded proto files are cached:

```typescript
const resolver = new BufImportResolver(
  baseDir,
  moduleMapping,
  {
    cacheDir: './proto-cache'  // Defaults to system temp directory
  }
);
```

### 4. Fallback Resolution

The resolver extends `DefaultImportResolver`, so it automatically:
- Falls back to local file resolution
- Supports Google Well-Known Types
- Uses configured include paths
- Handles all standard import patterns

## Usage

### Basic Example

```typescript
import { parseProto } from '@pseudomutojs/proto-parser';
import { BufImportResolver } from './BufImportResolver';

// Create resolver with pattern-based mappings
const resolver = new BufImportResolver(
  process.cwd(),
  {
    'buf/validate/': 'buf.build/bufbuild/protovalidate:v1.0.0'
  }
);

// Parse proto file that imports from BSR
const proto = await parseProto('./example.proto', {
  importResolver: resolver
});
```

### With Authentication (Private Modules)

```typescript
const resolver = new BufImportResolver(
  process.cwd(),
  {
    'company/internal/': 'buf.build/mycompany/internal:v1.0.0'
  },
  {
    bufToken: getAuthToken()  // Your function to retrieve the token
  }
);
```

### Mixed Resolution (BSR + Local)

```typescript
const resolver = new BufImportResolver(
  process.cwd(),
  {
    // All buf/validate imports will use BSR
    'buf/validate/': 'buf.build/bufbuild/protovalidate:v1.0.0'
  },
  {
    // Local paths for other imports
    includePaths: ['./protos', './third_party']
  }
);

// This uses BSR
await resolver.resolveImport('buf/validate/validate.proto');

// This uses local resolution
await resolver.resolveImport('./local/messages.proto');

// This uses built-in WKT support
await resolver.resolveImport('google/protobuf/timestamp.proto');
```

## Module Coordinate Format

Buf module coordinates follow this format:
```
buf.build/<owner>/<repository>:<version>
```

Examples:
- `buf.build/bufbuild/protovalidate:v0.1.0` - Specific version
- `buf.build/googleapis/googleapis:latest` - Latest version
- `buf.build/connectrpc/eliza:main` - Main branch

## Files in This Example

### `BufImportResolver.ts`

The main resolver implementation that:
- Extends `DefaultImportResolver`
- Implements Buf API integration
- Manages local caching
- Reconstructs proto files from FileDescriptorSets

### `example.proto`

A sample Protocol Buffer file that demonstrates:
- Importing from `buf/validate/validate.proto`
- Using validation annotations
- Common validation patterns

### `example.ts`

A runnable example demonstrating basic usage with the BufImportResolver:
- Pattern-based module mapping for buf/validate imports
- Resolution of public modules from the Buf Schema Registry
- Parsing proto files with BSR imports
- Displaying parsed message and service information

## Running the Example

```bash
# Install dependencies
npm install

# Run the example
npx ts-node examples/buf-import-resolver/example.ts
```

## How It Works

1. **Pattern Matching**: When `resolveImport()` is called, the resolver checks if the import path matches any configured patterns:
   - **Prefix matching**: `'buf/validate/'` matches any file starting with that prefix
   - **Wildcard matching**: `'google/type/*.proto'` matches files using * and ** wildcards
   - **Exact matching**: `'specific/file.proto'` matches exactly that file

2. **Cache Check**: If it's a Buf import, the resolver checks the local cache directory for a previously downloaded version.

3. **API Request**: If not cached, it makes a request to the Buf API's `GetFileDescriptorSet` endpoint with:
   - The module name
   - Optional version (or Buf's default if not specified)
   - Optional authentication token

4. **Proto Reconstruction**: The API returns a FileDescriptorSet, which the resolver converts back into proto syntax.

5. **Caching**: The reconstructed proto file is saved to the cache directory for future use.

6. **Fallback**: If the import doesn't match any patterns, it falls back to the default resolution logic (local files, WKTs, etc.).

## API Endpoint

The resolver uses the Buf Reflection API:
```
POST https://buf.build/buf.reflect.v1beta1.FileDescriptorSetService/GetFileDescriptorSet
```

Request format:
```json
{
  "module": "buf.build/bufbuild/protovalidate",
  "version": "v0.1.0",
  "symbols": ["buf.validate"]  // Optional filtering
}
```

## Authentication

For private modules on the Buf Schema Registry:

1. Create a Buf account at [buf.build](https://buf.build)
2. Generate an API token from your account settings
3. Provide the token to the resolver:

```typescript
const resolver = new BufImportResolver(baseDir, moduleMapping, {
  bufToken: 'YOUR_TOKEN_HERE'
});
```

Public modules don't require authentication.

## Caching

Downloaded proto files are cached locally to improve performance:

- Default location: System temp directory (`.buf-cache` subdirectory)
- Custom location: Specify via `cacheDir` option
- Cache structure mirrors import paths for organization
- Cache is persistent across runs (manual cleanup if needed)

## Error Handling

The resolver includes robust error handling:

- **Network failures**: Falls back to default resolution
- **Invalid modules**: Logs warning and tries default resolution
- **Authentication errors**: Fails for private modules, works for public
- **Cache errors**: Attempts to fetch from API

## Benefits of Extending DefaultImportResolver

By extending rather than implementing from scratch:

1. **Preserves all existing functionality**: Local files, include paths, WKTs
2. **Clean separation**: Buf-specific logic is isolated
3. **Drop-in replacement**: Can be used anywhere `DefaultImportResolver` is used
4. **Future-proof**: Automatically inherits improvements to the base class
5. **Minimal code**: Only implements what's different

## Limitations

- The proto reconstruction from FileDescriptorSet is simplified and may not perfectly preserve all original formatting
- Complex proto features might need enhancement in the reconstruction logic
- The Buf Reflection API is in beta and may change
- Rate limiting may apply to API requests
- You may see "Failed to load import" warnings from protobufjs internals, but these don't prevent successful parsing when the resolver provides the files
- Proto files with nested dependencies require mapping all dependency paths (as shown in the examples)

## See Also

- [Buf Schema Registry](https://buf.build)
- [Buf Reflection API Docs](https://buf.build/docs/bsr/reflection/)
- [proto-parser Documentation](../../README.md)
- [DefaultImportResolver](../../src/DefaultImportResolver.ts)