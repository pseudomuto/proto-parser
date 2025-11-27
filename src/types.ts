import { IProtoParser } from './proto';
import { IImportProcessor } from './resolvers/IImportProcessor';
import { IFileSystem } from './sys/IFileSystem';

// Re-export proto-specific types from the proto package
export {
  Options,
  FieldRule,
  Proto,
  Service,
  ServiceMethod,
  Message,
  Field,
  Enum,
  EnumValue,
  OneOf,
  Extension,
  IProtoParser,
} from './proto';

// Re-export resolver interfaces
export { IImportProcessor } from './resolvers/IImportProcessor';

// Re-export filesystem interfaces
export { IFileSystem } from './sys/IFileSystem';

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
  /** Custom proto parser for converting protobufjs objects to internal types */
  contentProcessor?: IProtoParser;
  /** Custom import resolver for resolving proto import paths */
  importResolver?: IImportProcessor;
  /** Custom filesystem implementation for file operations */
  fileSystem?: IFileSystem;
  /** Module providers for external proto dependencies */
  moduleProviders?: ModuleProvider[];
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
  /** Base directory for calculating relative paths in comments (default: undefined, uses filenames only) */
  baseDir?: string;
  /** Whether to include only local protos (default: true) - excludes external libraries like google.protobuf.*, buf.validate.*, etc. */
  includeLocalOnly?: boolean;
}

/**
 * Interface for providing external proto module dependencies.
 * Implementations handle downloading, caching, and cleanup of proto files.
 *
 * @public
 * @since 0.3.0
 */
export interface ModuleProvider {
  /** Get include paths containing module proto files */
  getIncludePaths(): Promise<string[]>;
  /** Clean up any resources */
  dispose(): Promise<void>;
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
  /** Proto parser for converting protobufjs objects to internal types */
  contentProcessor: IProtoParser;
  /** Import resolver for resolving proto import paths */
  importResolver: IImportProcessor;
  /** Filesystem implementation for file operations */
  fileSystem: IFileSystem;
}
