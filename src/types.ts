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
