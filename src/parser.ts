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
 * Asynchronously parses a Protocol Buffer file or content string.
 *
 * This function can accept either a file path to a .proto file or the actual
 * proto content as a string. It will parse all messages, services, enums,
 * and other definitions, including nested structures and imports.
 *
 * @param input - Either a file path to a .proto file or proto content string
 * @param options - Parsing options to customize behavior
 * @returns A Promise that resolves to a Proto object containing all parsed definitions
 * @throws {Error} When the proto file cannot be parsed or read
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
  const content = await loadProtoContent(input);
  const protoPath = await getProtoPath(input);
  const protoDir = getProtoDirectory(protoPath);

  const root = new protobuf.Root();
  root.resolvePath = (_origin: string, target: string): string => {
    if (path.isAbsolute(target)) {
      return target;
    }

    // Note: resolvePath must be sync, so we use sync version here
    const resolved = resolveImportSync(target, protoDir, options.includePaths);
    if (resolved) {
      return resolved;
    }

    if (target.startsWith('google/protobuf/')) {
      try {
        const protobufjsPath = require.resolve('protobufjs');
        const protobufjsDir = path.dirname(protobufjsPath);
        const googlePath = path.join(protobufjsDir, '..', target);
        return googlePath;
      } catch {
        console.warn(`Failed to resolve Well-Known Type: ${target}`);
      }
    }

    return path.join(protoDir, target);
  };

  try {
    const parsed = protobuf.parse(content, root, {
      keepCase: options.keepCase !== false,
    });

    if (parsed.imports) {
      for (const importPath of parsed.imports) {
        try {
          const resolvedPath =
            (await resolveImport(importPath, protoDir, options.includePaths)) || root.resolvePath('', importPath);
          if (resolvedPath) {
            await root.load(resolvedPath);
          }
        } catch (err) {
          console.warn(`Failed to load import: ${importPath}`, err);
        }
      }
    }

    root.resolveAll();

    const services = collectAllServices(root);
    const messages = collectAllMessages(root);
    const enums = collectAllEnums(root);

    const proto: Proto = {
      file: protoPath ? path.basename(protoPath) : 'inline.proto',
      path: protoPath || '',
      idl: content,
      services: services.length > 0 ? services : undefined,
      messages: messages.length > 0 ? messages : undefined,
      enums: enums.length > 0 ? enums : undefined,
      imports: parsed.imports,
    };

    return proto;
  } catch (error) {
    throw new Error(`Failed to parse proto: ${error instanceof Error ? error.message : String(error)}`);
  }
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
 * @throws {Error} When the proto file cannot be parsed or read
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
  const content = loadProtoContentSync(input);
  const protoPath = getProtoPathSync(input);
  const protoDir = getProtoDirectory(protoPath);

  const root = new protobuf.Root();
  root.resolvePath = (_origin: string, target: string): string => {
    if (path.isAbsolute(target)) {
      return target;
    }

    const resolved = resolveImportSync(target, protoDir, options.includePaths);
    if (resolved) {
      return resolved;
    }

    if (target.startsWith('google/protobuf/')) {
      try {
        const protobufjsPath = require.resolve('protobufjs');
        const protobufjsDir = path.dirname(protobufjsPath);
        const googlePath = path.join(protobufjsDir, '..', target);
        return googlePath;
      } catch {
        console.warn(`Failed to resolve Well-Known Type: ${target}`);
      }
    }

    return path.join(protoDir, target);
  };

  try {
    const parsed = protobuf.parse(content, root, {
      keepCase: options.keepCase !== false,
    });

    if (parsed.imports) {
      for (const importPath of parsed.imports) {
        try {
          const resolvedPath = root.resolvePath('', importPath);
          if (resolvedPath) {
            root.loadSync(resolvedPath);
          }
        } catch (err) {
          console.warn(`Failed to load import: ${importPath}`, err);
        }
      }
    }

    root.resolveAll();

    const services = collectAllServices(root);
    const messages = collectAllMessages(root);
    const enums = collectAllEnums(root);

    const proto: Proto = {
      file: protoPath ? path.basename(protoPath) : 'inline.proto',
      path: protoPath || '',
      idl: content,
      services: services.length > 0 ? services : undefined,
      messages: messages.length > 0 ? messages : undefined,
      enums: enums.length > 0 ? enums : undefined,
      imports: parsed.imports,
    };

    return proto;
  } catch (error) {
    throw new Error(`Failed to parse proto: ${error instanceof Error ? error.message : String(error)}`);
  }
};
