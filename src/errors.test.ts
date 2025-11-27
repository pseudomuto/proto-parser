/**
 * @fileoverview Tests for error classes and utilities
 */
import {
  ProtoBuildError,
  ProtoParseError,
  ProtoParserError,
  formatErrorMessage,
  getErrorMessage,
  isNodeError,
} from './errors';

describe('ProtoParserError', () => {
  it('should create error with message and name', () => {
    const error = new ProtoParserError('test message');
    expect(error.message).toBe('test message');
    expect(error.name).toBe('ProtoParserError');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('original error');
    const error = new ProtoParserError('test message', cause);
    expect(error.message).toBe('test message');
    expect(error.name).toBe('ProtoParserError');
    expect(error.cause).toBe(cause);
  });

  it('should be instance of Error', () => {
    const error = new ProtoParserError('test message');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProtoParserError);
  });
});

describe('ProtoParseError', () => {
  it('should create error with message and filePath', () => {
    const error = new ProtoParseError('parse failed', '/path/to/file.proto');
    expect(error.message).toBe('parse failed');
    expect(error.name).toBe('ProtoParseError');
    expect(error.filePath).toBe('/path/to/file.proto');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with message, filePath, and cause', () => {
    const cause = new Error('underlying error');
    const error = new ProtoParseError('parse failed', '/path/to/file.proto', cause);
    expect(error.message).toBe('parse failed');
    expect(error.name).toBe('ProtoParseError');
    expect(error.filePath).toBe('/path/to/file.proto');
    expect(error.cause).toBe(cause);
  });

  it('should create error without filePath', () => {
    const error = new ProtoParseError('parse failed');
    expect(error.message).toBe('parse failed');
    expect(error.name).toBe('ProtoParseError');
    expect(error.filePath).toBeUndefined();
  });

  it('should inherit from ProtoParserError', () => {
    const error = new ProtoParseError('parse failed');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProtoParserError);
    expect(error).toBeInstanceOf(ProtoParseError);
  });
});

describe('ProtoBuildError', () => {
  it('should create error with message and filePath', () => {
    const error = new ProtoBuildError('build failed', '/path/to/file.proto');
    expect(error.message).toBe('build failed');
    expect(error.name).toBe('ProtoBuildError');
    expect(error.filePath).toBe('/path/to/file.proto');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with message, filePath, and cause', () => {
    const cause = new Error('underlying error');
    const error = new ProtoBuildError('build failed', '/path/to/file.proto', cause);
    expect(error.message).toBe('build failed');
    expect(error.name).toBe('ProtoBuildError');
    expect(error.filePath).toBe('/path/to/file.proto');
    expect(error.cause).toBe(cause);
  });

  it('should create error without filePath', () => {
    const error = new ProtoBuildError('build failed');
    expect(error.message).toBe('build failed');
    expect(error.name).toBe('ProtoBuildError');
    expect(error.filePath).toBeUndefined();
  });

  it('should inherit from ProtoParserError', () => {
    const error = new ProtoBuildError('build failed');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProtoParserError);
    expect(error).toBeInstanceOf(ProtoBuildError);
  });
});

describe('formatErrorMessage', () => {
  it('should return base message when no context provided', () => {
    const result = formatErrorMessage('base message');
    expect(result).toBe('base message');
  });

  it('should return base message when context is empty', () => {
    const result = formatErrorMessage('base message', {});
    expect(result).toBe('base message');
  });

  it('should format message with single context entry', () => {
    const result = formatErrorMessage('base message', { file: 'test.proto' });
    expect(result).toBe('base message\nContext:\n  file: test.proto');
  });

  it('should format message with multiple context entries', () => {
    const result = formatErrorMessage('base message', {
      file: 'test.proto',
      line: 42,
      type: 'message',
    });
    expect(result).toBe('base message\nContext:\n  file: test.proto\n  line: 42\n  type: message');
  });

  it('should handle various value types in context', () => {
    const result = formatErrorMessage('base message', {
      string: 'value',
      number: 123,
      boolean: true,
      null: null,
      undefined: undefined,
      object: { nested: 'value' },
    });
    expect(result).toContain('string: value');
    expect(result).toContain('number: 123');
    expect(result).toContain('boolean: true');
    expect(result).toContain('null: null');
    expect(result).toContain('undefined: undefined');
    expect(result).toContain('object: [object Object]');
  });
});

describe('isNodeError', () => {
  it('should return true for NodeJS error with code', () => {
    const error = new Error('test error') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    expect(isNodeError(error)).toBe(true);
  });

  it('should return false for regular Error without code', () => {
    const error = new Error('test error');
    expect(isNodeError(error)).toBe(false);
  });

  it('should return false for non-Error objects', () => {
    expect(isNodeError('string')).toBe(false);
    expect(isNodeError(123)).toBe(false);
    expect(isNodeError({})).toBe(false);
    expect(isNodeError(null)).toBe(false);
    expect(isNodeError(undefined)).toBe(false);
  });

  it('should return false for Error-like objects that are not Error instances', () => {
    const errorLike = { message: 'test', code: 'ENOENT' };
    expect(isNodeError(errorLike)).toBe(false);
  });

  it('should work with actual file system errors', () => {
    // Simulate an actual fs error
    const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    error.errno = -2;
    error.syscall = 'open';
    error.path = '/nonexistent/file';

    expect(isNodeError(error)).toBe(true);
  });
});

describe('getErrorMessage', () => {
  it('should return message from Error instance', () => {
    const error = new Error('test message');
    expect(getErrorMessage(error)).toBe('test message');
  });

  it('should return message from custom error classes', () => {
    const error = new ProtoParseError('parse error', 'file.proto');
    expect(getErrorMessage(error)).toBe('parse error');
  });

  it('should return string value when passed a string', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('should convert number to string', () => {
    expect(getErrorMessage(404)).toBe('404');
  });

  it('should convert boolean to string', () => {
    expect(getErrorMessage(true)).toBe('true');
    expect(getErrorMessage(false)).toBe('false');
  });

  it('should handle null and undefined', () => {
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('should handle objects', () => {
    expect(getErrorMessage({})).toBe('[object Object]');
    expect(getErrorMessage({ message: 'test' })).toBe('[object Object]');
  });

  it('should handle arrays', () => {
    expect(getErrorMessage([])).toBe('');
    expect(getErrorMessage(['a', 'b'])).toBe('a,b');
  });
});
