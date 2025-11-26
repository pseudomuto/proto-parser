import * as fs from 'fs';
import * as path from 'path';

import { FileSystem, ImportResolver, ParseOptions } from '../types';

/**
 * Default implementation of ImportResolver interface.
 * Handles all import resolution logic for proto files.
 * Provides async-only import resolution with support for include paths and well-known types.
 */
export class DefaultImportResolver implements ImportResolver {
  protected readonly baseDir: string;
  protected readonly includePaths: string[];
  protected readonly fileSystem: FileSystem;

  constructor(baseDir: string, fileSystem: FileSystem, options: ParseOptions = {}) {
    this.baseDir = baseDir;
    this.fileSystem = fileSystem;
    this.includePaths = [
      baseDir,
      ...(options.includePaths || []),
      path.join(baseDir, 'proto'),
      path.join(baseDir, 'protos'),
      process.cwd(),
    ];
  }

  /**
   * Asynchronously resolves an import path to its full file system path.
   */
  async resolveImport(importPath: string): Promise<string | null> {
    // Check if it's an absolute path
    if (path.isAbsolute(importPath)) {
      return (await this.fileSystem.exists(importPath)) ? importPath : null;
    }

    // Search through include paths FIRST (including for google/protobuf files)
    for (const searchPath of this.includePaths) {
      const fullPath = path.join(searchPath, importPath);
      if (await this.fileSystem.exists(fullPath)) {
        return fullPath;
      }
    }

    // Only fall back to well-known Google protobuf types if not found in include paths
    const wellKnownPath = await this.resolveWellKnownType(importPath);
    if (wellKnownPath) {
      return wellKnownPath;
    }

    // For WKTs, even if we can't find physical files, protobufjs can handle them
    if (this.isWellKnownType(importPath)) {
      return importPath; // Return the import path itself, protobufjs will handle it
    }

    return null;
  }

  /**
   * Validates that all imports can be resolved before loading.
   */
  async validateImports(imports: string[]): Promise<void> {
    for (const importPath of imports) {
      const resolved = await this.resolveImport(importPath);
      if (!resolved) {
        throw new Error(`Cannot resolve import: ${importPath}`);
      }
    }
  }

  /**
   * Creates a resolve path function compatible with protobufjs.
   * Since we pre-validate all imports with async methods, this function
   * primarily handles the synchronous interface required by protobufjs.
   */
  createProtobufResolver(): (_origin: string, target: string) => string {
    return (_origin: string, target: string): string => {
      if (path.isAbsolute(target)) {
        if (!fs.existsSync(target)) {
          throw new Error(`Import not found: ${target}`);
        }
        return target;
      }

      // Search through include paths first (even for google/protobuf files)
      // This ensures we use the complete versions from Buf modules
      for (const searchPath of this.includePaths) {
        const fullPath = path.join(searchPath, target);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }

      // Only fall back to well-known types if not found in include paths
      if (this.isWellKnownType(target)) {
        return target;
      }

      throw new Error(`Cannot resolve import: ${target}`);
    };
  }

  /**
   * Checks if an import path refers to a Google Well-Known Type.
   */
  private isWellKnownType(importPath: string): boolean {
    return importPath.startsWith('google/protobuf/');
  }

  /**
   * Attempts to resolve a Google Well-Known Type.
   */
  private async resolveWellKnownType(importPath: string): Promise<string | null> {
    if (!this.isWellKnownType(importPath)) {
      return null;
    }

    try {
      const protobufjsPath = require.resolve('protobufjs');
      const protobufjsDir = path.dirname(protobufjsPath);
      const googlePath = path.join(protobufjsDir, '..', importPath);

      if (await this.fileSystem.exists(googlePath)) {
        return googlePath;
      }

      // Also try looking in node_modules
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'protobufjs', importPath);
      if (await this.fileSystem.exists(nodeModulesPath)) {
        return nodeModulesPath;
      }
    } catch {
      // Fall through
    }

    return null;
  }
}
