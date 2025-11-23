import * as fs from 'fs';
import * as path from 'path';
import * as protobuf from 'protobufjs';

import { ProtoSet } from './ProtoSet';
import { createDefaultParseOptions } from './defaults';
import { ContentProcessor, DirectoryParseOptions, ParseOptions, Proto, ResolvedParseOptions } from './types';
import { getProtoDirectory, getProtoPath, loadProtoContent } from './utils';

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
 * Handles parsing for any input type - unified async parsing logic
 */
const parseProtoContent = async (
  input: string,
  resolvedOptions: ResolvedParseOptions,
): Promise<{ root: protobuf.Root; parsed: protobuf.IParserResult; content: string; protoPath: string }> => {
  const content = await loadProtoContent(input);
  const protoPath = await getProtoPath(input);

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

  // Load all imports first using the root's resolvePath
  if (tempParsed.imports) {
    for (const importPath of tempParsed.imports) {
      try {
        const resolvedPath = root.resolvePath('', importPath);
        if (resolvedPath) {
          await root.load(resolvedPath, { keepCase: resolvedOptions.keepCase });
        }
      } catch (err) {
        console.warn(`Failed to load import: ${importPath}`, err);
      }
    }
  }

  // Parse the main content into the root that has all imports loaded
  const parsed = protobuf.parse(content, root, {
    keepCase: resolvedOptions.keepCase,
  });

  return { root, parsed, content, protoPath };
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
    const protoPath = await getProtoPath(input);
    const protoDir = getProtoDirectory(protoPath);
    const baseDir = protoPath ? protoDir : process.cwd();
    const resolvedOptions = createDefaultParseOptions(baseDir, options);

    const { root, parsed, content, protoPath: finalProtoPath } = await parseProtoContent(input, resolvedOptions);
    return buildProtoResult(root, finalProtoPath, content, parsed, resolvedOptions.contentProcessor);
  } catch (error) {
    throw new Error(`Failed to parse proto: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Asynchronously finds all .proto files in a directory and returns their paths.
 */
const findProtoFiles = async (dirPath: string, recursive: boolean = true): Promise<string[]> => {
  const protoFiles: string[] = [];

  const scanDirectory = async (currentDir: string): Promise<void> => {
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

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

  // Validate directory exists
  const resolvedDirPath = path.resolve(dirPath);
  try {
    const stats = await fs.promises.stat(resolvedDirPath);
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
  const protoFilePaths = await findProtoFiles(resolvedDirPath, recursive);

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
    includePaths: [...parentDirs, ...(parseOptions.includePaths || [])],
  };

  // Parse all proto files
  const protos: Proto[] = [];
  const errors: string[] = [];

  for (const filePath of protoFilePaths) {
    try {
      const proto = await parseProto(filePath, enhancedOptions);
      protos.push(proto);
    } catch (error) {
      errors.push(`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0 && protos.length === 0) {
    throw new Error(`Failed to parse any proto files:\n${errors.join('\n')}`);
  } else if (errors.length > 0) {
    console.warn(`Some proto files failed to parse:\n${errors.join('\n')}`);
  }

  return new ProtoSet(protos);
};
