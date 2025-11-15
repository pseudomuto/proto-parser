import * as fs from 'fs';
import * as path from 'path';
import * as protobuf from 'protobufjs';

import { Enum, EnumValue, Field, FieldRule, Message, OneOf, Proto, Service, ServiceMethod } from './types';
import {
  getProtoDirectory,
  getProtoPath,
  getProtoPathSync,
  joinNamespace,
  loadProtoContent,
  loadProtoContentSync,
  resolveImport,
  resolveImportSync,
} from './utils';

/**
 * Configuration options for parsing Protocol Buffer files.
 *
 * @public
 * @since 0.1.0
 */
export interface ParseOptions {
  /** Additional directories to search for imported proto files */
  includePaths?: string[];
  /** Whether to preserve field name casing (default: true) */
  keepCase?: boolean;
  /** Whether to include default values (default: true) */
  defaults?: boolean;
  /** Whether to include oneof definitions (default: true) */
  oneofs?: boolean;
}

const parseFieldRule = (field: protobuf.Field): FieldRule | undefined => {
  if (field.repeated) return 'repeated';
  if (field.required) return 'required';
  if (field.optional) return 'optional';
  return undefined;
};

const parseField = (field: protobuf.Field): Field => {
  return {
    name: field.name,
    type: field.type,
    number: field.id,
    rule: parseFieldRule(field),
    defaultValue: field.defaultValue,
    options: field.options || {},
    oneofIndex: field.parent instanceof protobuf.OneOf ? field.parent.fieldsArray.indexOf(field) : undefined,
  };
};

const parseEnumValue = (value: string, enumObj: protobuf.Enum): EnumValue => {
  return {
    name: value,
    number: enumObj.values[value],
    options: enumObj.valuesOptions?.[value] || {},
  };
};

const parseEnum = (enumObj: protobuf.Enum, namespace: string): Enum => {
  return {
    name: enumObj.name,
    namespace,
    values: Object.keys(enumObj.values).map(key => parseEnumValue(key, enumObj)),
    options: enumObj.options || {},
  };
};

const parseOneof = (oneof: protobuf.OneOf): OneOf => {
  return {
    name: oneof.name,
    fieldNames: oneof.fieldsArray.map(f => f.name),
  };
};

const parseMessage = (messageType: protobuf.Type, namespace: string): Message => {
  const message: Message = {
    name: messageType.name,
    namespace,
    fields: messageType.fieldsArray.map(parseField),
    nestedMessages: [],
    nestedEnums: [],
    oneofs: messageType.oneofsArray.map(parseOneof),
    extensions: [],
    options: messageType.options || {},
  };

  if (messageType.nested) {
    for (const nestedName of Object.keys(messageType.nested)) {
      const nested = messageType.nested[nestedName];
      const nestedNamespace = joinNamespace(namespace, messageType.name);

      if (nested instanceof protobuf.Type) {
        message.nestedMessages = message.nestedMessages || [];
        message.nestedMessages.push(parseMessage(nested, nestedNamespace));
      } else if (nested instanceof protobuf.Enum) {
        message.nestedEnums = message.nestedEnums || [];
        message.nestedEnums.push(parseEnum(nested, nestedNamespace));
      }
    }
  }

  if (messageType.extensions && messageType.extensions.length > 0) {
    message.extensions = messageType.extensions.map(([name, id, type]) => ({
      name: String(name),
      type: String(type),
      extend: messageType.fullName,
      number: Number(id),
    }));
  }

  return message;
};

const parseServiceMethod = (method: protobuf.Method): ServiceMethod => {
  return {
    name: method.name,
    requestType: method.requestType,
    responseType: method.responseType,
    requestStream: method.requestStream || false,
    responseStream: method.responseStream || false,
    options: method.options || {},
  };
};

const parseService = (service: protobuf.Service, namespace: string): Service => {
  return {
    name: service.name,
    namespace,
    methods: service.methodsArray.map(parseServiceMethod),
  };
};

const collectAllMessages = (root: protobuf.Namespace, messages: Message[] = [], currentNamespace = ''): Message[] => {
  if (root.nested) {
    for (const name of Object.keys(root.nested)) {
      const nested = root.nested[name];

      if (nested instanceof protobuf.Type) {
        messages.push(parseMessage(nested, currentNamespace));
      }

      if (
        nested instanceof protobuf.Namespace &&
        !(nested instanceof protobuf.Type) &&
        !(nested instanceof protobuf.Service)
      ) {
        const nestedNamespace = currentNamespace ? `${currentNamespace}.${name}` : name;
        collectAllMessages(nested, messages, nestedNamespace);
      }
    }
  }
  return messages;
};

const collectAllEnums = (root: protobuf.Namespace, enums: Enum[] = [], currentNamespace = ''): Enum[] => {
  if (root.nested) {
    for (const name of Object.keys(root.nested)) {
      const nested = root.nested[name];

      if (nested instanceof protobuf.Enum) {
        enums.push(parseEnum(nested, currentNamespace));
      }

      if (nested instanceof protobuf.Namespace && !(nested instanceof protobuf.Service)) {
        const nestedNamespace = currentNamespace ? `${currentNamespace}.${name}` : name;
        collectAllEnums(nested, enums, nestedNamespace);
      }
    }
  }
  return enums;
};

const collectAllServices = (root: protobuf.Namespace, services: Service[] = [], currentNamespace = ''): Service[] => {
  if (root.nested) {
    for (const name of Object.keys(root.nested)) {
      const nested = root.nested[name];

      if (nested instanceof protobuf.Service) {
        services.push(parseService(nested, currentNamespace));
      }

      if (
        nested instanceof protobuf.Namespace &&
        !(nested instanceof protobuf.Type) &&
        !(nested instanceof protobuf.Service)
      ) {
        const nestedNamespace = currentNamespace ? `${currentNamespace}.${name}` : name;
        collectAllServices(nested, services, nestedNamespace);
      }
    }
  }
  return services;
};

/**
 * Creates a resolvePath function for protobuf root with import resolution logic
 */
const createResolvePath = (isFilePath: boolean, protoDir: string, options: ParseOptions) => {
  return (_origin: string, target: string): string => {
    if (path.isAbsolute(target)) {
      if (!fs.existsSync(target)) {
        throw new Error(`Import not found: ${target}`);
      }
      return target;
    }

    // For file paths, resolve relative to the proto directory and include paths
    // For content strings, resolve relative to current working directory
    const baseDir = isFilePath ? protoDir : process.cwd();
    const resolved = resolveImportSync(target, baseDir, options.includePaths);
    if (resolved) {
      return resolved;
    }

    if (target.startsWith('google/protobuf/')) {
      try {
        const protobufjsPath = require.resolve('protobufjs');
        const protobufjsDir = path.dirname(protobufjsPath);
        const googlePath = path.join(protobufjsDir, '..', target);
        if (fs.existsSync(googlePath)) {
          return googlePath;
        }
        // Also try looking in node_modules
        const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'protobufjs', target);
        if (fs.existsSync(nodeModulesPath)) {
          return nodeModulesPath;
        }
        // If we can't find the WKT file locally, let protobufjs handle it
        // This allows protobufjs to use its internal WKT definitions
        return target;
      } catch {
        // Fall through to error
      }
    }

    throw new Error(`Cannot resolve import: ${target}`);
  };
};

/**
 * Validates that all imports can be resolved before loading
 */
const validateImports = (imports: string[], protoDir: string, options: ParseOptions): void => {
  for (const importPath of imports) {
    // Skip validation for Google WKTs as they are handled specially by protobufjs
    if (importPath.startsWith('google/protobuf/')) {
      continue;
    }
    const resolved = resolveImportSync(importPath, protoDir, options.includePaths);
    if (!resolved) {
      throw new Error(`Cannot resolve import: ${importPath}`);
    }
  }
};

/**
 * Builds the final Proto result object from the parsed root and metadata
 */
const buildProtoResult = (
  root: protobuf.Root,
  protoPath: string,
  content: string,
  parsed: protobuf.IParserResult,
): Proto => {
  root.resolveAll();

  const services = collectAllServices(root);
  const messages = collectAllMessages(root);
  const enums = collectAllEnums(root);

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
 * Handles parsing for file paths - validates imports then loads the file
 */
const parseFileContent = async (
  content: string,
  protoPath: string,
  protoDir: string,
  options: ParseOptions,
  loadFn: (root: protobuf.Root, path: string) => Promise<void> | void,
): Promise<{ root: protobuf.Root; parsed: protobuf.IParserResult }> => {
  // First parse to get imports without loading to pre-validate
  const tempParsed = protobuf.parse(content, new protobuf.Root(), {
    keepCase: options.keepCase !== false,
  });

  // Pre-validate all imports can be resolved
  if (tempParsed.imports) {
    validateImports(tempParsed.imports, protoDir, options);
  }

  // For file paths, we need to use protobuf.parse() instead of root.load()
  // to ensure keepCase option is respected. Load imports first, then parse main content.
  const root = new protobuf.Root();
  root.resolvePath = createResolvePath(true, protoDir, options);

  // Load all imports first
  if (tempParsed.imports) {
    for (const importPath of tempParsed.imports) {
      try {
        const resolvedPath = root.resolvePath('', importPath);
        if (resolvedPath) {
          await loadFn(root, resolvedPath);
        }
      } catch (err) {
        console.warn(`Failed to load import: ${importPath}`, err);
      }
    }
  }

  // Now parse the main content into the root that has all imports loaded
  const parsed = protobuf.parse(content, root, {
    keepCase: options.keepCase !== false,
  });

  return { root, parsed };
};

/**
 * Handles parsing for content strings - loads imports then parses content
 */
const parseContentString = async (
  content: string,
  options: ParseOptions,
  resolveImportFn: (
    importPath: string,
    baseDir: string,
    includePaths?: string[],
  ) => Promise<string | null> | string | null,
  loadFn: (root: protobuf.Root, path: string) => Promise<void> | void,
): Promise<{ root: protobuf.Root; parsed: protobuf.IParserResult }> => {
  // For content strings, first parse to get imports, then load imports, then parse again
  const tempRoot = new protobuf.Root();
  const parsed = protobuf.parse(content, tempRoot, {
    keepCase: options.keepCase !== false,
  });

  // Pre-validate all imports can be resolved (consistent with file path behavior)
  if (parsed.imports) {
    validateImports(parsed.imports, process.cwd(), options);
  }

  const root = new protobuf.Root();
  root.resolvePath = createResolvePath(false, '', options);

  // Load all imports first
  if (parsed.imports) {
    for (const importPath of parsed.imports) {
      try {
        const resolvedPath =
          (await resolveImportFn(importPath, process.cwd(), options.includePaths)) || root.resolvePath('', importPath);
        if (resolvedPath) {
          await loadFn(root, resolvedPath);
        }
      } catch (err) {
        // Import resolution was already validated above, so this should be rare
        console.warn(`Failed to load import: ${importPath}`, err);
      }
    }
  }

  // Now parse the content into the root that has all imports loaded
  protobuf.parse(content, root, {
    keepCase: options.keepCase !== false,
  });

  return { root, parsed };
};

/**
 * Core parsing logic shared between async and sync implementations
 */
const parseProtoCore = async (
  input: string,
  options: ParseOptions,
  loadContentFn: (input: string) => Promise<string> | string,
  getPathFn: (input: string) => Promise<string> | string,
  loadRootFn: (root: protobuf.Root, path: string) => Promise<void> | void,
  resolveImportFn: (
    importPath: string,
    baseDir: string,
    includePaths?: string[],
  ) => Promise<string | null> | string | null,
): Promise<Proto> => {
  try {
    const content = await loadContentFn(input);
    const protoPath = await getPathFn(input);
    const protoDir = getProtoDirectory(protoPath);
    const isFilePath = protoPath !== '';

    let result: { root: protobuf.Root; parsed: protobuf.IParserResult };

    if (isFilePath) {
      result = await parseFileContent(content, protoPath, protoDir, options, loadRootFn);
    } else {
      result = await parseContentString(content, options, resolveImportFn, loadRootFn);
    }

    return buildProtoResult(result.root, protoPath, content, result.parsed);
  } catch (error) {
    throw new Error(`Failed to parse proto: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Synchronous core parsing logic
 */
const parseProtoCoreSync = (
  input: string,
  options: ParseOptions,
  loadContentFn: (input: string) => string,
  getPathFn: (input: string) => string,
  loadRootFn: (root: protobuf.Root, path: string) => void,
  resolveImportFn: (importPath: string, baseDir: string, includePaths?: string[]) => string | null,
): Proto => {
  try {
    const content = loadContentFn(input);
    const protoPath = getPathFn(input);
    const protoDir = getProtoDirectory(protoPath);
    const isFilePath = protoPath !== '';

    let result: { root: protobuf.Root; parsed: protobuf.IParserResult };

    if (isFilePath) {
      // Sync version of parseFileContent
      const tempParsed = protobuf.parse(content, new protobuf.Root(), {
        keepCase: options.keepCase !== false,
      });

      if (tempParsed.imports) {
        validateImports(tempParsed.imports, protoDir, options);
      }

      // For file paths, we need to use protobuf.parse() instead of root.loadSync()
      // to ensure keepCase option is respected. Load imports first, then parse main content.
      const root = new protobuf.Root();
      root.resolvePath = createResolvePath(true, protoDir, options);

      // Load all imports first
      if (tempParsed.imports) {
        for (const importPath of tempParsed.imports) {
          try {
            const resolvedPath = root.resolvePath('', importPath);
            if (resolvedPath) {
              loadRootFn(root, resolvedPath);
            }
          } catch (err) {
            console.warn(`Failed to load import: ${importPath}`, err);
          }
        }
      }

      // Now parse the main content into the root that has all imports loaded
      const parsed = protobuf.parse(content, root, {
        keepCase: options.keepCase !== false,
      });

      result = { root, parsed };
    } else {
      // Sync version of parseContentString
      const tempRoot = new protobuf.Root();
      const parsed = protobuf.parse(content, tempRoot, {
        keepCase: options.keepCase !== false,
      });

      // Pre-validate all imports can be resolved (consistent with file path behavior)
      if (parsed.imports) {
        validateImports(parsed.imports, process.cwd(), options);
      }

      const root = new protobuf.Root();
      root.resolvePath = createResolvePath(false, '', options);

      if (parsed.imports) {
        for (const importPath of parsed.imports) {
          try {
            const resolvedPath =
              resolveImportFn(importPath, process.cwd(), options.includePaths) || root.resolvePath('', importPath);
            if (resolvedPath) {
              loadRootFn(root, resolvedPath);
            }
          } catch (err) {
            // Import resolution was already validated above, so this should be rare
            console.warn(`Failed to load import: ${importPath}`, err);
          }
        }
      }

      protobuf.parse(content, root, {
        keepCase: options.keepCase !== false,
      });

      result = { root, parsed };
    }

    return buildProtoResult(result.root, protoPath, content, result.parsed);
  } catch (error) {
    throw new Error(`Failed to parse proto: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  return parseProtoCore(
    input,
    options,
    loadProtoContent,
    getProtoPath,
    async (root, path) => {
      await root.load(path, { keepCase: options.keepCase !== false });
    },
    resolveImport,
  );
};

/**
 * Synchronously parses a Protocol Buffer file or content string.
 *
 * This is the synchronous version of {@link parseProto}. It provides the same
 * functionality but uses blocking file system operations.
 *
 * @param input - Either a file path to a .proto file or proto content string
 * @param options - Parsing options to customize behavior
 * @returns A Proto object containing all parsed definitions
 * @throws {Error} When the proto file cannot be parsed, read, or imports cannot be resolved
 *
 * @example
 * ```typescript
 * // Parse from file path synchronously
 * const proto = parseProtoSync('./path/to/file.proto');
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const parseProtoSync = (input: string, options: ParseOptions = {}): Proto => {
  return parseProtoCoreSync(
    input,
    options,
    loadProtoContentSync,
    getProtoPathSync,
    (root, path) => {
      root.loadSync(path, { keepCase: options.keepCase !== false });
    },
    resolveImportSync,
  );
};
