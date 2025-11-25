/**
 * Jest mock implementation of Node.js path module.
 * This mock is automatically used when jest.mock('path') is called.
 *
 * Since path operations are pure functions (no I/O), this mock mostly
 * delegates to the real path module but allows test customization.
 */

// Import the real path module to delegate to
const realPath = jest.requireActual('path');

// Create mockable versions of path methods
export const join = jest.fn().mockImplementation((...paths: string[]) => {
  return realPath.join(...paths);
});

export const resolve = jest.fn().mockImplementation((...paths: string[]) => {
  return realPath.resolve(...paths);
});

export const dirname = jest.fn().mockImplementation((path: string) => {
  return realPath.dirname(path);
});

export const basename = jest.fn().mockImplementation((path: string, ext?: string) => {
  return realPath.basename(path, ext);
});

export const extname = jest.fn().mockImplementation((path: string) => {
  return realPath.extname(path);
});

export const isAbsolute = jest.fn().mockImplementation((path: string) => {
  return realPath.isAbsolute(path);
});

export const relative = jest.fn().mockImplementation((from: string, to: string) => {
  return realPath.relative(from, to);
});

export const normalize = jest.fn().mockImplementation((path: string) => {
  return realPath.normalize(path);
});

export const parse = jest.fn().mockImplementation((path: string) => {
  return realPath.parse(path);
});

export const format = jest.fn().mockImplementation((pathObject: ReturnType<typeof realPath.parse>) => {
  return realPath.format(pathObject);
});

// Export constants from real path
export const { sep, delimiter, posix, win32 } = realPath;

// Export mock factory for direct use in tests if needed
export const createMockPath = () => ({
  join: jest.fn().mockImplementation(realPath.join),
  resolve: jest.fn().mockImplementation(realPath.resolve),
  dirname: jest.fn().mockImplementation(realPath.dirname),
  basename: jest.fn().mockImplementation(realPath.basename),
  extname: jest.fn().mockImplementation(realPath.extname),
  isAbsolute: jest.fn().mockImplementation(realPath.isAbsolute),
  relative: jest.fn().mockImplementation(realPath.relative),
  normalize: jest.fn().mockImplementation(realPath.normalize),
  parse: jest.fn().mockImplementation(realPath.parse),
  format: jest.fn().mockImplementation(realPath.format),
  sep: realPath.sep,
  delimiter: realPath.delimiter,
  posix: realPath.posix,
  win32: realPath.win32,
});
