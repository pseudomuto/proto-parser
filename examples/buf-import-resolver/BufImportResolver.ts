import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DefaultImportResolver } from '../../src/DefaultImportResolver';
import type {
  EnumDescriptor,
  FieldDescriptor,
  FileDescriptor,
  FileDescriptorSetData,
  MessageDescriptor,
  MethodDescriptor,
  ServiceDescriptor,
} from '../../src/descriptorParser';
import { ParseOptions } from '../../src/types';

/**
 * Interface for Buf API response structure.
 */
interface BufApiResponse {
  fileDescriptorSet: FileDescriptorSetData;
}

/**
 * Options for configuring the BufImportResolver.
 */
export interface BufImportResolverOptions extends ParseOptions {
  /** Optional Buf API token for authenticated requests to private modules */
  bufToken?: string;
  /** Directory to cache downloaded proto files (defaults to temp directory) */
  cacheDir?: string;
}

/**
 * Import resolver that extends DefaultImportResolver to support resolving
 * Protocol Buffer imports from the Buf Schema Registry (BSR).
 *
 * This resolver allows you to map import patterns/prefixes to Buf module coordinates,
 * enabling seamless integration with modules hosted on buf.build.
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
 * ```
 */
export class BufImportResolver extends DefaultImportResolver {
  private moduleMap: Map<string, string>;
  private apiToken?: string;
  private cacheDir: string;
  private readonly bufApiBaseUrl = 'https://buf.build';

  constructor(baseDir: string, moduleMapping: Record<string, string>, options: BufImportResolverOptions = {}) {
    super(baseDir, options);
    this.moduleMap = new Map(Object.entries(moduleMapping));
    this.apiToken = options.bufToken;
    this.cacheDir = options.cacheDir || path.join(os.tmpdir(), '.buf-cache');

    // Ensure cache directory exists asynchronously
    this.ensureCacheDirectory();
  }

  /**
   * Ensures the cache directory exists, creating it if necessary.
   */
  private async ensureCacheDirectory(): Promise<void> {
    try {
      await fs.promises.access(this.cacheDir);
    } catch {
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Resolves an import path, checking Buf module mappings first,
   * then falling back to default resolution.
   */
  async resolveImport(importPath: string): Promise<string | null> {
    // Check if this import matches any Buf module patterns
    const bufModule = this.findBufModule(importPath);
    if (bufModule) {
      try {
        return await this.resolveBufImport(importPath, bufModule);
      } catch (error) {
        console.warn(`Failed to resolve ${importPath} from Buf API:`, error);
        // Fall through to default resolution
      }
    }

    // Fall back to default resolution (local files, WKTs, etc.)
    return super.resolveImport(importPath);
  }

  /**
   * Finds a Buf module that matches the given import path using pattern/prefix matching.
   */
  private findBufModule(importPath: string): string | null {
    for (const [pattern, module] of this.moduleMap.entries()) {
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
      // Escape special regex characters except * and **
      let regexPattern = pattern.replace(/[[\]{}()^$+?|\\]/g, '\\$&');

      // Replace wildcards with appropriate regex patterns
      regexPattern = regexPattern
        .replace(/\\\*\\\*/g, '.*') // ** matches anything including /
        .replace(/\\\*/g, '[^/]*') // * matches anything except /
        .replace(/\./g, '\\.'); // Escape remaining dots

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
    if (!protoContent) {
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
  ): Promise<FileDescriptorSetData> {
    const url = `${this.bufApiBaseUrl}/buf.reflect.v1beta1.FileDescriptorSetService/GetFileDescriptorSet`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
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
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as BufApiResponse;
      return data.fileDescriptorSet;
    } catch (error) {
      throw new Error(`Failed to fetch from Buf API: ${error}`);
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

    // Find the file that matches our import path
    const targetFile = fileDescriptorSet.file.find(
      (f: FileDescriptor) => f.name === importPath || f.name === importPath.replace('.proto', ''),
    );

    if (!targetFile) {
      // If specific file not found, try to reconstruct from first file
      // This is a fallback for when the API returns related definitions
      return this.reconstructProtoFromDescriptor(fileDescriptorSet.file[0]);
    }

    return this.reconstructProtoFromDescriptor(targetFile);
  }

  /**
   * Reconstructs proto file syntax from a FileDescriptor.
   * This is a basic implementation that handles common cases.
   */
  private reconstructProtoFromDescriptor(descriptor: FileDescriptor): string {
    const lines: string[] = [];

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
   */
  private async getCachedPath(importPath: string): Promise<string> {
    // Create subdirectories to match import path structure
    const parts = importPath.split('/');
    const fileName = parts[parts.length - 1];
    const dirs = parts.slice(0, -1);

    const cacheSubDir = path.join(this.cacheDir, ...dirs);
    try {
      await fs.promises.access(cacheSubDir);
    } catch {
      await fs.promises.mkdir(cacheSubDir, { recursive: true });
    }

    return path.join(cacheSubDir, fileName);
  }

  /**
   * Saves content to the cache.
   */
  private async saveToCache(filePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, content, 'utf8', err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Checks if a file exists.
   */
  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
