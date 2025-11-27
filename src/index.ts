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
export { ProtoParser } from './proto';
export { DefaultFileSystem } from './DefaultFileSystem';
export { ImportProcessor, IImportProcessor } from './resolvers';

// Export Buf-related utilities
export { BufModuleProvider, BufModuleProviderError } from './buf';
export type { BufModuleProviderOptions } from './buf';
export { createDefaultParseOptions } from './defaults';

// Export error classes
export { ProtoParserError, ProtoParseError, ProtoBuildError } from './errors';

// Export all types
export * from './types';
