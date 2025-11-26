import * as fs from 'fs';
import * as path from 'path';
import * as protobuf from 'protobufjs';

import { DefaultFileSystem } from './DefaultFileSystem';
import { ProtoSet } from './ProtoSet';
import { createDefaultParseOptions } from './defaults';
import {
  ContentProcessor,
  DirectoryParseOptions,
  FileSystem,
  ParseOptions,
  Proto,
  ResolvedParseOptions,
} from './types';
import { getProtoDirectory } from './utils';

/**
 * Builds the final Proto result object from the parsed root and metadata
 */
const buildProtoResult = (
  root: protobuf.Root,
  protoPath: string,
  content: string,
  parsed: protobuf.IParserResult,
  contentProcessor: ContentProcessor,
): Proto => {
  root.resolveAll();

  const services = contentProcessor.collectAllServices(root);
  const messages = contentProcessor.collectAllMessages(root);
  const enums = contentProcessor.collectAllEnums(root);

  return {
    file: protoPath ? path.basename(protoPath) : 'inline.proto',
    path: protoPath || '',
    idl: content,
    services: services.length > 0 ? services : undefined,
    messages: messages.length > 0 ? messages : undefined,
    enums: enums.length > 0 ? enums : undefined,
    imports: parsed.imports,
  };
};

/**
 * Builds a Proto result object with only definitions from the current file (for parseProtoDirectory)
 */
const buildProtoResultCurrentFileOnly = (
  root: protobuf.Root,
  protoPath: string,
  content: string,
  parsed: protobuf.IParserResult,
  contentProcessor: ContentProcessor,
  keepCase: boolean,
): Proto => {
  root.resolveAll();

  // Parse the content into a clean root to get only this file's definitions
  const cleanRoot = new protobuf.Root();
  const cleanParsed = protobuf.parse(content, cleanRoot, {
    keepCase,
  });

  // Collect definitions only from the clean root (current file only)
  const services = contentProcessor.collectAllServices(cleanParsed.root);
  const messages = contentProcessor.collectAllMessages(cleanParsed.root);
  const enums = contentProcessor.collectAllEnums(cleanParsed.root);

  return {
    file: protoPath ? path.basename(protoPath) : 'inline.proto',
    path: protoPath || '',
    idl: content,
    services: services.length > 0 ? services : undefined,
    messages: messages.length > 0 ? messages : undefined,
    enums: enums.length > 0 ? enums : undefined,
    imports: parsed.imports,
  };
};

/**
 * Builds a Proto result object without resolving extensions (for imported files with resolution errors)
 */
const buildProtoResultWithoutResolve = (
  root: protobuf.Root,
  protoPath: string,
  content: string,
  parsed: protobuf.IParserResult,
  contentProcessor: ContentProcessor,
): Proto | null => {
  try {
    // Don't call root.resolveAll() - this is what causes the extension resolution errors

    // Collect definitions from the parsed root without resolving
    const services = contentProcessor.collectAllServices(parsed.root);
    const messages = contentProcessor.collectAllMessages(parsed.root);
    const enums = contentProcessor.collectAllEnums(parsed.root);

    // Only create a Proto object if we found some definitions
    if (services.length === 0 && messages.length === 0 && enums.length === 0) {
      return null;
    }

    return {
      file: protoPath ? path.basename(protoPath) : 'inline.proto',
      path: protoPath || '',
      idl: content,
      services: services.length > 0 ? services : undefined,
      messages: messages.length > 0 ? messages : undefined,
      enums: enums.length > 0 ? enums : undefined,
      imports: parsed.imports,
    };
  } catch {
    // If we still can't collect definitions, return null
    return null;
  }
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

  // First parse to get imports without loading to pre-validate
  const tempParsed = protobuf.parse(content, new protobuf.Root(), {
    keepCase: resolvedOptions.keepCase,
  });

  // Pre-validate all imports can be resolved
  if (tempParsed.imports) {
    await resolvedOptions.importResolver.validateImports(tempParsed.imports);
  }

  // Create root with import resolver
  const root = new protobuf.Root();
  root.resolvePath = resolvedOptions.importResolver.createProtobufResolver();

  // Parse imported files as separate Proto objects
  const importedProtos: Proto[] = [];
  if (tempParsed.imports) {
    for (const importPath of tempParsed.imports) {
      try {
        const resolvedPath = root.resolvePath('', importPath);
        if (resolvedPath) {
          // Load the import file for protobuf resolution
          await root.load(resolvedPath, { keepCase: resolvedOptions.keepCase });

          // Parse the imported file as a separate Proto object
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
              importedProtos.push(importedProto);
            } catch {
              // If buildProtoResult fails due to unresolvable extensions, create a basic proto object without resolving
              const basicImportedProto = buildProtoResultWithoutResolve(
                cleanRoot,
                resolvedPath,
                importedContent,
                cleanParsed,
                resolvedOptions.contentProcessor,
              );
              if (basicImportedProto) {
                importedProtos.push(basicImportedProto);
              }
            }
          } catch {
            // If we can't read the imported file (e.g., WKTs from protobufjs), skip creating a Proto object
            // The import is still loaded into the root for type resolution
          }
        }
      } catch {
        // Import failed, but continue with main parsing
      }
    }
  }

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
  try {
    const fileSystem = options.fileSystem || new DefaultFileSystem();
    const protoPath = await fileSystem.filePathIfExists(input);
    const protoDir = getProtoDirectory(protoPath);
    const baseDir = protoPath ? protoDir : process.cwd();
    const resolvedOptions = createDefaultParseOptions(baseDir, { ...options, fileSystem });

    const { root, parsed, content, protoPath: finalProtoPath } = await parseProtoContent(input, resolvedOptions);

    // For the single parseProto function, we only return the main proto object
    // The importedProtos are used by parseProtoDirectory to build a complete ProtoSet
    return buildProtoResult(root, finalProtoPath, content, parsed, resolvedOptions.contentProcessor);
  } catch (error) {
    throw new Error(`Failed to parse proto: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(
        `Failed to read directory ${currentDir}: ${error instanceof Error ? error.message : String(error)}`,
      );
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

  // Validate directory exists
  const resolvedDirPath = path.resolve(dirPath);
  try {
    const stats = await fileSystem.stat(resolvedDirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      throw new Error(`Directory not found: ${dirPath}`);
    } else if (nodeError.code === 'EACCES') {
      throw new Error(`Permission denied accessing directory: ${dirPath}`);
    } else {
      throw new Error(`Cannot access directory: ${dirPath} (${nodeError.message || String(error)})`);
    }
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
    includePaths: [...parentDirs, ...(parseOptions.includePaths || [])],
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
      const mainProto = buildProtoResultCurrentFileOnly(
        root,
        finalProtoPath,
        content,
        parsed,
        resolvedOptions.contentProcessor,
        resolvedOptions.keepCase,
      );
      protos.push(mainProto);

      // Collect imported protos (deduplicated by path)
      for (const importedProto of importedProtos) {
        if (!allImportedProtos.has(importedProto.path)) {
          allImportedProtos.set(importedProto.path, importedProto);
        }
      }
    } catch (error) {
      errors.push(`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
};
