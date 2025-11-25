import * as fs from 'fs';
import * as path from 'path';

/**
 * Asynchronously determines if the input string is a file path rather than proto content.
 *
 * @param input - String to check (either file path or proto content)
 * @returns Promise that resolves to true if input appears to be a file path
 *
 * @public
 * @since 0.1.0
 */
export const isFilePath = async (input: string): Promise<boolean> => {
  if (input.includes('\n') || input.includes('syntax =')) {
    return false;
  }

  return input.endsWith('.proto') || (await fileExists(input)) || (await fileExists(path.resolve(input)));
};

/**
 * Asynchronously loads proto content from a file path or returns the input if it's already content.
 *
 * @param input - Either a file path to a .proto file or proto content string
 * @returns Promise that resolves to the proto file content
 * @throws {Error} When the file cannot be read
 *
 * @public
 * @since 0.1.0
 */
export const loadProtoContent = async (input: string): Promise<string> => {
  if (await isFilePath(input)) {
    const filePath = (await fileExists(input)) ? input : path.resolve(input);
    return await readFile(filePath);
  }

  return input;
};

/**
 * Asynchronously resolves the full file path for a proto input.
 *
 * @param input - Either a file path to a .proto file or proto content string
 * @returns Promise that resolves to the full file path, or empty string if input is content
 *
 * @public
 * @since 0.1.0
 */
export const getProtoPath = async (input: string): Promise<string> => {
  if (await isFilePath(input)) {
    return path.resolve(input);
  }

  return '';
};

/**
 * Extracts the directory path from a proto file path.
 *
 * @param protoPath - Full path to a proto file
 * @returns The directory containing the proto file, or current working directory if path is empty
 *
 * @public
 * @since 0.1.0
 */
export const getProtoDirectory = (protoPath: string): string => {
  return protoPath ? path.dirname(protoPath) : process.cwd();
};

/**
 * Asynchronously resolves the full path of an imported proto file.
 *
 * Searches through multiple directories including the base directory,
 * include paths, and well-known Google proto types.
 *
 * @param importPath - The import path from the proto file
 * @param baseDir - The directory containing the importing proto file
 * @param includePaths - Additional directories to search for imports
 * @returns Promise that resolves to the full path of the import, or null if not found
 *
 * @public
 * @since 0.1.0
 */
export const resolveImport = async (
  importPath: string,
  baseDir: string,
  includePaths: string[] = [],
): Promise<string | null> => {
  const searchPaths = [
    baseDir,
    ...includePaths,
    path.join(baseDir, 'proto'),
    path.join(baseDir, 'protos'),
    process.cwd(),
  ];

  for (const searchPath of searchPaths) {
    const fullPath = path.join(searchPath, importPath);
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  }

  const wellKnownPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'protobufjs',
    'google',
    'protobuf',
    path.basename(importPath),
  );

  return (await fileExists(wellKnownPath)) ? wellKnownPath : null;
};

/**
 * Extracts namespace and name components from a fully qualified proto name.
 *
 * @param fullName - Fully qualified name (e.g., 'google.protobuf.Timestamp')
 * @returns Object containing separate namespace and name components
 *
 * @example
 * ```typescript
 * const result = extractNamespace('google.protobuf.Timestamp');
 * // result = { namespace: 'google.protobuf', name: 'Timestamp' }
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const extractNamespace = (fullName: string): { namespace: string; name: string } => {
  const parts = fullName.split('.');
  const name = parts.pop() || '';
  const namespace = parts.join('.');
  return { namespace, name };
};

/**
 * Joins namespace parts into a fully qualified namespace string.
 *
 * @param parts - Variable number of namespace parts
 * @returns Joined namespace string with dots as separators
 *
 * @example
 * ```typescript
 * const namespace = joinNamespace('google', 'protobuf');
 * // namespace = 'google.protobuf'
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const joinNamespace = (...parts: string[]): string => {
  return parts.filter(Boolean).join('.');
};

/**
 * Asynchronously checks if a file exists at the given path.
 *
 * @param path - File path to check
 * @returns Promise that resolves to true if file exists, false otherwise
 * @throws {Error} For file system errors other than file not found
 *
 * @public
 * @since 0.1.0
 */
export const fileExists = async (path: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    fs.access(path, fs.constants.F_OK, err => {
      if (!err) {
        resolve(true);
        return;
      }

      if (err.code === 'ENOENT') {
        resolve(false);
        return;
      }

      reject(err);
    });
  });
};

/**
 * Asynchronously reads the contents of a file as a UTF-8 string.
 *
 * @param path - Path to the file to read
 * @returns Promise that resolves to the file contents as a string
 * @throws {Error} When the file cannot be read
 *
 * @public
 * @since 0.1.0
 */
export const readFile = async (path: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf-8', (err, data) => {
      if (!err) {
        resolve(data);
        return;
      }

      reject(err);
    });
  });
};

/**
 * Validates an import path for security to prevent path traversal attacks.
 *
 * This function performs comprehensive validation of import paths to ensure they:
 * - Are non-empty strings
 * - Don't contain null bytes
 * - Are relative paths (not absolute)
 * - Don't contain path traversal attempts (.., ., etc.)
 * - Don't start with directory separators
 * - Don't contain empty or invalid path segments
 *
 * @param importPath - The import path to validate
 * @throws {Error} When the import path is invalid or potentially dangerous
 *
 * @example
 * ```typescript
 * validateImportPath('buf/validate/validate.proto'); // OK
 * validateImportPath('../../../etc/passwd'); // throws Error
 * validateImportPath('/absolute/path.proto'); // throws Error
 * validateImportPath('test\0.proto'); // throws Error
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const validateImportPath = (importPath: string): void => {
  if (!importPath || typeof importPath !== 'string') {
    throw new Error('Import path must be a non-empty string');
  }

  // Check for null bytes (another common security issue)
  if (importPath.includes('\0')) {
    throw new Error(`Import path contains null byte: ${importPath}`);
  }

  // Check for Windows drive letters (C:, D:, etc.)
  if (/^[a-zA-Z]:/.test(importPath)) {
    throw new Error(`Import path contains Windows drive letter: ${importPath}`);
  }

  // Ensure it's not an absolute path (Unix/Windows)
  if (path.isAbsolute(importPath) || importPath.startsWith('/') || importPath.startsWith('\\')) {
    throw new Error(`Import path must be relative: ${importPath}`);
  }

  // Normalize the path to resolve any .. or . segments
  const normalizedPath = path.normalize(importPath);

  // Check for path traversal attempts - both before and after normalization
  if (
    importPath.includes('..') ||
    normalizedPath.includes('..') ||
    importPath.includes('..\\') ||
    normalizedPath.includes('..\\')
  ) {
    throw new Error(`Import path contains invalid path traversal: ${importPath}`);
  }

  // Additional checks for problematic patterns
  if (
    importPath === '.' ||
    importPath === '..' ||
    importPath.startsWith('./') ||
    importPath.startsWith('.\\') ||
    importPath.startsWith('../') ||
    importPath.startsWith('..\\') ||
    importPath.endsWith('/.') ||
    importPath.endsWith('\\.') ||
    importPath.endsWith('/..') ||
    importPath.endsWith('\\..')
  ) {
    throw new Error(`Import path contains invalid directory reference: ${importPath}`);
  }

  // Check for empty or only separator segments
  const parts = importPath.split(/[/\\]/);
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`Import path contains invalid segments: ${importPath}`);
  }

  // Final verification after normalization
  if (normalizedPath !== importPath) {
    // If normalization changed the path, it might contain suspicious elements
    if (normalizedPath.includes('..') || normalizedPath === '.' || normalizedPath === '..') {
      throw new Error(`Import path normalization reveals invalid traversal: ${importPath}`);
    }
  }
};
