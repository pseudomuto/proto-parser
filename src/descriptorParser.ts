import * as protobuf from 'protobufjs';

import { DefaultContentProcessor } from './DefaultContentProcessor';
import { DefaultFileSystem } from './DefaultFileSystem';
import { Enum, FileDescriptorSetParseOptions, Message, Proto, Service } from './types';

// TypeScript interfaces for FileDescriptor objects
// We define our own simplified FileDescriptor interfaces rather than using
// protobufjs/ext/descriptor types because:
// 1. We only need a subset of fields for parsing and reconstruction
// 2. The ext/descriptor types are in an optional extension package
// 3. Our simplified types provide better type safety for our specific use case
// 4. These interfaces match exactly what we extract and use in practice

/**
 * Represents a field descriptor from a protobuf FileDescriptor.
 * Used for parsing and reconstructing proto field definitions.
 *
 * @public
 * @since 0.1.0
 */
export interface FieldDescriptor {
  /** The name of the field */
  name: string;
  /** The field number (unique within the message) */
  number: number;
  /** Field label: 1=OPTIONAL, 2=REQUIRED, 3=REPEATED */
  label?: number;
  /** Protobuf type enum value */
  type?: number;
  /** Type name for message/enum references */
  typeName?: string;
  /** Index of the oneof declaration this field belongs to */
  oneofIndex?: number;
  /** Whether this field is explicitly marked as optional in proto3 */
  proto3Optional?: boolean;
}

/**
 * Represents a message descriptor from a protobuf FileDescriptor.
 * Contains all information needed to reconstruct a protobuf message definition.
 *
 * @public
 * @since 0.1.0
 */
export interface MessageDescriptor {
  /** The name of the message */
  name: string;
  /** Array of field descriptors defined in this message */
  field?: FieldDescriptor[];
  /** Array of nested enum descriptors */
  enumType?: EnumDescriptor[];
  /** Array of nested message descriptors */
  nestedType?: MessageDescriptor[];
  /** Array of oneof declarations with their names */
  oneofDecl?: Array<{ name: string }>;
}

/**
 * Represents an enum value descriptor from a protobuf FileDescriptor.
 * Contains the name and numeric value of an enum constant.
 *
 * @public
 * @since 0.1.0
 */
export interface EnumValueDescriptor {
  /** The name of the enum value */
  name: string;
  /** The numeric value assigned to this enum constant */
  number: number;
}

/**
 * Represents an enum descriptor from a protobuf FileDescriptor.
 * Contains the enum name and its possible values.
 *
 * @public
 * @since 0.1.0
 */
export interface EnumDescriptor {
  /** The name of the enum */
  name: string;
  /** Array of enum value descriptors */
  value?: EnumValueDescriptor[];
}

/**
 * Represents a service method descriptor from a protobuf FileDescriptor.
 * Contains all information needed to reconstruct a gRPC service method definition.
 *
 * @public
 * @since 0.1.0
 */
export interface MethodDescriptor {
  /** The name of the method */
  name: string;
  /** The input message type name */
  inputType: string;
  /** The output message type name */
  outputType: string;
  /** Whether the client streams multiple requests */
  clientStreaming?: boolean;
  /** Whether the server streams multiple responses */
  serverStreaming?: boolean;
}

/**
 * Represents a service descriptor from a protobuf FileDescriptor.
 * Contains the service name and its RPC methods.
 *
 * @public
 * @since 0.1.0
 */
export interface ServiceDescriptor {
  /** The name of the service */
  name: string;
  /** Array of method descriptors for this service */
  method?: MethodDescriptor[];
}

/**
 * Represents a file descriptor from a protobuf FileDescriptorSet.
 * Contains all information about a single .proto file including its messages,
 * services, enums, and metadata.
 *
 * @public
 * @since 0.1.0
 */
export interface FileDescriptor {
  /** The name of the proto file */
  name?: string;
  /** The package declaration of the file */
  package?: string;
  /** The syntax version (proto2 or proto3) */
  syntax?: string;
  /** Array of import dependencies */
  dependency?: string[];
  /** Array of message descriptors defined in this file */
  messageType?: MessageDescriptor[];
  /** Array of enum descriptors defined in this file */
  enumType?: EnumDescriptor[];
  /** Array of service descriptors defined in this file */
  service?: ServiceDescriptor[];
  /** File-level options */
  options?: Record<string, unknown>;
}

/**
 * Represents the data structure of a protobuf FileDescriptorSet.
 * Contains an array of file descriptors representing multiple .proto files.
 *
 * @public
 * @since 0.1.0
 */
export interface FileDescriptorSetData {
  /** Array of file descriptors */
  file: FileDescriptor[];
}

/**
 * Represents the input format for the parseFileDescriptorSet function.
 * Wraps FileDescriptorSetData in the expected JSON structure.
 *
 * @public
 * @since 0.1.0
 */
export interface FileDescriptorSetInput {
  /** The file descriptor set data */
  fileDescriptorSet: FileDescriptorSetData;
}

// Extended protobuf interfaces for descriptor support
interface ExtendedProtobufRoot extends protobuf.Root {
  fromDescriptor?: (descriptor: protobuf.Message) => protobuf.Root;
}

interface ExtendedProtobufField {
  repeated?: boolean;
  required?: boolean;
}

/**
 * Generates proto IDL syntax from a protobuf namespace
 */
const generateIdlFromNamespace = (
  namespace: protobuf.Namespace,
  packageName: string,
  syntax: string,
  imports: string[] = [],
  includeImports = true,
): string => {
  const lines: string[] = [];

  // Add syntax
  lines.push(`syntax = "${syntax}";`);
  lines.push('');

  // Add package
  if (packageName) {
    lines.push(`package ${packageName};`);
    lines.push('');
  }

  // Add imports
  if (includeImports && imports.length > 0) {
    for (const importPath of imports) {
      lines.push(`import "${importPath}";`);
    }
    lines.push('');
  }

  // Generate content recursively
  generateNamespaceContent(namespace, lines, 0);

  return lines.join('\n').trim();
};

/**
 * Recursively generates content for a namespace
 */
const generateNamespaceContent = (namespace: protobuf.Namespace, lines: string[], indent: number): void => {
  if (namespace.nested) {
    for (const [, nested] of Object.entries(namespace.nested)) {
      if (nested instanceof protobuf.Enum) {
        generateEnumIdl(nested, lines, indent);
        lines.push('');
      } else if (nested instanceof protobuf.Type) {
        generateMessageIdl(nested, lines, indent);
        lines.push('');
      } else if (nested instanceof protobuf.Service) {
        generateServiceIdl(nested, lines, indent);
        lines.push('');
      } else if (nested instanceof protobuf.Namespace) {
        // Skip namespace containers - we flatten the structure
        generateNamespaceContent(nested, lines, indent);
      }
    }
  }
};

/**
 * Generates IDL for an enum
 */
const generateEnumIdl = (enumObj: protobuf.Enum, lines: string[], indent: number): void => {
  const indentStr = '  '.repeat(indent);
  lines.push(`${indentStr}enum ${enumObj.name} {`);

  for (const [name, value] of Object.entries(enumObj.values)) {
    lines.push(`${indentStr}  ${name} = ${value};`);
  }

  lines.push(`${indentStr}}`);
};

/**
 * Generates IDL for a message
 */
const generateMessageIdl = (type: protobuf.Type, lines: string[], indent: number): void => {
  const indentStr = '  '.repeat(indent);
  lines.push(`${indentStr}message ${type.name} {`);

  // Add nested enums first
  if (type.nested) {
    for (const [, nested] of Object.entries(type.nested)) {
      if (nested instanceof protobuf.Enum) {
        generateEnumIdl(nested, lines, indent + 1);
        lines.push('');
      }
    }
  }

  // Add nested messages
  if (type.nested) {
    for (const [, nested] of Object.entries(type.nested)) {
      if (nested instanceof protobuf.Type) {
        generateMessageIdl(nested, lines, indent + 1);
        lines.push('');
      }
    }
  }

  // Add fields
  for (const field of type.fieldsArray) {
    let rule = '';
    if (field.repeated) {
      rule = 'repeated ';
    } else if (field.required) {
      rule = 'required ';
    } else if (field.optional) {
      rule = 'optional ';
    }

    lines.push(`${indentStr}  ${rule}${field.type} ${field.name} = ${field.id};`);
  }

  lines.push(`${indentStr}}`);
};

/**
 * Generates IDL for a service
 */
const generateServiceIdl = (service: protobuf.Service, lines: string[], indent: number): void => {
  const indentStr = '  '.repeat(indent);
  lines.push(`${indentStr}service ${service.name} {`);

  for (const method of service.methodsArray) {
    const requestStream = method.requestStream ? 'stream ' : '';
    const responseStream = method.responseStream ? 'stream ' : '';
    lines.push(
      `${indentStr}  rpc ${method.name}(${requestStream}${method.requestType}) returns (${responseStream}${method.responseType});`,
    );
  }

  lines.push(`${indentStr}}`);
};

/**
 * Extracts file-specific content from a root and generates Proto objects
 */
const extractProtoFiles = (root: protobuf.Root, options: FileDescriptorSetParseOptions): Proto[] => {
  const contentProcessor = options.contentProcessor || new DefaultContentProcessor();
  const protos: Proto[] = [];
  const fileMap = new Map<string, { namespace: protobuf.Namespace; packageName: string; syntax: string }>();

  // Group namespaces by their original file
  const groupByFile = (namespace: protobuf.Namespace, currentPath = '') => {
    if (namespace.nested) {
      for (const [name, nested] of Object.entries(namespace.nested)) {
        if (nested instanceof protobuf.Namespace) {
          const nestedPath = currentPath ? `${currentPath}.${name}` : name;

          // Check if this is a package-level namespace (google.protobuf, buf.validate, etc.)
          if (
            nested.nested &&
            Object.values(nested.nested).some(
              n => n instanceof protobuf.Type || n instanceof protobuf.Enum || n instanceof protobuf.Service,
            )
          ) {
            const packageName = nestedPath;
            let fileName = `${packageName.replace(/\./g, '/')}.proto`;

            // Handle known files
            if (packageName === 'google.protobuf') {
              // For google.protobuf, we need to split by actual files
              const descriptorTypes = ['FileDescriptorSet', 'FileDescriptorProto', 'DescriptorProto'];
              if (nested.nested && descriptorTypes.some(t => nested.nested![t])) {
                fileName = 'google/protobuf/descriptor.proto';
              }
            }

            fileMap.set(fileName, {
              namespace: nested,
              packageName,
              syntax: options.defaultSyntax || 'proto3',
            });
          } else {
            groupByFile(nested, nestedPath);
          }
        }
      }
    }
  };

  groupByFile(root);

  // Handle files with no package (types added directly to root)
  if (root.nested) {
    const rootTypes = Object.values(root.nested).filter(
      n => n instanceof protobuf.Type || n instanceof protobuf.Enum || n instanceof protobuf.Service,
    );
    if (rootTypes.length > 0) {
      fileMap.set('no-package.proto', {
        namespace: root,
        packageName: '',
        syntax: options.defaultSyntax || 'proto3',
      });
    }
  }

  // Generate Proto objects for each file
  for (const [fileName, { namespace, packageName, syntax }] of fileMap.entries()) {
    const messages: Message[] = [];
    const enums: Enum[] = [];
    const services: Service[] = [];

    // Convert types
    if (namespace.nested) {
      for (const [, nested] of Object.entries(namespace.nested)) {
        if (nested instanceof protobuf.Type) {
          messages.push(contentProcessor.parseMessage(nested, packageName));
        } else if (nested instanceof protobuf.Enum) {
          enums.push(contentProcessor.parseEnum(nested, packageName));
        } else if (nested instanceof protobuf.Service) {
          services.push(contentProcessor.parseService(nested, packageName));
        }
      }
    }

    const idl = generateIdlFromNamespace(namespace, packageName, syntax, [], options.generateImports);

    protos.push({
      file: fileName,
      path: fileName,
      idl,
      messages: messages.length > 0 ? messages : undefined,
      enums: enums.length > 0 ? enums : undefined,
      services: services.length > 0 ? services : undefined,
      imports: [], // Would need FileDescriptorProto to get actual imports
    });
  }

  return protos;
};

/**
 * Parses a FileDescriptorSet from a JSON file or object using protobufjs.
 *
 * This function leverages protobufjs's built-in FileDescriptorSet support for parsing,
 * then generates readable proto IDL from the resulting protobuf.Root structure.
 *
 * @param input - Either a file path to a JSON file or a FileDescriptorSet object
 * @param options - Options for parsing the descriptor set
 * @returns Array of Proto objects representing each file in the descriptor set
 * @throws {Error} When the file cannot be read or the descriptor set is invalid
 *
 * @example
 * ```typescript
 * // Parse from JSON file
 * const protos = await parseFileDescriptorSet('./descriptors.json');
 *
 * // Parse from object
 * const descriptorSet = { fileDescriptorSet: { file: [...] } };
 * const protos = await parseFileDescriptorSet(descriptorSet);
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const parseFileDescriptorSet = async (
  input: string | FileDescriptorSetInput,
  options: FileDescriptorSetParseOptions = {},
): Promise<Proto[]> => {
  let descriptorSetData: FileDescriptorSetData;
  const fileSystem = options.fileSystem || new DefaultFileSystem();

  if (typeof input === 'string') {
    // Load from file path
    try {
      const content = await fileSystem.readFile(input, 'utf-8');
      const parsed = JSON.parse(content);

      if (parsed.fileDescriptorSet) {
        descriptorSetData = parsed.fileDescriptorSet;
      } else if (parsed.file) {
        // Direct FileDescriptorSet format
        descriptorSetData = parsed;
      } else {
        throw new Error('Invalid FileDescriptorSet format - missing fileDescriptorSet or file property');
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in FileDescriptorSet file: ${error.message}`);
      }
      throw new Error(`Failed to load FileDescriptorSet: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    descriptorSetData = input.fileDescriptorSet;
  }

  if (!descriptorSetData.file || descriptorSetData.file.length === 0) {
    throw new Error('FileDescriptorSet contains no file descriptors');
  }

  try {
    // Load the descriptor.proto to get the FileDescriptorSet type
    const descriptorRoot = await protobuf.load(require.resolve('protobufjs/google/protobuf/descriptor.proto'));
    const FileDescriptorSet = descriptorRoot.lookupType('google.protobuf.FileDescriptorSet');

    // Parse the FileDescriptorSet
    const fileDescriptorSet = FileDescriptorSet.fromObject(descriptorSetData);

    // Try to use the descriptor extension if available
    let root: protobuf.Root;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('protobufjs/ext/descriptor');
      // protobufjs fromDescriptor method is dynamically added by ext/descriptor
      root = (protobuf.Root as unknown as ExtendedProtobufRoot).fromDescriptor!(fileDescriptorSet);
    } catch {
      // Fallback: Load each file manually
      root = new protobuf.Root();
      for (const fileDesc of descriptorSetData.file) {
        // Use package if available, otherwise use root namespace
        const namespace = fileDesc.package ? root.define(fileDesc.package) : root;

        // Add types from the file descriptor
        if (fileDesc.messageType) {
          for (const msgType of fileDesc.messageType) {
            const type = new protobuf.Type(msgType.name);
            if (msgType.field) {
              for (const field of msgType.field) {
                const fieldType = getFieldTypeName(field);
                const pbField = new protobuf.Field(field.name, field.number, fieldType);
                // Type assertions needed for protobufjs internal properties
                if (field.label === 3) (pbField as ExtendedProtobufField).repeated = true; // LABEL_REPEATED
                if (field.label === 2) (pbField as ExtendedProtobufField).required = true; // LABEL_REQUIRED
                type.add(pbField);
              }
            }
            namespace.add(type);
          }
        }

        if (fileDesc.enumType) {
          for (const enumType of fileDesc.enumType) {
            const enumObj = new protobuf.Enum(enumType.name);
            if (enumType.value) {
              for (const value of enumType.value) {
                enumObj.values[value.name] = value.number;
              }
            }
            namespace.add(enumObj);
          }
        }

        if (fileDesc.service) {
          for (const serviceType of fileDesc.service) {
            const service = new protobuf.Service(serviceType.name);
            if (serviceType.method) {
              for (const method of serviceType.method) {
                const pbMethod = new protobuf.Method(method.name, 'rpc', method.inputType, method.outputType);
                if (method.clientStreaming) pbMethod.requestStream = true;
                if (method.serverStreaming) pbMethod.responseStream = true;
                service.add(pbMethod);
              }
            }
            namespace.add(service);
          }
        }
      }
    }

    // Extract Proto objects with generated IDL
    return extractProtoFiles(root, options);
  } catch (error) {
    throw new Error(`Failed to parse FileDescriptorSet: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Helper function to get field type name from field descriptor
 */
const getFieldTypeName = (field: FieldDescriptor): string => {
  if (field.typeName) {
    return field.typeName.replace(/^\./, ''); // Remove leading dot
  }

  // Map field type numbers to type names
  const typeMap: { [key: number]: string } = {
    1: 'double',
    2: 'float',
    3: 'int64',
    4: 'uint64',
    5: 'int32',
    6: 'fixed64',
    7: 'fixed32',
    8: 'bool',
    9: 'string',
    10: 'group',
    11: 'message',
    12: 'bytes',
    13: 'uint32',
    14: 'enum',
    15: 'sfixed32',
    16: 'sfixed64',
    17: 'sint32',
    18: 'sint64',
  };

  return typeMap[field.type] || 'unknown';
};
