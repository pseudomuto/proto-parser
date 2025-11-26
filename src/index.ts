/**
 * @fileoverview Protocol Buffer parser library for Node.js
 *
 * This library provides utilities for parsing Protocol Buffer (.proto) files,
 * extracting messages, services, enums, and other definitions from both file
 * paths and proto content strings.
 *
 * @since 0.1.0
 */

export { parseProto, parseProtoDirectory } from './parser';
export { ProtoSet } from './ProtoSet';

// Export interfaces and default implementations
export { DefaultContentProcessor } from './DefaultContentProcessor';
export { DefaultFileSystem } from './DefaultFileSystem';
export { DefaultImportResolver } from './resolvers';

// Export Buf-related utilities
export { BufResolver, BufResolverError } from './buf';
export type { BufResolverOptions } from './buf';
export { createDefaultParseOptions } from './defaults';

// Export all types
export * from './types';
