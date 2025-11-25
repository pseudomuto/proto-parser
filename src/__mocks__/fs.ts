import { Stats } from 'fs';

/**
 * Jest mock implementation of Node.js fs module.
 * This mock is automatically used when jest.mock('fs') is called.
 *
 * Tests can configure mock behavior using:
 * - (fs.promises.readFile as jest.Mock).mockResolvedValue(content)
 * - (fs.promises.access as jest.Mock).mockRejectedValue(new Error('ENOENT'))
 * etc.
 */

// Create mock stats object
const createMockStats = (isFile = true, isDirectory = false): Stats =>
  ({
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
  }) as Stats;

// Default mock implementations
const mockReadFile = jest.fn().mockResolvedValue('mock file content');
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockStat = jest.fn().mockResolvedValue(createMockStats());
const mockReaddir = jest.fn().mockResolvedValue(['mock-file.proto']);
const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);

// Mock fs.constants
export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
};

// Mock fs.promises
export const promises = {
  readFile: mockReadFile,
  access: mockAccess,
  stat: mockStat,
  readdir: mockReaddir,
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  rmdir: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
};

// Legacy callback-based methods (for compatibility)
export const access = jest
  .fn()
  .mockImplementation(
    (
      path: string,
      mode: number | ((err: NodeJS.ErrnoException | null) => void),
      callback?: (err: NodeJS.ErrnoException | null) => void,
    ) => {
      if (typeof mode === 'function') {
        callback = mode;
        mode = constants.F_OK;
      }
      if (callback) callback(null);
    },
  );

export const readFile = jest
  .fn()
  .mockImplementation(
    (
      path: string,
      options:
        | string
        | { encoding?: BufferEncoding }
        | ((err: NodeJS.ErrnoException | null, data?: string | Buffer) => void),
      callback?: (err: NodeJS.ErrnoException | null, data?: string | Buffer) => void,
    ) => {
      if (typeof options === 'function') {
        callback = options;
        options = 'utf-8';
      }
      if (callback) callback(null, 'mock file content');
    },
  );

export const existsSync = jest.fn().mockReturnValue(true);
export const mkdirSync = jest.fn();
export const writeFileSync = jest.fn();
export const unlinkSync = jest.fn();
export const rmdirSync = jest.fn();

// Export mock factory for direct use in tests if needed
export const createMockFileSystem = () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue('test content'),
    access: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue(createMockStats()),
    readdir: jest.fn().mockResolvedValue(['test.proto']),
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
  constants,
  access: jest.fn(),
  readFile: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
});
