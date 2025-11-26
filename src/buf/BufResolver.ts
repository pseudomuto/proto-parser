import * as os from 'os';
import * as path from 'path';
import * as stream from 'stream';
import { pipeline } from 'stream/promises';
import * as zlib from 'zlib';

import { DefaultFileSystem } from '../DefaultFileSystem';
import { FileSystem } from '../types';
import { TarExtractStream } from './TarExtractStream';
import { ModuleCoordinate, ModuleCoordinateError, parseModuleCoordinate } from './moduleCoordinate';

/**
 * Error thrown when Buf module resolution fails.
 */
export class BufResolverError extends Error {
  constructor(
    message: string,
    /** HTTP status code if available */
    public readonly statusCode?: number,
    /** Module coordinate that failed */
    public readonly module?: string,
  ) {
    super(message);
    this.name = 'BufResolverError';
  }
}

/**
 * Options for configuring the BufResolver.
 */
export interface BufResolverOptions {
  /** Optional Buf API token for authenticated requests to private modules */
  bufToken?: string;
  /** Base directory for temporary files (defaults to OS temp directory) */
  tempDir?: string;
  /** FileSystem implementation to use (defaults to DefaultFileSystem) */
  fileSystem?: FileSystem;
  /** Whether to include dependencies when downloading modules (defaults to true) */
  includeDependencies?: boolean;
  /** Whether to automatically include Google Protocol Buffer well-known types (defaults to true) */
  includeWKTs?: boolean;
}

/**
 * Resolver that preloads Buf modules by downloading their raw proto files
 * as archives and extracting them to temporary directories.
 *
 * This approach provides superior performance and type resolution
 * and provides perfect proto file fidelity with automatic dependency resolution.
 *
 * @example
 * ```typescript
 * const resolver = new BufResolver([
 *   'buf.build/bufbuild/protovalidate:v1.0.0',
 *   'buf.build/googleapis/googleapis'
 * ], {
 *   includeWKTs: true // Automatically includes well-known types (default)
 * });
 *
 * const tempDirs = await resolver.preloadModules();
 *
 * // Use with existing ImportResolver
 * const importResolver = new DefaultImportResolver(baseDir, fileSystem, {
 *   includePaths: tempDirs
 * });
 *
 * // Clean up when done
 * await resolver.cleanup();
 * ```
 *
 * @public
 * @since 0.3.0
 */
export class BufResolver {
  #modules: string[];
  #options: Required<BufResolverOptions>;
  #fileSystem: FileSystem;
  #tempDirs: string[] = [];

  constructor(modules: string[], options: BufResolverOptions = {}) {
    const includeWKTs = options.includeWKTs ?? true;

    // Automatically include well-known types if requested and not already present
    this.#modules = this.buildModuleList(modules, includeWKTs);

    this.#fileSystem = options.fileSystem ?? new DefaultFileSystem();
    this.#options = {
      bufToken: options.bufToken,
      tempDir: options.tempDir ?? os.tmpdir(),
      fileSystem: this.#fileSystem,
      includeDependencies: options.includeDependencies ?? true,
      includeWKTs,
    } as Required<BufResolverOptions>;
  }

  /**
   * Downloads and extracts all specified modules to temporary directories.
   *
   * @returns Array of temporary directory paths containing the extracted proto files
   * @throws {BufResolverError} When module download or extraction fails
   */
  async preloadModules(): Promise<string[]> {
    const tempDirs: string[] = [];

    for (const moduleCoord of this.#modules) {
      const coordinate = this.parseModuleCoordinate(moduleCoord);
      const tempDir = await this.downloadAndExtractModule(coordinate);
      tempDirs.push(tempDir);
    }

    this.#tempDirs = tempDirs;
    return tempDirs;
  }

  /**
   * Cleans up all temporary directories created by this resolver.
   */
  async cleanup(): Promise<void> {
    for (const tempDir of this.#tempDirs) {
      try {
        await this.#fileSystem.rmdir(tempDir, { recursive: true });
      } catch (error) {
        // Ignore cleanup errors - temp files will be cleaned up by OS eventually
        console.warn(`Warning: Failed to clean up temp directory ${tempDir}:`, error);
      }
    }
    this.#tempDirs = [];
  }

  /**
   * Gets the list of temporary directories for testing purposes.
   * @internal
   */
  getTempDirs(): string[] {
    return [...this.#tempDirs];
  }

  /**
   * Gets the list of modules that will be downloaded for testing purposes.
   * @internal
   */
  getModules(): string[] {
    return [...this.#modules];
  }

  /**
   * Builds the final module list, optionally adding well-known types.
   *
   * @param modules User-specified modules
   * @param includeWKTs Whether to include well-known types
   * @returns Final list of modules to download
   */
  private buildModuleList(modules: string[], includeWKTs: boolean): string[] {
    const moduleList = [...modules];

    if (includeWKTs) {
      const wktModule = 'buf.build/protocolbuffers/wellknowntypes';

      // Check if well-known types are already included
      const hasWKTs = moduleList.some(module => {
        const normalized = module.toLowerCase().replace(/:.*$/, ''); // Remove version
        return normalized === wktModule || normalized.endsWith('/wellknowntypes');
      });

      if (!hasWKTs) {
        // Add the latest version of well-known types
        moduleList.unshift(wktModule);
      }
    }

    return moduleList;
  }

  /**
   * Sets temporary directories for testing purposes.
   * @internal
   */
  setTempDirs(dirs: string[]): void {
    this.#tempDirs = dirs;
  }

  /**
   * Parses a module coordinate string into its components.
   * Wraps the standalone parseModuleCoordinate function and converts errors.
   *
   * @param coordinate Module coordinate (e.g., "buf.build/bufbuild/protovalidate:v1.0.0")
   * @returns Parsed coordinate components
   * @throws {BufResolverError} When coordinate format is invalid
   */
  private parseModuleCoordinate(coordinate: string): ModuleCoordinate {
    try {
      return parseModuleCoordinate(coordinate);
    } catch (error) {
      if (error instanceof ModuleCoordinateError) {
        throw new BufResolverError(`Invalid module coordinate: ${error.message}`, undefined, error.coordinate);
      }
      throw error;
    }
  }

  /**
   * Downloads and extracts a module to a temporary directory.
   *
   * @param coordinate Parsed module coordinate
   * @returns Path to temporary directory containing extracted files
   * @throws {BufResolverError} When download or extraction fails
   */
  private async downloadAndExtractModule(coordinate: ModuleCoordinate): Promise<string> {
    // Create unique temporary directory
    const tempDir = path.join(
      this.#options.tempDir,
      `.buf-resolver-${coordinate.owner}-${coordinate.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      await this.#fileSystem.mkdir(tempDir, { recursive: true });

      // Download archive
      const archiveUrl = this.buildArchiveUrl(coordinate);
      const archiveBuffer = await this.downloadArchive(archiveUrl, coordinate);

      // Extract archive
      await this.extractTarGz(archiveBuffer, tempDir);

      return tempDir;
    } catch (error) {
      // Clean up on failure
      try {
        await this.#fileSystem.rmdir(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }

      if (error instanceof BufResolverError) {
        throw error;
      }

      throw new BufResolverError(
        `Failed to download and extract module: ${error}`,
        undefined,
        `${coordinate.instance}/${coordinate.owner}/${coordinate.name}`,
      );
    }
  }

  /**
   * Builds the archive download URL for a module.
   *
   * @param coordinate Parsed module coordinate
   * @returns Archive download URL
   */
  private buildArchiveUrl(coordinate: ModuleCoordinate): string {
    const { instance, owner, name, version } = coordinate;
    const ref = version || 'main';

    let url = `https://${instance}/${owner}/${name}/archive/${ref}.tar.gz`;

    if (this.#options.includeDependencies) {
      url += '?imports=true';
    }

    return url;
  }

  /**
   * Downloads an archive from the given URL.
   *
   * @param url Archive download URL
   * @param coordinate Module coordinate for error context
   * @returns Archive content as Buffer
   * @throws {BufResolverError} When download fails
   */
  private async downloadArchive(url: string, coordinate: ModuleCoordinate): Promise<Buffer> {
    const headers: Record<string, string> = {
      'User-Agent': '@pseudomutojs/proto-parser BufResolver',
    };

    if (this.#options.bufToken) {
      headers['Authorization'] = `Bearer ${this.#options.bufToken}`;
    }

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new BufResolverError(
          `Failed to download module archive: ${response.status} ${response.statusText}`,
          response.status,
          `${coordinate.instance}/${coordinate.owner}/${coordinate.name}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof BufResolverError) {
        throw error;
      }

      throw new BufResolverError(
        `Network error downloading module: ${error}`,
        undefined,
        `${coordinate.instance}/${coordinate.owner}/${coordinate.name}`,
      );
    }
  }

  /**
   * Extracts a tar.gz buffer to the specified directory.
   * Uses Node.js built-in zlib and stream processing.
   *
   * @param tarGzBuffer Compressed archive buffer
   * @param targetDir Directory to extract files to
   * @throws {BufResolverError} When extraction fails
   */
  private async extractTarGz(tarGzBuffer: Buffer, targetDir: string): Promise<void> {
    try {
      // Create a readable stream from the buffer
      const bufferStream = stream.Readable.from(tarGzBuffer);

      // Create gunzip stream
      const gunzip = zlib.createGunzip();

      // Create tar parser stream
      const tarParser = new TarExtractStream(targetDir, this.#fileSystem);

      // Pipeline: buffer -> gunzip -> tar parser
      await pipeline(bufferStream, gunzip, tarParser);
    } catch (error) {
      throw new BufResolverError(`Failed to extract archive: ${error}`);
    }
  }
}
