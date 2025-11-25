import * as os from 'os';
import * as path from 'path';

import { DefaultFileSystem } from '../DefaultFileSystem';
import type {
  EnumDescriptor,
  FieldDescriptor,
  FileDescriptor,
  FileDescriptorSetData,
  MessageDescriptor,
  MethodDescriptor,
  ServiceDescriptor,
} from '../descriptorParser';
import { FileSystem, ParseOptions } from '../types';
import { validateImportPath as validateImportPathUtils } from '../utils';
import { DefaultImportResolver } from './DefaultImportResolver';

const BUF_API_BASE_URL = 'https://buf.build';

/**
 * Interface for Buf API response structure.
 */
interface BufApiResponse {
  fileDescriptorSet: FileDescriptorSetData;
}

/**
 * Error thrown when Buf API requests fail.
 *
 * This error is thrown when:
 * - The Buf API returns an HTTP error status (4xx, 5xx)
 * - Network errors occur while communicating with the Buf API
 * - The API response is malformed or missing required data
 * - Authentication fails (invalid or missing token)
 *
 * @example
 * ```typescript
 * try {
 *   await resolver.resolveImport('buf/validate/validate.proto');
 * } catch (error) {
 *   if (error instanceof BufApiError) {
 *     console.error(`Buf API failed: ${error.message}`);
 *     if (error.statusCode === 404) {
 *       console.error('Module not found');
 *     }
 *   }
 * }
 * ```
 *
 * @public
 * @since 0.2.0
 */
export class BufApiError extends Error {
  constructor(
    message: string,
    /** HTTP status code if available */
    public readonly statusCode?: number,
    /** Buf module reference that failed */
    public readonly module?: string,
  ) {
    super(message);
    this.name = 'BufApiError';
  }
}

/**
 * Error thrown when Buf configuration is invalid.
 *
 * This error is thrown when:
 * - Module mapping patterns are malformed
 * - Module references are invalid (e.g., missing module name)
 * - Configuration options are incompatible
 *
 * @example
 * ```typescript
 * try {
 *   new BufImportResolver('/base', {
 *     'invalid-pattern': 'buf.build/invalid'
 *   });
 * } catch (error) {
 *   if (error instanceof BufConfigurationError) {
 *     console.error(`Configuration error: ${error.message}`);
 *   }
 * }
 * ```
 *
 * @public
 * @since 0.2.0
 */
export class BufConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BufConfigurationError';
  }
}

/**
 * Options for configuring the BufImportResolver.
 */
export interface BufImportResolverOptions extends ParseOptions {
  /** Optional Buf API token for authenticated requests to private modules */
  bufToken?: string;
  /** Directory to cache downloaded proto files (defaults to temp directory) */
  cacheDir?: string;
  /** FileSystem implementation to use (defaults to DefaultFileSystem) */
  fileSystem?: FileSystem;
}

/**
 * Import resolver that extends DefaultImportResolver to support resolving
 * Protocol Buffer imports from the Buf Schema Registry (BSR).
 *
 * This resolver allows you to map import patterns/prefixes to Buf module coordinates,
 * enabling seamless integration with modules hosted on buf.build.
 *
 * ## Error Handling
 *
 * The resolver throws {@link BufApiError} when:
 * - Buf API requests fail (network errors, authentication issues, module not found)
 * - No local fallback file is available for the failed import
 *
 * The resolver falls back to local resolution when:
 * - Import paths don't match any configured Buf module patterns
 * - Buf API fails but a local file exists for the same import path
 *
 * ## Pattern Matching
 *
 * Supports three types of patterns:
 * - **Prefix matching**: `"buf/validate/"` matches all files under `buf/validate/`
 * - **Wildcard matching**: `"google/type/*.proto"` matches `.proto` files in `google/type/`
 * - **Double wildcard**: `"company/**\/\*.proto"` matches `.proto` files in `company/` and subdirectories
 * - **Exact matching**: `"exact/file.proto"` matches only that specific file
 *
 * @example
 * ```typescript
 * const resolver = new BufImportResolver(
 *   process.cwd(),
 *   {
 *     // Prefix matching - resolves all files under buf/validate/
 *     "buf/validate/": "buf.build/bufbuild/protovalidate:v1.0.0",
 *
 *     // Wildcard matching - resolves .proto files in google/type/
 *     "google/type/*.proto": "buf.build/googleapis/googleapis",
 *
 *     // No version specified - uses Buf's default
 *     "company/internal/": "buf.build/mycompany/internal"
 *   }
 * );
 *
 * try {
 *   const path = await resolver.resolveImport('buf/validate/validate.proto');
 *   console.log('Resolved:', path);
 * } catch (error) {
 *   if (error instanceof BufApiError) {
 *     console.error('Buf API error:', error.message);
 *   }
 * }
 * ```
 *
 * @public
 * @since 0.2.0
 */
export class BufImportResolver extends DefaultImportResolver {
  #moduleMap: Map<string, string>;
  #apiToken?: string;
  #cacheDir: string;
  #fileSystem: FileSystem;

  constructor(baseDir: string, moduleMapping: Record<string, string>, options: BufImportResolverOptions = {}) {
    const fileSystem = options.fileSystem || new DefaultFileSystem();
    super(baseDir, fileSystem, options);
    this.#moduleMap = new Map(Object.entries(moduleMapping));
    this.#apiToken = options.bufToken;
    this.#cacheDir = options.cacheDir || path.join(os.tmpdir(), '.buf-cache');
    this.#fileSystem = fileSystem;
  }

  /**
   * Resolves an import path, checking Buf module mappings first,
   * then falling back to default resolution.
   *
   * @param importPath The import path to resolve
   * @returns The resolved file path, or null if not found
   * @throws {BufApiError} When Buf API fails and no local fallback is available
   * @throws {BufConfigurationError} When module mapping configuration is invalid
   */
  async resolveImport(importPath: string): Promise<string | null> {
    // Validate import path for security before any processing
    this.validateImportPath(importPath);

    // Check if this import matches any Buf module patterns
    const bufModule = this.findBufModule(importPath);
    if (bufModule) {
      try {
        return await this.resolveBufImport(importPath, bufModule);
      } catch (error) {
        // Try local fallback resolution first
        const fallbackResult = await this.resolveImportWithFileSystem(importPath);
        if (fallbackResult) {
          return fallbackResult;
        }

        // If no local fallback is available, re-throw configuration and API errors directly
        if (error instanceof BufApiError || error instanceof BufConfigurationError) {
          throw error;
        }

        // For other errors, wrap them in BufApiError
        throw new BufApiError(`Failed to resolve ${importPath}: ${error}`, undefined, bufModule);
      }
    }

    // Fall back to custom default resolution that uses our FileSystem interface
    return this.resolveImportWithFileSystem(importPath);
  }

  /**
   * Custom import resolution that uses the FileSystem interface instead of direct fs calls.
   * This enables proper testing with MockFileSystem.
   */
  private async resolveImportWithFileSystem(importPath: string): Promise<string | null> {
    // Check if it's an absolute path
    if (path.isAbsolute(importPath)) {
      return (await this.checkFileExists(importPath)) ? importPath : null;
    }

    // Search through include paths
    for (const searchPath of this.includePaths) {
      const fullPath = path.join(searchPath, importPath);
      if (await this.checkFileExists(fullPath)) {
        return fullPath;
      }
    }

    // Try well-known Google protobuf types - delegate to parent for this
    if (importPath.startsWith('google/protobuf/')) {
      // For WKTs, we can still use the parent's resolution since it doesn't rely on our test files
      return super.resolveImport(importPath);
    }

    return null;
  }

  /**
   * Finds a Buf module that matches the given import path using pattern/prefix matching.
   */
  private findBufModule(importPath: string): string | null {
    for (const [pattern, module] of this.#moduleMap.entries()) {
      if (this.matchesPattern(importPath, pattern)) {
        return module;
      }
    }
    return null;
  }

  /**
   * Checks if an import path matches a pattern or prefix.
   * Supports prefix matching (pattern ends with '/') and wildcard matching (* and **).
   */
  private matchesPattern(path: string, pattern: string): boolean {
    // Prefix matching: 'buf/validate/' matches 'buf/validate/validate.proto'
    if (pattern.endsWith('/')) {
      return path.startsWith(pattern);
    }

    // Wildcard matching: 'buf/validate/*.proto' matches any .proto file in buf/validate/
    if (pattern.includes('*')) {
      // Escape special regex characters except *
      let regexPattern = pattern.replace(/[[\]{}()^$+?|\\]/g, '\\$&');

      // Escape dots first before replacing wildcards
      regexPattern = regexPattern.replace(/\./g, '\\.');

      // Replace wildcards with appropriate regex patterns
      // Handle ** first to avoid conflicts with single *
      regexPattern = regexPattern.replace(/\*\*/g, '__DOUBLE_WILDCARD__'); // ** matches anything including /
      regexPattern = regexPattern.replace(/\*/g, '[^/]*'); // * matches anything except /
      regexPattern = regexPattern.replace(/__DOUBLE_WILDCARD__/g, '.*'); // Restore ** as .* after single * replacement

      return new RegExp(`^${regexPattern}$`).test(path);
    }

    // Exact matching for patterns without wildcards or trailing slash
    return path === pattern;
  }

  /**
   * Resolves an import from the Buf Schema Registry.
   */
  private async resolveBufImport(importPath: string, moduleRef: string): Promise<string | null> {
    // Check cache first
    const cachedPath = await this.getCachedPath(importPath);
    if (await this.checkFileExists(cachedPath)) {
      return cachedPath;
    }

    // Parse module reference (e.g., "buf.build/bufbuild/protovalidate:v1.0.0")
    const { module, version } = this.parseModuleRef(moduleRef);

    // Fetch from Buf API - don't pass symbols for file retrieval
    const fileDescriptorSet = await this.fetchFileDescriptorSet(module, version);
    if (!fileDescriptorSet) {
      return null;
    }

    // Extract and save the proto file content
    const protoContent = await this.extractProtoContent(fileDescriptorSet, importPath);
    if (!protoContent || protoContent.trim() === '') {
      return null;
    }

    // Save to cache
    await this.saveToCache(cachedPath, protoContent);
    return cachedPath;
  }

  /**
   * Parses a module reference string into its components.
   */
  private parseModuleRef(moduleRef: string): { module: string; version?: string } {
    const parts = moduleRef.split(':');
    return {
      module: parts[0],
      version: parts[1],
    };
  }

  /**
   * Fetches a FileDescriptorSet from the Buf API.
   */
  private async fetchFileDescriptorSet(
    module: string,
    version?: string,
    symbol?: string, // Reserved for future use to fetch specific symbols only
  ): Promise<FileDescriptorSetData | null> {
    const url = `${BUF_API_BASE_URL}/buf.reflect.v1beta1.FileDescriptorSetService/GetFileDescriptorSet`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.#apiToken) {
      headers['Authorization'] = `Bearer ${this.#apiToken}`;
    }

    const body: { module: string; version?: string; symbols?: string[] } = { module };
    if (version) {
      body.version = version;
    }
    if (symbol) {
      // Request only the specific symbols/types we need
      // Note: symbols should be fully qualified type names, not file paths
      body.symbols = [symbol];
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new BufApiError(`Buf API request failed: ${response.statusText}`, response.status, module);
      }

      const data = (await response.json()) as BufApiResponse;
      return data.fileDescriptorSet || null;
    } catch (error) {
      if (error instanceof BufApiError) {
        throw error;
      }
      throw new BufApiError(`Failed to fetch from Buf API: ${error}`, undefined, module);
    }
  }

  /**
   * Extracts proto file content from a FileDescriptorSet.
   * This is a simplified implementation that reconstructs proto syntax from the descriptor.
   */
  private async extractProtoContent(
    fileDescriptorSet: FileDescriptorSetData,
    importPath: string,
  ): Promise<string | null> {
    // FileDescriptorSet contains an array of FileDescriptors
    if (!fileDescriptorSet?.file || !Array.isArray(fileDescriptorSet.file)) {
      return null;
    }

    // Handle empty FileDescriptorSet
    if (fileDescriptorSet.file.length === 0) {
      return null;
    }

    // Find the file that matches our import path
    const targetFile = fileDescriptorSet.file.find(
      (f: FileDescriptor) => f.name === importPath || f.name === importPath.replace('.proto', ''),
    );

    if (!targetFile) {
      // If specific file not found, try to reconstruct from first file
      // This is a fallback for when the API returns related definitions
      const firstFile = fileDescriptorSet.file[0];
      if (!firstFile) {
        return null;
      }
      return this.reconstructProtoFromDescriptor(firstFile);
    }

    return this.reconstructProtoFromDescriptor(targetFile);
  }

  /**
   * Reconstructs proto file syntax from a FileDescriptor.
   * This is a basic implementation that handles common cases.
   */
  private reconstructProtoFromDescriptor(descriptor: FileDescriptor): string {
    const lines: string[] = [];

    // Validate descriptor
    if (!descriptor) {
      return '';
    }

    // Add syntax
    lines.push(`syntax = "${descriptor.syntax || 'proto3'}";`);
    lines.push('');

    // Add package
    if (descriptor.package) {
      lines.push(`package ${descriptor.package};`);
      lines.push('');
    }

    // Add imports
    if (descriptor.dependency && descriptor.dependency.length > 0) {
      descriptor.dependency.forEach((dep: string) => {
        lines.push(`import "${dep}";`);
      });
      lines.push('');
    }

    // Add options
    if (descriptor.options) {
      // Handle common options
      if (descriptor.options.javaPackage) {
        lines.push(`option java_package = "${descriptor.options.javaPackage}";`);
      }
      if (descriptor.options.goPackage) {
        lines.push(`option go_package = "${descriptor.options.goPackage}";`);
      }
      if (descriptor.options.javaMultipleFiles !== undefined) {
        lines.push(`option java_multiple_files = ${descriptor.options.javaMultipleFiles};`);
      }
      if (lines[lines.length - 1] !== '') {
        lines.push('');
      }
    }

    // Add enums
    if (descriptor.enumType && descriptor.enumType.length > 0) {
      descriptor.enumType.forEach((enumDef: EnumDescriptor) => {
        lines.push(`enum ${enumDef.name} {`);
        if (enumDef.value) {
          enumDef.value.forEach(val => {
            lines.push(`  ${val.name} = ${val.number};`);
          });
        }
        lines.push('}');
        lines.push('');
      });
    }

    // Add messages
    if (descriptor.messageType && descriptor.messageType.length > 0) {
      descriptor.messageType.forEach((msg: MessageDescriptor) => {
        this.addMessageToLines(msg, lines, 0);
      });
    }

    // Add services
    if (descriptor.service && descriptor.service.length > 0) {
      descriptor.service.forEach((svc: ServiceDescriptor) => {
        lines.push(`service ${svc.name} {`);
        if (svc.method) {
          svc.method.forEach((method: MethodDescriptor) => {
            const req = method.clientStreaming ? `stream ${method.inputType}` : method.inputType;
            const res = method.serverStreaming ? `stream ${method.outputType}` : method.outputType;
            lines.push(`  rpc ${method.name}(${req}) returns (${res});`);
          });
        }
        lines.push('}');
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * Adds a message definition to the proto lines.
   */
  private addMessageToLines(msg: MessageDescriptor, lines: string[], indent: number): void {
    const indentStr = '  '.repeat(indent);

    lines.push(`${indentStr}message ${msg.name} {`);

    // Add nested enums
    if (msg.enumType && msg.enumType.length > 0) {
      msg.enumType.forEach((enumDef: EnumDescriptor) => {
        lines.push(`${indentStr}  enum ${enumDef.name} {`);
        if (enumDef.value) {
          enumDef.value.forEach(val => {
            lines.push(`${indentStr}    ${val.name} = ${val.number};`);
          });
        }
        lines.push(`${indentStr}  }`);
        lines.push('');
      });
    }

    // Add nested messages
    if (msg.nestedType && msg.nestedType.length > 0) {
      msg.nestedType.forEach((nested: MessageDescriptor) => {
        this.addMessageToLines(nested, lines, indent + 1);
      });
    }

    // Add oneofs
    const oneofDecls = msg.oneofDecl || [];

    // Add fields
    if (msg.field && msg.field.length > 0) {
      msg.field.forEach((field: FieldDescriptor) => {
        const fieldRule = this.getFieldRule(field);
        const fieldType = this.getFieldType(field);

        // Check if field belongs to a oneof
        if ('oneofIndex' in field && field.oneofIndex !== undefined && oneofDecls[field.oneofIndex]) {
          // Handle oneof field - will be added when we process oneofs
          return;
        }

        const fieldLine = `${indentStr}  ${fieldRule}${fieldType} ${field.name} = ${field.number};`;
        lines.push(fieldLine);
      });
    }

    // Add oneofs with their fields
    oneofDecls.forEach((oneof: { name: string }, index: number) => {
      lines.push(`${indentStr}  oneof ${oneof.name} {`);
      if (msg.field) {
        msg.field.forEach((field: FieldDescriptor) => {
          if ('oneofIndex' in field && field.oneofIndex === index) {
            const fieldType = this.getFieldType(field);
            lines.push(`${indentStr}    ${fieldType} ${field.name} = ${field.number};`);
          }
        });
      }
      lines.push(`${indentStr}  }`);
    });

    lines.push(`${indentStr}}`);
    lines.push('');
  }

  /**
   * Gets the field rule (repeated, optional, required) for a field.
   */
  private getFieldRule(field: FieldDescriptor): string {
    if (field.label === 3) {
      // LABEL_REPEATED
      return 'repeated ';
    }
    if (field.label === 2) {
      // LABEL_REQUIRED
      return 'required ';
    }
    if (field.label === 1) {
      // LABEL_OPTIONAL
      // In proto3, optional is usually implicit
      if (field.proto3Optional) {
        return 'optional ';
      }
    }
    return '';
  }

  /**
   * Gets the field type name for a field.
   */
  private getFieldType(field: FieldDescriptor): string {
    // Check for type name (message or enum reference)
    if (field.typeName) {
      // Remove leading dot if present
      return field.typeName.startsWith('.') ? field.typeName.substring(1) : field.typeName;
    }

    // Map numeric type to proto type name
    const typeMap: Record<number, string> = {
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
  }

  /**
   * Gets the cached file path for an import.
   * Validates the import path to prevent path traversal attacks.
   */
  private async getCachedPath(importPath: string): Promise<string> {
    // Validate import path for security
    this.validateImportPath(importPath);

    // Create subdirectories to match import path structure
    const parts = importPath.split('/');
    const fileName = parts[parts.length - 1];
    const dirs = parts.slice(0, -1);

    const cacheSubDir = path.join(this.#cacheDir, ...dirs);

    // Verify the resolved path is still within the cache directory
    const normalizedCacheDir = path.resolve(this.#cacheDir);
    const normalizedCacheSubDir = path.resolve(cacheSubDir);
    if (
      !normalizedCacheSubDir.startsWith(normalizedCacheDir + path.sep) &&
      normalizedCacheSubDir !== normalizedCacheDir
    ) {
      throw new BufConfigurationError(`Invalid import path would escape cache directory: ${importPath}`);
    }

    try {
      await this.#fileSystem.access(cacheSubDir);
    } catch {
      await this.#fileSystem.mkdir(cacheSubDir, { recursive: true });
    }

    const finalPath = path.join(cacheSubDir, fileName);

    // Final validation that the complete path is safe
    const normalizedFinalPath = path.resolve(finalPath);
    if (!normalizedFinalPath.startsWith(normalizedCacheDir + path.sep) && normalizedFinalPath !== normalizedCacheDir) {
      throw new BufConfigurationError(`Invalid import path would escape cache directory: ${importPath}`);
    }

    return finalPath;
  }

  /**
   * Validates an import path for security to prevent path traversal attacks.
   * Wraps the generic validateImportPath utility to throw BufConfigurationError.
   */
  private validateImportPath(importPath: string): void {
    try {
      validateImportPathUtils(importPath);
    } catch (error) {
      throw new BufConfigurationError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Saves content to the cache.
   */
  private async saveToCache(filePath: string, content: string): Promise<void> {
    await this.#fileSystem.writeFile(filePath, content, 'utf8');
  }

  /**
   * Checks if a file exists.
   */
  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await this.#fileSystem.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
