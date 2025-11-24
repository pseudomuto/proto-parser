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
export { parseFileDescriptorSet } from './descriptorParser';
export { ProtoSet } from './ProtoSet';

// Export FileDescriptor interfaces for use in custom import resolvers
export type {
  FieldDescriptor,
  MessageDescriptor,
  EnumValueDescriptor,
  EnumDescriptor,
  MethodDescriptor,
  ServiceDescriptor,
  FileDescriptor,
  FileDescriptorSetData,
  FileDescriptorSetInput,
} from './descriptorParser';

// Export interfaces and default implementations
export { DefaultContentProcessor } from './DefaultContentProcessor';
export { DefaultImportResolver } from './DefaultImportResolver';
export { createDefaultParseOptions } from './defaults';

// Export all types
export * from './types';
export * from './utils';
