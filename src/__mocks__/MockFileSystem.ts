import { Stats } from 'fs';

import { IFileSystem } from '../types';

/**
 * Mock implementation of IFileSystem interface for testing.
 */
export class MockFileSystem implements IFileSystem {
  public files: Map<string, string | Buffer> = new Map();
  public directories: Set<string> = new Set();

  // Jest mock functions
  access = jest.fn().mockResolvedValue(undefined);
  exists = jest.fn().mockResolvedValue(true);
  stat = jest.fn().mockResolvedValue(this.createMockStats());
  readDir = jest.fn().mockResolvedValue(['mock-file.proto']);
  mkdir = jest.fn().mockResolvedValue(undefined);
  writeFile = jest.fn().mockResolvedValue(undefined);
  rmdir = jest.fn().mockResolvedValue(undefined);
  readFile = jest.fn().mockResolvedValue(Buffer.from('mock content'));
  readFileOrLiteral = jest.fn().mockResolvedValue({ content: 'mock content', filePath: '/mock/path.proto' });
  filePathIfExists = jest.fn().mockResolvedValue('/mock/path.proto');

  private createMockStats(isFile = true, isDirectory = false): Stats {
    return {
      isFile: jest.fn().mockReturnValue(isFile),
      isDirectory: jest.fn().mockReturnValue(isDirectory),
      isBlockDevice: jest.fn().mockReturnValue(false),
      isCharacterDevice: jest.fn().mockReturnValue(false),
      isSymbolicLink: jest.fn().mockReturnValue(false),
      isFIFO: jest.fn().mockReturnValue(false),
      isSocket: jest.fn().mockReturnValue(false),
      dev: 1,
      ino: 1,
      mode: 33188,
      nlink: 1,
      uid: 1000,
      gid: 1000,
      rdev: 0,
      size: 1024,
      blksize: 4096,
      blocks: 2,
      atimeMs: Date.now(),
      mtimeMs: Date.now(),
      ctimeMs: Date.now(),
      birthtimeMs: Date.now(),
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    } as Stats;
  }

  /**
   * Resets all mock functions and clears stored data.
   */
  reset(): void {
    this.files.clear();
    this.directories.clear();
    jest.clearAllMocks();

    // Reset mock implementations to defaults
    this.access.mockResolvedValue(undefined);
    this.exists.mockResolvedValue(true);
    this.stat.mockResolvedValue(this.createMockStats());
    this.readDir.mockResolvedValue(['mock-file.proto']);
    this.mkdir.mockResolvedValue(undefined);
    this.writeFile.mockResolvedValue(undefined);
    this.rmdir.mockResolvedValue(undefined);
    this.readFile.mockResolvedValue(Buffer.from('mock content'));
    this.readFileOrLiteral.mockResolvedValue({ content: 'mock content', filePath: '/mock/path.proto' });
    this.filePathIfExists.mockResolvedValue('/mock/path.proto');
  }
}
