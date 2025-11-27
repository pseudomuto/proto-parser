/**
 * FileSystem interface for abstracting file operations.
 * Allows for dependency injection and easier testing.
 *
 * @public
 * @since 0.2.0
 */
export interface IFileSystem {
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
