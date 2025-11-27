import { DefaultFileSystem } from './DefaultFileSystem';
import { ProtoParser } from './proto';
import { ImportProcessor } from './resolvers/ImportProcessor';
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
    contentProcessor: options.contentProcessor || new ProtoParser(),
    importResolver: options.importResolver || new ImportProcessor(baseDir, fileSystem, options),
    fileSystem,
  };
}
