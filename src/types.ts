import * as protobuf from 'protobufjs';

/**
 * Generic options type for Protocol Buffer definitions.
 *
 * @public
 * @since 0.1.0
 */
export type Options = Record<string, unknown>;

/**
 * Field rule enumeration for Protocol Buffer fields.
 *
 * @public
 * @since 0.1.0
 */
export type FieldRule = 'repeated' | 'optional' | 'required';

/**
 * Represents a parsed Protocol Buffer file with all its definitions.
 *
 * @public
 * @since 0.1.0
 */
export type Proto = {
  /** The filename of the proto file */
  file: string;
  /** The full path to the proto file */
  path: string;
  /** The raw IDL content of the proto file */
  idl: string;
  /** Array of service definitions found in the proto file */
  services?: Service[];
  /** Array of message definitions found in the proto file */
  messages?: Message[];
  /** Array of enum definitions found in the proto file */
  enums?: Enum[];
  /** Array of import statements found in the proto file */
  imports?: string[];
};

/**
 * Represents a gRPC service definition from a Protocol Buffer file.
 *
 * @public
 * @since 0.1.0
 */
export type Service = {
  /** The name of the service */
  name: string;
  /** The namespace/package the service belongs to */
  namespace: string;
  /** Array of methods defined in this service */
  methods?: ServiceMethod[];
};

/**
 * Represents a method within a gRPC service definition.
 *
 * @public
 * @since 0.1.0
 */
export type ServiceMethod = {
  /** The name of the method */
  name: string;
  /** The type of the request message */
  requestType: string;
  /** The type of the response message */
  responseType: string;
  /** Whether the request is streamed */
  requestStream?: boolean;
  /** Whether the response is streamed */
  responseStream?: boolean;
  /** Method-specific options */
  options?: Options;
};

/**
 * Represents a Protocol Buffer message definition.
 *
 * @public
 * @since 0.1.0
 */
export type Message = {
  /** The name of the message */
  name: string;
  /** The namespace/package the message belongs to */
  namespace: string;
  /** Array of fields defined in this message */
  fields?: Field[];
  /** Array of nested message definitions */
  nestedMessages?: Message[];
  /** Array of nested enum definitions */
  nestedEnums?: Enum[];
  /** Array of oneof field groups */
  oneofs?: OneOf[];
  /** Array of extensions defined for this message */
  extensions?: Extension[];
  /** Message-specific options */
  options?: Options;
};

/**
 * Represents a field within a Protocol Buffer message.
 *
 * @public
 * @since 0.1.0
 */
export type Field = {
  /** The name of the field */
  name: string;
  /** The type of the field (primitive or message type) */
  type: string;
  /** The rule for this field (repeated, optional, required) */
  rule?: FieldRule;
  /** The unique field number */
  number: number;
  /** The default value for this field, if any */
  defaultValue?: unknown;
  /** Field-specific options */
  options?: Options;
  /** Index of the oneof group this field belongs to, if any */
  oneofIndex?: number;
};

/**
 * Represents a Protocol Buffer enumeration definition.
 *
 * @public
 * @since 0.1.0
 */
export type Enum = {
  /** The name of the enum */
  name: string;
  /** The namespace/package the enum belongs to */
  namespace: string;
  /** Array of enum values */
  values: EnumValue[];
  /** Enum-specific options */
  options?: Options;
};

/**
 * Represents a value within a Protocol Buffer enumeration.
 *
 * @public
 * @since 0.1.0
 */
export type EnumValue = {
  /** The name of the enum value */
  name: string;
  /** The numeric value assigned to this enum value */
  number: number;
  /** Value-specific options */
  options?: Options;
};

/**
 * Represents a oneof field group in a Protocol Buffer message.
 *
 * @public
 * @since 0.1.0
 */
export type OneOf = {
  /** The name of the oneof group */
  name: string;
  /** Array of field names that belong to this oneof group */
  fieldNames: string[];
};

/**
 * Represents a Protocol Buffer extension definition.
 *
 * @public
 * @since 0.1.0
 */
export type Extension = {
  /** The name of the extension */
  name: string;
  /** The type of the extension field */
  type: string;
  /** The message type this extension extends */
  extend: string;
  /** The unique field number for this extension */
  number: number;
};

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
  /** Custom content processor for converting protobufjs objects to internal types */
  contentProcessor?: ContentProcessor;
  /** Custom import resolver for resolving proto import paths */
  importResolver?: ImportResolver;
  /** Custom filesystem implementation for file operations */
  fileSystem?: FileSystem;
}

/**
 * Configuration options for parsing Protocol Buffer directories.
 *
 * @public
 * @since 0.1.0
 */
export interface DirectoryParseOptions extends ParseOptions {
  /** Whether to recursively search subdirectories for .proto files (default: true) */
  recursive?: boolean;
}

/**
 * Configuration options for generating superset IDL from a ProtoSet.
 *
 * @public
 * @since 0.1.0
 */
export interface SupersetOptions {
  /** The proto syntax version to use in generated IDL (default: 'proto3') */
  syntax?: 'proto2' | 'proto3';
  /** The package name for the generated proto file */
  packageName?: string;
  /** Whether to include comments indicating source files and section headers (default: true) */
  includeComments?: boolean;
  /**
   * How to handle namespace conflicts when merging definitions (default: 'prefix')
   * - 'prefix': Adds namespace prefix or numeric suffix to conflicting names
   * - 'ignore': Keeps original names, may result in duplicates
   */
  namespaceConflictResolution?: 'prefix' | 'ignore';
}

/**
 * Interface for content processing functionality.
 * Handles conversion of protobufjs objects to our internal types.
 *
 * This interface uses proper protobufjs types to ensure full type safety and better
 * developer experience when implementing custom content processors.
 *
 * @public
 * @since 0.2.0
 */
export interface ContentProcessor {
  /** Converts a protobuf.Field to our Field type */
  parseField(field: protobuf.Field): Field;
  /** Determines the field rule (repeated, required, optional) */
  parseFieldRule(field: protobuf.Field): FieldRule | undefined;
  /** Converts a protobuf.Enum value to our EnumValue type */
  parseEnumValue(value: string, enumObj: protobuf.Enum): EnumValue;
  /** Converts a protobuf.Enum to our Enum type */
  parseEnum(enumObj: protobuf.Enum, namespace: string): Enum;
  /** Converts a protobuf.OneOf to our OneOf type */
  parseOneof(oneof: protobuf.OneOf): OneOf;
  /** Converts a protobuf.Type to our Message type */
  parseMessage(messageType: protobuf.Type, namespace: string): Message;
  /** Converts a protobuf.Method to our ServiceMethod type */
  parseServiceMethod(method: protobuf.Method): ServiceMethod;
  /** Converts a protobuf.Service to our Service type */
  parseService(service: protobuf.Service, namespace: string): Service;
  /**
   * Recursively collects all messages from a protobuf namespace and its nested namespaces.
   * @param root - The root namespace to collect messages from
   * @param messages - (Optional accumulator) Array of messages collected so far, used for recursive calls
   * @param currentNamespace - (Optional) Current namespace path being processed, used to build full qualified names
   * @returns Array containing all message definitions found in the namespace hierarchy
   */
  collectAllMessages(root: protobuf.Namespace, messages?: Message[], currentNamespace?: string): Message[];
  /**
   * Recursively collects all enums from a protobuf namespace and its nested namespaces.
   * @param root - The root namespace to collect enums from
   * @param enums - (Optional accumulator) Array of enums collected so far, used for recursive calls
   * @param currentNamespace - (Optional) Current namespace path being processed, used to build full qualified names
   * @returns Array containing all enum definitions found in the namespace hierarchy
   */
  collectAllEnums(root: protobuf.Namespace, enums?: Enum[], currentNamespace?: string): Enum[];
  /**
   * Recursively collects all services from a protobuf namespace and its nested namespaces.
   * @param root - The root namespace to collect services from
   * @param services - (Optional accumulator) Array of services collected so far, used for recursive calls
   * @param currentNamespace - (Optional) Current namespace path being processed, used to build full qualified names
   * @returns Array containing all service definitions found in the namespace hierarchy
   */
  collectAllServices(root: protobuf.Namespace, services?: Service[], currentNamespace?: string): Service[];
}

/**
 * Interface for import resolution functionality.
 * Handles async import resolution with support for include paths and well-known types.
 *
 * @public
 * @since 0.2.0
 */
export interface ImportResolver {
  /** Asynchronously resolves an import path to its full file system path */
  resolveImport(importPath: string): Promise<string | null>;
  /** Validates that all imports can be resolved before loading */
  validateImports(imports: string[]): Promise<void>;
  /** Creates a resolve path function compatible with protobufjs */
  createProtobufResolver(): (origin: string, target: string) => string;
}

/**
 * Internal type for ParseOptions with all fields populated with defaults.
 *
 * @internal
 */
export interface ResolvedParseOptions {
  /** Additional directories to search for imported proto files */
  includePaths: string[];
  /** Whether to preserve field name casing */
  keepCase: boolean;
  /** Whether to include default values */
  defaults: boolean;
  /** Whether to include oneof definitions */
  oneofs: boolean;
  /** Content processor for converting protobufjs objects to internal types */
  contentProcessor: ContentProcessor;
  /** Import resolver for resolving proto import paths */
  importResolver: ImportResolver;
  /** Filesystem implementation for file operations */
  fileSystem: FileSystem;
}

/**
 * FileSystem interface for abstracting file operations.
 * Allows for dependency injection and easier testing.
 *
 * @public
 * @since 0.2.0
 */
export interface FileSystem {
  /**
   * Check access to a file or directory.
   * Throws an error if the file doesn't exist or isn't accessible.
   */
  access(path: string): Promise<void>;

  /**
   * Check if a file or directory exists.
   * @param path File or directory path to check
   * @returns Promise that resolves to true if exists, false otherwise
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file or directory stats.
   * @param path File or directory path
   * @returns Promise that resolves to fs.Stats object
   */
  stat(path: string): Promise<import('fs').Stats>;

  /**
   * Read directory contents.
   * @param path Directory path to read
   * @param options Options for reading directory
   * @returns Promise that resolves to directory entries
   */
  readDir(path: string, options?: { withFileTypes?: boolean }): Promise<import('fs').Dirent[] | string[]>;

  /**
   * Create a directory.
   * @param path Directory path to create
   * @param options Options including recursive creation
   */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Write a file with content.
   * @param path File path
   * @param content File content
   * @param encoding File encoding (e.g., 'utf8')
   */
  writeFile(path: string, content: string, encoding: BufferEncoding): Promise<void>;

  /**
   * Write a file with buffer content.
   * @param path File path
   * @param content File content as Buffer
   */
  writeFile(path: string, content: Buffer): Promise<void>;

  /**
   * Remove a directory.
   * @param path Directory path to remove
   * @param options Options including recursive removal
   */
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Read a file.
   * @param path File path
   * @param encoding Optional encoding for text files
   * @returns File content as Buffer or string
   */
  readFile(path: string): Promise<Buffer>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;

  /**
   * Read content from either a file path or return the input if it's already content.
   * Determines if input is a file path by checking for proto patterns and file existence.
   * @param input Either a file path to a .proto file or proto content string
   * @returns Promise that resolves to object with content and filePath
   */
  readFileOrLiteral(input: string): Promise<{ content: string; filePath: string }>;

  /**
   * Get the full file path if input is a valid file path, empty string otherwise.
   * @param input Either a file path to a .proto file or proto content string
   * @returns Promise that resolves to full file path or empty string
   */
  filePathIfExists(input: string): Promise<string>;
}
