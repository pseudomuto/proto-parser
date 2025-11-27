import * as path from 'path';

import { extractNamespace, getProtoDirectory, joinNamespace } from './general';

describe('general utilities', () => {
  describe('getProtoDirectory', () => {
    test('should return directory of proto file', () => {
      const testPath = '/tmp/api/user/v1/user_service.proto';
      const result = getProtoDirectory(testPath);
      expect(result).toBe(path.dirname(testPath));
    });

    test('should return current working directory for empty path', () => {
      const result = getProtoDirectory('');
      expect(result).toBe(process.cwd());
    });

    test('should handle absolute paths', () => {
      const absolutePath = path.resolve('/tmp/test.proto');
      const result = getProtoDirectory(absolutePath);
      expect(result).toBe('/tmp');
    });
  });

  describe('extractNamespace', () => {
    test('should extract namespace and name from qualified names', () => {
      expect(extractNamespace('google.protobuf.Timestamp')).toEqual({
        namespace: 'google.protobuf',
        name: 'Timestamp',
      });
    });

    test('should handle single-level names', () => {
      expect(extractNamespace('User')).toEqual({
        namespace: '',
        name: 'User',
      });
    });

    test('should handle deeply nested names', () => {
      expect(extractNamespace('com.example.service.v1.UserService')).toEqual({
        namespace: 'com.example.service.v1',
        name: 'UserService',
      });
    });

    test('should handle empty strings', () => {
      expect(extractNamespace('')).toEqual({
        namespace: '',
        name: '',
      });
    });

    test('should handle names with trailing dots', () => {
      expect(extractNamespace('com.example.')).toEqual({
        namespace: 'com.example',
        name: '',
      });
    });
  });

  describe('joinNamespace', () => {
    test('should join namespace parts with dots', () => {
      expect(joinNamespace('google', 'protobuf')).toBe('google.protobuf');
    });

    test('should handle empty parts', () => {
      expect(joinNamespace('', 'protobuf', '', 'Timestamp')).toBe('protobuf.Timestamp');
    });

    test('should handle single parts', () => {
      expect(joinNamespace('example')).toBe('example');
    });

    test('should handle no parts', () => {
      expect(joinNamespace()).toBe('');
    });

    test('should handle multiple levels', () => {
      expect(joinNamespace('com', 'example', 'service', 'v1')).toBe('com.example.service.v1');
    });
  });
});
