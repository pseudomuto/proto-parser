import * as fs from 'fs';
import * as path from 'path';
import * as protobuf from 'protobufjs';

import { DefaultFileSystem } from './DefaultFileSystem';
import { ProtoSet } from './ProtoSet';
import { createDefaultParseOptions } from './defaults';
import { ProtoBuildError, ProtoParseError, getErrorMessage, isNodeError } from './errors';
import { collectProtoDefinitions } from './proto';
import { DirectoryParseOptions, FileSystem, IProtoParser, ParseOptions, Proto, ResolvedParseOptions } from './types';
import { getProtoDirectory } from './utils';
import { isWellKnownType } from './utils/wellKnownTypes';

/**
 * Options for building Proto result objects
 */
interface BuildProtoOptions {
  /** Whether to resolve all references (default: true) */
  resolveAll?: boolean;
  /** Whether to use only current file definitions (default: false) */
  currentFileOnly?: boolean;
  /** Keep case option for parsing (default: true when currentFileOnly is true) */
  keepCase?: boolean;
  /** Whether to return null if no definitions found (default: false) */
  allowEmpty?: boolean;
}

/**
 * Unified function to build Proto result objects with different strategies
 */
const buildProtoResult = (
  root: protobuf.Root,
  protoPath: string,
  content: string,
  parsed: protobuf.IParserResult,
  contentProcessor: IProtoParser,
  options: BuildProtoOptions = {},
): Proto | null => {
  const { resolveAll = true, currentFileOnly = false, keepCase = true, allowEmpty = false } = options;

  try {
    // Resolve references if requested
    if (resolveAll) {
      root.resolveAll();
    }

    // Determine which root to use for collecting definitions
    let targetRoot: protobuf.Root;
    let targetParsed: protobuf.IParserResult;

    if (currentFileOnly) {
      // Parse the content into a clean root to get only this file's definitions
      const cleanRoot = new protobuf.Root();
      targetParsed = protobuf.parse(content, cleanRoot, { keepCase });
      targetRoot = targetParsed.root;
    } else {
      // Use the provided root and parsed result
      targetRoot = resolveAll ? root : parsed.root;
      targetParsed = parsed;
    }

    // Collect definitions from the target root
    const { services, messages, enums } = collectProtoDefinitions(targetRoot, contentProcessor);

    // Check if we found any definitions
    if (!allowEmpty && services.length === 0 && messages.length === 0 && enums.length === 0) {
      return null;
    }

    return {
      file: protoPath ? path.basename(protoPath) : 'inline.proto',
      path: protoPath || '',
      idl: content,
      services: services.length > 0 ? services : undefined,
      messages: messages.length > 0 ? messages : undefined,
      enums: enums.length > 0 ? enums : undefined,
      imports: targetParsed.imports || parsed.imports,
    };
  } catch (err) {
    // If allowEmpty is true and we failed to build, return null
    if (allowEmpty) {
      return null;
    }
    // Otherwise, re-throw the error for proper handling
    throw err;
  }
};

/**
 * Pre-validates that all imports in a proto file can be resolved
 */
const validateProtoImports = async (
  content: string,
  resolvedOptions: ResolvedParseOptions,
): Promise<protobuf.IParserResult> => {
  const tempParsed = protobuf.parse(content, new protobuf.Root(), {
    keepCase: resolvedOptions.keepCase,
  });

  if (tempParsed.imports) {
    await resolvedOptions.importResolver.validateImports(tempParsed.imports);
  }

  return tempParsed;
};

/**
 * Creates a protobufjs-compatible resolver function from resolved options.
 * This adapts the async import processor interface to protobufjs's synchronous resolver interface.
 */
const createProtobufResolver = (
  resolvedOptions: ResolvedParseOptions,
): ((origin: string, target: string) => string) => {
  return (_origin: string, target: string): string => {
    if (path.isAbsolute(target)) {
      if (!fs.existsSync(target)) {
        throw new Error(`Import not found: ${target}`);
      }
      return target;
    }

    // Get include paths from the import resolver using the interface method
    const includePaths = resolvedOptions.importResolver.getIncludePaths();

    // Search through include paths first (even for google/protobuf files)
    // This ensures we use the complete versions from Buf modules
    for (const searchPath of includePaths) {
      const fullPath = path.join(searchPath, target);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // Only fall back to well-known types if not found in include paths
    if (isWellKnownType(target)) {
      return target;
    }

    throw new Error(`Cannot resolve import: ${target}`);
  };
};

/**
 * Processes a single import, loading it into the root and creating a Proto object
 */
const processImport = async (
  importPath: string,
  root: protobuf.Root,
  resolvedOptions: ResolvedParseOptions,
): Promise<Proto | null> => {
  const resolvedPath = root.resolvePath('', importPath);
  if (!resolvedPath) return null;

  // Load the import file for protobuf resolution
  await root.load(resolvedPath, { keepCase: resolvedOptions.keepCase });

  try {
    const importedContent = await resolvedOptions.fileSystem.readFile(resolvedPath, 'utf8');

    // For imported files, create a clean root and parse only the definitions from that file
    const cleanRoot = new protobuf.Root();
    const cleanParsed = protobuf.parse(importedContent, cleanRoot, { keepCase: resolvedOptions.keepCase });

    try {
      // Try to create the proto object - this might fail for files with unresolvable extensions
      const importedProto = buildProtoResult(
        cleanRoot,
        resolvedPath,
        importedContent,
        cleanParsed,
        resolvedOptions.contentProcessor,
      );
      return importedProto;
    } catch {
      // If buildProtoResult fails due to unresolvable extensions, create a basic proto object without resolving
      const basicImportedProto = buildProtoResult(
        cleanRoot,
        resolvedPath,
        importedContent,
        cleanParsed,
        resolvedOptions.contentProcessor,
        { resolveAll: false, allowEmpty: true },
      );
      return basicImportedProto;
    }
  } catch {
    // If we can't read the imported file (e.g., WKTs from protobufjs), skip creating a Proto object
    // The import is still loaded into the root for type resolution
    return null;
  }
};

/**
 * Processes all imports in a proto file
 */
const processAllImports = async (
  imports: string[] | undefined,
  root: protobuf.Root,
  resolvedOptions: ResolvedParseOptions,
): Promise<Proto[]> => {
  const importedProtos: Proto[] = [];

  if (!imports) return importedProtos;

  for (const importPath of imports) {
    try {
      const importedProto = await processImport(importPath, root, resolvedOptions);
      if (importedProto) {
        importedProtos.push(importedProto);
      }
    } catch {
      // Import failed, but continue with other imports
    }
  }

  return importedProtos;
};

/**
 * Handles parsing for any input type - unified async parsing logic
 */
const parseProtoContent = async (
  input: string,
  resolvedOptions: ResolvedParseOptions,
): Promise<{
  root: protobuf.Root;
  parsed: protobuf.IParserResult;
  content: string;
  protoPath: string;
  importedProtos: Proto[];
}> => {
  const { content, filePath: protoPath } = await resolvedOptions.fileSystem.readFileOrLiteral(input);

  // Pre-validate imports
  const tempParsed = await validateProtoImports(content, resolvedOptions);

  // Create root with import resolver
  const root = new protobuf.Root();
  root.resolvePath = createProtobufResolver(resolvedOptions);

  // Process all imported files
  const importedProtos = await processAllImports(tempParsed.imports, root, resolvedOptions);

  // Parse the main content into the root that has all imports loaded
  const parsed = protobuf.parse(content, root, {
    keepCase: resolvedOptions.keepCase,
  });

  return { root, parsed, content, protoPath, importedProtos };
};

/**
 * Asynchronously parses a Protocol Buffer file or content string.
 *
 * This function can accept either a file path to a .proto file or the actual
 * proto content as a string. It will parse all messages, services, enums,
 * and other definitions, including nested structures and imports.
 *
 * @param input - Either a file path to a .proto file or proto content string
 * @param options - Parsing options to customize behavior
 * @returns A Promise that resolves to a Proto object containing all parsed definitions
 * @throws {Error} When the proto file cannot be parsed, read, or imports cannot be resolved
 *
 * @example
 * ```typescript
 * // Parse from file path
 * const proto = await parseProto('./path/to/file.proto');
 *
 * // Parse from content string
 * const protoContent = `
 *   syntax = "proto3";
 *   message User {
 *     string name = 1;
 *   }
 * `;
 * const proto = await parseProto(protoContent);
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const parseProto = async (input: string, options: ParseOptions = {}): Promise<Proto> => {
  const providers = options.moduleProviders || [];
  let protoPath: string | undefined;

  try {
    // Get include paths from module providers
    const moduleIncludePaths: string[] = [];
    for (const provider of providers) {
      const paths = await provider.getIncludePaths();
      moduleIncludePaths.push(...paths);
    }

    // Merge with existing include paths (module paths first for priority)
    const enhancedOptions = {
      ...options,
      includePaths: [...moduleIncludePaths, ...(options.includePaths || [])],
    };

    const fileSystem = enhancedOptions.fileSystem || new DefaultFileSystem();
    protoPath = await fileSystem.filePathIfExists(input);
    const protoDir = getProtoDirectory(protoPath);
    const baseDir = protoPath ? protoDir : process.cwd();
    const resolvedOptions = createDefaultParseOptions(baseDir, { ...enhancedOptions, fileSystem });

    const { root, parsed, content, protoPath: finalProtoPath } = await parseProtoContent(input, resolvedOptions);

    // For the single parseProto function, we only return the main proto object
    // The importedProtos are used by parseProtoDirectory to build a complete ProtoSet
    const result = buildProtoResult(root, finalProtoPath, content, parsed, resolvedOptions.contentProcessor);
    if (!result) {
      throw new ProtoBuildError('No definitions found in proto file', finalProtoPath);
    }
    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    throw new ProtoParseError(`Failed to parse proto: ${errorMessage}`, protoPath || input, error);
  } finally {
    // Cleanup all providers
    await Promise.all(providers.map(p => p.dispose()));
  }
};

/**
 * Asynchronously finds all .proto files in a directory and returns their paths.
 */
const findProtoFiles = async (
  dirPath: string,
  fileSystem: FileSystem,
  recursive: boolean = true,
): Promise<string[]> => {
  const protoFiles: string[] = [];

  const scanDirectory = async (currentDir: string): Promise<void> => {
    try {
      const entries = (await fileSystem.readDir(currentDir, { withFileTypes: true })) as fs.Dirent[];

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isFile() && entry.name.endsWith('.proto')) {
          protoFiles.push(fullPath);
        } else if (entry.isDirectory() && recursive) {
          await scanDirectory(fullPath);
        }
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      throw new ProtoParseError(`Failed to read directory ${currentDir}: ${errorMessage}`, currentDir, error);
    }
  };

  await scanDirectory(dirPath);
  return protoFiles.sort();
};

/**
 * Asynchronously parses all Protocol Buffer files in a directory.
 *
 * This function recursively searches a directory for .proto files and parses
 * each one, returning a ProtoSet containing all parsed definitions. It handles
 * imports between files within the same directory structure.
 *
 * @param dirPath - Path to the directory containing .proto files
 * @param options - Parsing options to customize behavior
 * @returns A Promise that resolves to a ProtoSet containing all parsed proto files
 * @throws {Error} When the directory cannot be read or proto files cannot be parsed
 *
 * @example
 * ```typescript
 * // Parse all protos in a directory recursively
 * const protoSet = await parseProtoDirectory('./protos');
 *
 * // Parse with custom options
 * const protoSet = await parseProtoDirectory('./protos', {
 *   recursive: false,
 *   includePaths: ['./imports']
 * });
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const parseProtoDirectory = async (dirPath: string, options: DirectoryParseOptions = {}): Promise<ProtoSet> => {
  const { recursive = true, ...parseOptions } = options;
  const fileSystem = options.fileSystem || new DefaultFileSystem();
  const providers = parseOptions.moduleProviders || [];

  try {
    // Get include paths from module providers
    const moduleIncludePaths: string[] = [];
    for (const provider of providers) {
      const paths = await provider.getIncludePaths();
      moduleIncludePaths.push(...paths);
    }

    // Validate directory exists
    const resolvedDirPath = path.resolve(dirPath);
    try {
      const stats = await fileSystem.stat(resolvedDirPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }
    } catch (error) {
      if (isNodeError(error)) {
        if (error.code === 'ENOENT') {
          throw new ProtoParseError(`Directory not found: ${dirPath}`, dirPath, error);
        } else if (error.code === 'EACCES') {
          throw new ProtoParseError(`Permission denied accessing directory: ${dirPath}`, dirPath, error);
        }
      }
      const errorMessage = getErrorMessage(error);
      throw new ProtoParseError(`Cannot access directory: ${dirPath} (${errorMessage})`, dirPath, error);
    }

    // Find all proto files
    const protoFilePaths = await findProtoFiles(resolvedDirPath, fileSystem, recursive);

    if (protoFilePaths.length === 0) {
      return new ProtoSet([]);
    }

    // Add the directory and its parent directories to include paths to resolve imports between files
    // This helps resolve imports that use relative paths from the project root
    const parentDirs = [];
    let currentDir = resolvedDirPath;
    while (currentDir !== path.dirname(currentDir)) {
      parentDirs.push(currentDir);
      currentDir = path.dirname(currentDir);
    }

    const enhancedOptions: ParseOptions = {
      ...parseOptions,
      fileSystem,
      includePaths: [...moduleIncludePaths, ...parentDirs, ...(parseOptions.includePaths || [])],
    };

    // Parse all proto files and collect imported protos
    const protos: Proto[] = [];
    const allImportedProtos = new Map<string, Proto>(); // Use Map to deduplicate by path
    const errors: string[] = [];

    for (const filePath of protoFilePaths) {
      try {
        const resolvedOptions = createDefaultParseOptions(resolvedDirPath, { ...enhancedOptions, fileSystem });
        const {
          root,
          parsed,
          content,
          protoPath: finalProtoPath,
          importedProtos,
        } = await parseProtoContent(filePath, resolvedOptions);

        // Add the main proto - use current file only version for proper separation
        const mainProto = buildProtoResult(root, finalProtoPath, content, parsed, resolvedOptions.contentProcessor, {
          currentFileOnly: true,
          keepCase: resolvedOptions.keepCase,
        });
        if (!mainProto) {
          throw new ProtoBuildError('No definitions found in proto file', finalProtoPath);
        }
        protos.push(mainProto);

        // Collect imported protos (deduplicated by path)
        for (const importedProto of importedProtos) {
          if (!allImportedProtos.has(importedProto.path)) {
            allImportedProtos.set(importedProto.path, importedProto);
          }
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        errors.push(`Failed to parse ${filePath}: ${errorMessage}`);
      }
    }

    // Add all imported protos to the main protos array
    protos.push(...allImportedProtos.values());

    if (errors.length > 0 && protos.length === 0) {
      throw new Error(`Failed to parse any proto files:\n${errors.join('\n')}`);
    }
    // Note: If there are partial failures, they are tracked in the errors array
    // but we continue with the successfully parsed files

    return new ProtoSet(protos);
  } catch (error) {
    // If it's already a ProtoParseError, just re-throw it
    if (error instanceof ProtoParseError) {
      throw error;
    }
    const errorMessage = getErrorMessage(error);
    throw new ProtoParseError(`Failed to parse proto directory: ${errorMessage}`, dirPath, error);
  } finally {
    // Cleanup all providers
    await Promise.all(providers.map(p => p.dispose()));
  }
};
