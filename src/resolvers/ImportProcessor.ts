import * as path from 'path';

import { FileSystem, ParseOptions } from '../types';
import { isWellKnownType, resolveWellKnownType } from '../utils/wellKnownTypes';
import { IImportProcessor } from './IImportProcessor';

/**
 * Default implementation of IImportProcessor interface.
 * Handles all import resolution logic for proto files.
 * Provides async-only import resolution with support for include paths and well-known types.
 */
export class ImportProcessor implements IImportProcessor {
  readonly #baseDir: string;
  readonly #includePaths: string[];

  protected readonly fileSystem: FileSystem;

  constructor(baseDir: string, fileSystem: FileSystem, options: ParseOptions = {}) {
    this.#baseDir = baseDir;
    this.fileSystem = fileSystem;
    this.#includePaths = [
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
    for (const searchPath of this.#includePaths) {
      const fullPath = path.join(searchPath, importPath);
      if (await this.fileSystem.exists(fullPath)) {
        return fullPath;
      }
    }

    // Only fall back to well-known Google protobuf types if not found in include paths
    const wellKnownPath = await resolveWellKnownType(importPath, this.fileSystem);
    if (wellKnownPath) {
      return wellKnownPath;
    }

    // For WKTs, even if we can't find physical files, protobufjs can handle them
    if (isWellKnownType(importPath)) {
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
   * Returns the base directory used for import resolution.
   */
  getBaseDir(): string {
    return this.#baseDir;
  }

  /**
   * Returns the complete list of include paths used for import resolution.
   */
  getIncludePaths(): string[] {
    return this.#includePaths;
  }
}
