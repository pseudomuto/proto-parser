import * as fs from 'fs';
import * as path from 'path';

import { FileSystem } from './types';

/**
 * Default implementation of FileSystem interface using Node.js fs module.
 *
 * @public
 * @since 0.2.0
 */
export class DefaultFileSystem implements FileSystem {
  /**
   * Check access to a file or directory.
   * Throws an error if the file doesn't exist or isn't accessible.
   */
  async access(path: string): Promise<void> {
    await fs.promises.access(path);
  }

  /**
   * Create a directory.
   * @param path Directory path to create
   * @param options Options including recursive creation
   */
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.promises.mkdir(path, options);
  }

  /**
   * Write a file with content.
   * @param path File path
   * @param content File content
   * @param encoding File encoding (e.g., 'utf8')
   */
  async writeFile(path: string, content: string, encoding: BufferEncoding): Promise<void> {
    await fs.promises.writeFile(path, content, encoding);
  }

  /**
   * Check if a file or directory exists.
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Get file or directory stats.
   */
  async stat(filePath: string): Promise<fs.Stats> {
    return fs.promises.stat(filePath);
  }

  /**
   * Read directory contents.
   */
  async readDir(dirPath: string, options?: { withFileTypes?: boolean }): Promise<fs.Dirent[] | string[]> {
    if (options?.withFileTypes) {
      return fs.promises.readdir(dirPath, { withFileTypes: true });
    }
    return fs.promises.readdir(dirPath);
  }

  /**
   * Read a file.
   */
  async readFile(filePath: string): Promise<Buffer>;
  async readFile(filePath: string, encoding: BufferEncoding): Promise<string>;
  async readFile(filePath: string, encoding?: BufferEncoding): Promise<Buffer | string> {
    if (encoding) {
      return fs.promises.readFile(filePath, encoding);
    }
    return fs.promises.readFile(filePath);
  }

  /**
   * Read content from either a file path or return the input if it's already content.
   */
  async readFileOrLiteral(input: string): Promise<{ content: string; filePath: string }> {
    if (await this.isFilePath(input)) {
      const resolvedPath = path.resolve(input);
      const content = await this.readFile(resolvedPath, 'utf-8');
      return { content, filePath: resolvedPath };
    }

    return { content: input, filePath: '' };
  }

  /**
   * Get the full file path if input is a valid file path, empty string otherwise.
   */
  async filePathIfExists(input: string): Promise<string> {
    if (await this.isFilePath(input)) {
      return path.resolve(input);
    }
    return '';
  }

  /**
   * Determines if the input string is a file path rather than proto content.
   */
  private async isFilePath(input: string): Promise<boolean> {
    if (input.includes('\n') || input.includes('syntax =')) {
      return false;
    }

    return input.endsWith('.proto') || (await this.exists(input)) || (await this.exists(path.resolve(input)));
  }
}
