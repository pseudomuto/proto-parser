import { IProtoParser } from './proto';
import { IImportProcessor } from './resolvers/IImportProcessor';

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
  fileSystem?: FileSystem;
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
