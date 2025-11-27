/**
 * @fileoverview Proto parsing package
 *
 * This package provides the core proto parsing functionality for converting
 * protobufjs objects to our internal type system.
 *
 * @since 0.3.0
 */

export { collectProtoDefinitions } from './collectDefinitions';
export { IProtoParser } from './IProtoParser';
export { ProtoParser } from './ProtoParser';
export * from './types';
