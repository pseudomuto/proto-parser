/**
 * Interface for import resolution functionality.
 * Handles async import resolution with support for include paths and well-known types.
 *
 * @public
 * @since 0.2.0
 */
export interface IImportProcessor {
  /** Asynchronously resolves an import path to its full file system path */
  resolveImport(importPath: string): Promise<string | null>;
  /** Validates that all imports can be resolved before loading */
  validateImports(imports: string[]): Promise<void>;
  /** Returns the base directory used for import resolution */
  getBaseDir(): string;
  /** Returns the complete list of include paths used for import resolution */
  getIncludePaths(): string[];
}
