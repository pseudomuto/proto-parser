/**
 * @fileoverview Utility functions for Protocol Buffer parsing
 *
 * This module re-exports all utility functions to provide a clean
 * public API and maintain backwards compatibility.
 */

// Re-export general utilities
export { getProtoDirectory, extractNamespace, joinNamespace } from './general';

// Re-export import utilities
export { resolveImport, validateImportPath } from './imports';

// Re-export well-known type utilities
export { isWellKnownType, resolveWellKnownType } from './wellKnownTypes';
