import * as path from 'path';

import { IFileSystem } from '../types';

/**
 * Checks if an import path refers to a Google Well-Known Type.
 *
 * @param importPath - The import path to check
 * @returns True if the path is a Google Well-Known Type
 */
export function isWellKnownType(importPath: string): boolean {
  return importPath.startsWith('google/protobuf/');
}

/**
 * Attempts to resolve a Google Well-Known Type to its physical file path.
 * This tries to locate the actual .proto files distributed with protobufjs.
 *
 * @param importPath - The import path to resolve
 * @param fileSystem - File system abstraction for checking file existence
 * @returns Promise that resolves to the full path or null if not found
 */
export async function resolveWellKnownType(importPath: string, fileSystem: IFileSystem): Promise<string | null> {
  if (!isWellKnownType(importPath)) {
    return null;
  }

  try {
    const protobufjsPath = require.resolve('protobufjs');
    const protobufjsDir = path.dirname(protobufjsPath);
    const googlePath = path.join(protobufjsDir, '..', importPath);

    if (await fileSystem.exists(googlePath)) {
      return googlePath;
    }

    // Also try looking in node_modules
    const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'protobufjs', importPath);
    if (await fileSystem.exists(nodeModulesPath)) {
      return nodeModulesPath;
    }
  } catch {
    // Fall through
  }

  return null;
}
