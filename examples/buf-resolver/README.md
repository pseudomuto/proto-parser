# BufResolver Example

This example demonstrates how to use the `BufResolver` to integrate with Buf Schema Registry modules in your protobuf parsing workflow.

## What this example shows

1. **Module Preloading**: Download and extract Buf modules to temporary directories
2. **Import Resolution**: Integrate preloaded modules with `DefaultImportResolver`
3. **Parsing**: Parse proto files that import from Buf modules
4. **Error Handling**: Handle authentication and network errors gracefully
5. **Cleanup**: Properly clean up temporary directories

## Files

- `example.ts` - Main example script showing BufResolver usage
- `example.proto` - Sample proto file that imports from Buf modules
- `README.md` - This documentation

## Running the example

```bash
# From the repository root
npm run build

# Run the example
cd examples/buf-resolver
npx tsx example.ts
```

## How it works

The example demonstrates the modern interface-driven architecture:

1. **BufResolver** downloads modules as raw proto files (no FileDescriptorSet reconstruction)
2. **DefaultFileSystem** provides file system operations 
3. **DefaultImportResolver** handles import resolution with preloaded module directories
4. **parseProto** uses the resolver to parse files with all dependencies available

## Buf modules used

- `buf.build/bufbuild/protovalidate:v1.0.0` - Validation rules
- `buf.build/googleapis/googleapis` - Google APIs (latest version)

## Key advantages

- Uses original proto files (preserves comments and formatting)
- Automatic dependency resolution
- Perfect type resolution
- Better performance with single request per module
- Works with any import resolver implementation

## Authentication

For private Buf modules, set the `BUF_TOKEN` environment variable:

```bash
export BUF_TOKEN=your_buf_token_here
npx tsx example.ts
```