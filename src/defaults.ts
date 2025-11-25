import { DefaultContentProcessor } from './DefaultContentProcessor';
import { DefaultFileSystem } from './DefaultFileSystem';
import { DefaultImportResolver } from './DefaultImportResolver';
import { ParseOptions, ResolvedParseOptions } from './types';

/**
 * Creates a fully resolved ParseOptions object with all defaults populated.
 * This ensures consistent behavior across all parsing functions and eliminates
 * the need for null checks throughout the codebase.
 *
 * @param baseDir - Base directory for import resolution
 * @param options - Partial options to merge with defaults
 * @returns Complete ParseOptions with all fields populated
 *
 * @internal
 */
export function createDefaultParseOptions(baseDir: string, options: ParseOptions = {}): ResolvedParseOptions {
  const fileSystem = options.fileSystem || new DefaultFileSystem();
  return {
    includePaths: options.includePaths || [],
    keepCase: options.keepCase !== false,
    defaults: options.defaults !== false,
    oneofs: options.oneofs !== false,
    contentProcessor: options.contentProcessor || new DefaultContentProcessor(),
    importResolver: options.importResolver || new DefaultImportResolver(baseDir, fileSystem, options),
    fileSystem,
  };
}
