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
export { parseFileDescriptorSet, parseFileDescriptorSetSync } from './descriptorParser';
export { ProtoSet } from './ProtoSet';
export * from './types';
export * from './utils';
