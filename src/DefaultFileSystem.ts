import * as fs from 'fs';

import { FileSystem } from './types';

/**
 * Default implementation of FileSystem interface using Node.js fs module.
 *
 * @public
 * @since 0.1.0
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
   * Read a file.
   * @param path File path
   * @returns File content as Buffer
   */
  async readFile(path: string): Promise<Buffer> {
    return fs.promises.readFile(path);
  }
}
