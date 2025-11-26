import * as path from 'path';

import { FileSystem } from '../types';
import { BufApiError, BufConfigurationError, BufImportResolver, BufImportResolverOptions } from './BufImportResolver';

// Mock fetch globally
global.fetch = jest.fn();

/**
 * MockFileSystem - In-memory filesystem implementation for testing
 */
class MockFileSystem implements FileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  async access(path: string): Promise<void> {
    if (!this.files.has(path) && !this.directories.has(path)) {
      throw new Error('ENOENT');
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      // Create all parent directories
      const parts = path.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        this.directories.add(currentPath);
      }
    } else {
      this.directories.add(path);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async writeFile(path: string, content: string, _encoding: string): Promise<void> {
    this.files.set(path, content);
    // Also ensure parent directory exists
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      this.directories.add(dir);
    }
  }

  async readFile(path: string): Promise<Buffer> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error('ENOENT');
    }
    return Buffer.from(content);
  }

  // Helper methods for tests
  addFile(path: string, content: string): void {
    this.files.set(path, content);
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      this.directories.add(dir);
    }
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  clear(): void {
    this.files.clear();
    this.directories.clear();
  }
}

describe('BufImportResolver', () => {
  let resolver: BufImportResolver;
  let mockFs: MockFileSystem;
  const baseDir = '/test/base';
  const testCacheDir = '/test/cache';
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs = new MockFileSystem();
  });

  describe('constructor', () => {
    it('should initialize with module mappings and default options', () => {
      const moduleMapping = {
        'buf/validate/': 'buf.build/bufbuild/protovalidate:v1.0.0',
      };

      resolver = new BufImportResolver(baseDir, moduleMapping, {
        fileSystem: mockFs,
      });
      expect(resolver).toBeInstanceOf(BufImportResolver);
    });

    it('should accept token and cache dir options', () => {
      const moduleMapping = {};
      const options: BufImportResolverOptions = {
        bufToken: 'test-token-123',
        cacheDir: '/custom/cache',
        fileSystem: mockFs,
      };

      resolver = new BufImportResolver(baseDir, moduleMapping, options);
      expect(resolver).toBeInstanceOf(BufImportResolver);
    });
  });

  describe('pattern matching', () => {
    beforeEach(() => {
      const moduleMapping = {
        'buf/validate/': 'buf.build/bufbuild/protovalidate:v1.0.0',
        'google/type/*.proto': 'buf.build/googleapis/googleapis',
        'exact/match.proto': 'buf.build/exact/module',
        'company/**/*.proto': 'buf.build/company/internal',
      };

      resolver = new BufImportResolver(baseDir, moduleMapping, {
        cacheDir: testCacheDir,
        fileSystem: mockFs,
      });
    });

    it('should match prefix patterns', async () => {
      // No cached file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'buf/validate/validate.proto',
                syntax: 'proto3',
                package: 'buf.validate',
                messageType: [],
              },
            ],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('buf/validate/validate.proto');

      expect(result).toBeTruthy();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/GetFileDescriptorSet'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('buf.build/bufbuild/protovalidate'),
        }),
      );
    });

    it('should match wildcard patterns', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'google/type/date.proto',
                syntax: 'proto3',
                package: 'google.type',
              },
            ],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('google/type/date.proto');

      expect(result).toBeTruthy();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('buf.build/googleapis/googleapis'),
        }),
      );
    });

    it('should match exact patterns', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'exact/match.proto',
                syntax: 'proto3',
              },
            ],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('exact/match.proto');

      expect(result).toBeTruthy();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('buf.build/exact/module'),
        }),
      );
    });

    it('should match double wildcard patterns', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'company/services/user/user.proto',
                syntax: 'proto3',
                package: 'company.services.user',
                messageType: [
                  {
                    name: 'User',
                    field: [
                      {
                        name: 'id',
                        number: 1,
                        type: 9, // string
                        label: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('company/services/user/user.proto');

      // Since we're using default temp cache, just check it ends with the right file
      expect(result).toBeTruthy();
      expect(result).toContain('company/services/user/user.proto');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should fall back to default resolution for non-matching patterns', async () => {
      // Add a local file that exists
      const localFilePath = path.resolve(baseDir, 'local/file.proto');
      mockFs.addFile(localFilePath, 'syntax = "proto3";');

      const result = await resolver.resolveImport('local/file.proto');

      // Should resolve to local path via default resolver
      expect(result).toBe(localFilePath);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Buf API interaction', () => {
    beforeEach(() => {
      resolver = new BufImportResolver(
        baseDir,
        {
          'buf/validate/': 'buf.build/bufbuild/protovalidate:v1.0.0',
        },
        {
          bufToken: 'test-auth-token',
          cacheDir: testCacheDir,
          fileSystem: mockFs,
        },
      );
    });

    it('should include auth token in API requests when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'buf/validate/validate.proto',
                syntax: 'proto3',
              },
            ],
          },
        }),
      } as Response);

      await resolver.resolveImport('buf/validate/validate.proto');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-auth-token',
          }),
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      } as Response);

      // Should throw BufApiError when Buf API fails and no local fallback is available
      await expect(resolver.resolveImport('buf/validate/missing.proto')).rejects.toThrow(BufApiError);
      await expect(resolver.resolveImport('buf/validate/missing.proto')).rejects.toThrow(
        'Buf API request failed: Not Found',
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Should throw BufApiError when network fails and no local fallback is available
      await expect(resolver.resolveImport('buf/validate/validate.proto')).rejects.toThrow(BufApiError);
      await expect(resolver.resolveImport('buf/validate/validate.proto')).rejects.toThrow(
        'Failed to fetch from Buf API: Error: Network error',
      );
    });

    it('should fall back to local resolution when API fails but local file exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      } as Response);

      // Add a local file that matches the pattern
      const localFilePath = path.resolve(baseDir, 'buf/validate/validate.proto');
      mockFs.addFile(localFilePath, 'syntax = "proto3"; package buf.validate;');

      // Should fall back to local file instead of throwing error
      const result = await resolver.resolveImport('buf/validate/validate.proto');
      expect(result).toBe(localFilePath);
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      resolver = new BufImportResolver(
        baseDir,
        {
          'cached/': 'buf.build/test/module',
        },
        {
          cacheDir: testCacheDir,
          fileSystem: mockFs,
        },
      );
    });

    it('should use cached file if it exists', async () => {
      // Add cached file
      const cachedFilePath = path.join(testCacheDir, 'cached/test.proto');
      mockFs.addFile(cachedFilePath, 'cached proto content');

      const result = await resolver.resolveImport('cached/test.proto');

      expect(result).toBe(cachedFilePath);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch and cache file if not in cache', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'cached/test.proto',
                syntax: 'proto3',
                package: 'test',
                messageType: [
                  {
                    name: 'TestMessage',
                    field: [
                      {
                        name: 'id',
                        number: 1,
                        type: 9, // string
                        label: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('cached/test.proto');

      expect(result).toBe(path.join(testCacheDir, 'cached/test.proto'));
      expect(mockFetch).toHaveBeenCalled();
      // Check that file was written to cache
      expect(mockFs.hasFile(path.join(testCacheDir, 'cached/test.proto'))).toBe(true);
    });

    it('should create cache subdirectories as needed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'cached/deep/nested/file.proto',
                syntax: 'proto3',
              },
            ],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('cached/deep/nested/file.proto');

      // Should create nested directories and cache file
      expect(result).toBe(path.join(testCacheDir, 'cached/deep/nested/file.proto'));
      expect(mockFs.hasFile(path.join(testCacheDir, 'cached/deep/nested/file.proto'))).toBe(true);
    });
  });

  describe('FileDescriptorSet reconstruction', () => {
    beforeEach(() => {
      resolver = new BufImportResolver(
        baseDir,
        {
          'test/': 'buf.build/test/module',
        },
        {
          cacheDir: testCacheDir,
          fileSystem: mockFs,
        },
      );
    });

    it('should reconstruct proto with messages correctly', async () => {
      const fileDescriptorSet = {
        file: [
          {
            name: 'test/user.proto',
            syntax: 'proto3',
            package: 'test.user',
            dependency: ['google/protobuf/timestamp.proto'],
            messageType: [
              {
                name: 'User',
                field: [
                  {
                    name: 'id',
                    number: 1,
                    type: 9, // string
                    label: 1,
                  },
                  {
                    name: 'email',
                    number: 2,
                    type: 9, // string
                    label: 1,
                  },
                  {
                    name: 'age',
                    number: 3,
                    type: 5, // int32
                    label: 1,
                  },
                  {
                    name: 'tags',
                    number: 4,
                    type: 9, // string
                    label: 3, // repeated
                  },
                  {
                    name: 'created_at',
                    number: 5,
                    typeName: '.google.protobuf.Timestamp',
                    label: 1,
                  },
                ],
              },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fileDescriptorSet }),
      } as Response);

      const result = await resolver.resolveImport('test/user.proto');

      expect(result).toBeTruthy();

      // Verify the content was written correctly
      const writtenContent = mockFs.getFile(result as string) || '';
      expect(writtenContent).toContain('syntax = "proto3"');
      expect(writtenContent).toContain('package test.user');
      expect(writtenContent).toContain('import "google/protobuf/timestamp.proto"');
      expect(writtenContent).toContain('message User {');
      expect(writtenContent).toContain('string id = 1');
      expect(writtenContent).toContain('string email = 2');
      expect(writtenContent).toContain('int32 age = 3');
      expect(writtenContent).toContain('repeated string tags = 4');
      expect(writtenContent).toContain('google.protobuf.Timestamp created_at = 5');
    });

    it('should handle enums correctly', async () => {
      const fileDescriptorSet = {
        file: [
          {
            name: 'test/status.proto',
            syntax: 'proto3',
            package: 'test',
            enumType: [
              {
                name: 'Status',
                value: [
                  { name: 'STATUS_UNKNOWN', number: 0 },
                  { name: 'STATUS_ACTIVE', number: 1 },
                  { name: 'STATUS_INACTIVE', number: 2 },
                ],
              },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fileDescriptorSet }),
      } as Response);

      const result = await resolver.resolveImport('test/status.proto');

      const writtenContent = mockFs.getFile(result as string) || '';
      expect(writtenContent).toContain('enum Status {');
      expect(writtenContent).toContain('STATUS_UNKNOWN = 0');
      expect(writtenContent).toContain('STATUS_ACTIVE = 1');
      expect(writtenContent).toContain('STATUS_INACTIVE = 2');
    });

    it('should handle services correctly', async () => {
      const fileDescriptorSet = {
        file: [
          {
            name: 'test/service.proto',
            syntax: 'proto3',
            package: 'test',
            service: [
              {
                name: 'UserService',
                method: [
                  {
                    name: 'GetUser',
                    inputType: '.test.GetUserRequest',
                    outputType: '.test.User',
                    clientStreaming: false,
                    serverStreaming: false,
                  },
                  {
                    name: 'ListUsers',
                    inputType: '.test.ListUsersRequest',
                    outputType: '.test.User',
                    clientStreaming: false,
                    serverStreaming: true,
                  },
                ],
              },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fileDescriptorSet }),
      } as Response);

      const result = await resolver.resolveImport('test/service.proto');

      const writtenContent = mockFs.getFile(result as string) || '';
      expect(writtenContent).toContain('service UserService {');
      // Service methods might have leading dots in type names
      expect(writtenContent).toMatch(/rpc GetUser\(.*GetUserRequest\) returns \(.*User\);/);
      expect(writtenContent).toMatch(/rpc ListUsers\(.*ListUsersRequest\) returns \(stream .*User\);/);
    });

    it('should handle nested messages and oneofs', async () => {
      const fileDescriptorSet = {
        file: [
          {
            name: 'test/complex.proto',
            syntax: 'proto3',
            package: 'test',
            messageType: [
              {
                name: 'ComplexMessage',
                field: [
                  {
                    name: 'id',
                    number: 1,
                    type: 9,
                    label: 1,
                  },
                  {
                    name: 'email',
                    number: 2,
                    type: 9,
                    label: 1,
                    oneofIndex: 0,
                  },
                  {
                    name: 'phone',
                    number: 3,
                    type: 9,
                    label: 1,
                    oneofIndex: 0,
                  },
                ],
                oneofDecl: [{ name: 'contact' }],
                nestedType: [
                  {
                    name: 'Nested',
                    field: [
                      {
                        name: 'value',
                        number: 1,
                        type: 9,
                        label: 1,
                      },
                    ],
                  },
                ],
                enumType: [
                  {
                    name: 'Type',
                    value: [
                      { name: 'TYPE_A', number: 0 },
                      { name: 'TYPE_B', number: 1 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fileDescriptorSet }),
      } as Response);

      const result = await resolver.resolveImport('test/complex.proto');

      const writtenContent = mockFs.getFile(result as string) || '';
      expect(writtenContent).toContain('message ComplexMessage {');
      expect(writtenContent).toContain('string id = 1');
      expect(writtenContent).toContain('oneof contact {');
      expect(writtenContent).toContain('string email = 2');
      expect(writtenContent).toContain('string phone = 3');
      expect(writtenContent).toContain('message Nested {');
      expect(writtenContent).toContain('string value = 1');
      expect(writtenContent).toContain('enum Type {');
    });

    it('should handle proto options', async () => {
      const fileDescriptorSet = {
        file: [
          {
            name: 'test/options.proto',
            syntax: 'proto3',
            package: 'test',
            options: {
              javaPackage: 'com.example.test',
              goPackage: 'github.com/example/test',
              javaMultipleFiles: true,
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fileDescriptorSet }),
      } as Response);

      const result = await resolver.resolveImport('test/options.proto');

      const writtenContent = mockFs.getFile(result as string) || '';
      expect(writtenContent).toContain('option java_package = "com.example.test"');
      expect(writtenContent).toContain('option go_package = "github.com/example/test"');
      expect(writtenContent).toContain('option java_multiple_files = true');
    });
  });

  describe('request deduplication', () => {
    beforeEach(() => {
      resolver = new BufImportResolver(
        baseDir,
        {
          'test/': 'buf.build/test/module:v1.0.0',
        },
        {
          cacheDir: testCacheDir,
          fileSystem: mockFs,
        },
      );
    });

    it('should deduplicate concurrent API requests for the same module', async () => {
      // Mock API responses - both return the same FileDescriptorSet with both files
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'test/file1.proto',
                syntax: 'proto3',
                package: 'test',
                messageType: [{ name: 'File1Message' }],
              },
              {
                name: 'test/file2.proto',
                syntax: 'proto3',
                package: 'test',
                messageType: [{ name: 'File2Message' }],
              },
            ],
          },
        }),
      } as Response);

      // Start two concurrent requests for files from the same module
      const [result1, result2] = await Promise.all([
        resolver.resolveImport('test/file1.proto'),
        resolver.resolveImport('test/file2.proto'),
      ]);

      // Both should succeed
      expect(result1).toContain('file1.proto');
      expect(result2).toContain('file2.proto');

      // Only one API call should have been made (deduplication working)
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify the API was called with the correct module
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('GetFileDescriptorSet'),
        expect.objectContaining({
          body: expect.stringContaining('buf.build/test/module'),
        }),
      );
    });

    it('should use memory cache for subsequent requests to the same module', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'test/cached.proto',
                syntax: 'proto3',
                package: 'test',
                messageType: [{ name: 'CachedMessage' }],
              },
              {
                name: 'test/other.proto',
                syntax: 'proto3',
                package: 'test',
                messageType: [{ name: 'OtherMessage' }],
              },
            ],
          },
        }),
      } as Response);

      // First request - should hit API
      const result1 = await resolver.resolveImport('test/cached.proto');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result1).toContain('cached.proto');

      // Second request for same file - returns cached file path from disk
      const result2 = await resolver.resolveImport('test/cached.proto');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(result2).toBe(result1); // Same cached file path

      // Third request for a different file from same module - uses memory-cached FileDescriptorSet
      const result3 = await resolver.resolveImport('test/other.proto');
      // Should still be 1 call because the FileDescriptorSet is cached
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result3).toContain('other.proto');
    });

    it('should clear memory caches when requested', async () => {
      const fileDescriptorSet = {
        file: [
          {
            name: 'test/memory1.proto',
            syntax: 'proto3',
            package: 'test',
            messageType: [{ name: 'Memory1' }],
          },
          {
            name: 'test/memory2.proto',
            syntax: 'proto3',
            package: 'test',
            messageType: [{ name: 'Memory2' }],
          },
          {
            name: 'test/memory3.proto',
            syntax: 'proto3',
            package: 'test',
            messageType: [{ name: 'Memory3' }],
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ fileDescriptorSet }),
      } as Response);

      // First request for memory1.proto - hits API
      await resolver.resolveImport('test/memory1.proto');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second request for memory2.proto - should use memory cache (same module)
      await resolver.resolveImport('test/memory2.proto');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1

      // Clear memory caches
      resolver.clearMemoryCaches();

      // Third request for a new file from same module - should hit API again
      await resolver.resolveImport('test/memory3.proto');
      expect(mockFetch).toHaveBeenCalledTimes(2); // Now 2 calls
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      resolver = new BufImportResolver(
        baseDir,
        {
          'test/': 'buf.build/test/module',
        },
        {
          cacheDir: testCacheDir,
          fileSystem: mockFs,
        },
      );
    });

    it('should handle empty FileDescriptorSet', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('test/empty.proto');

      expect(result).toBeNull();
    });

    it('should handle missing file in FileDescriptorSet', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'different/file.proto',
                syntax: 'proto3',
                package: 'different',
              },
            ],
          },
        }),
      } as Response);

      const result = await resolver.resolveImport('test/missing.proto');

      // Should reconstruct from available file
      expect(result).toMatch(/\/test\/missing\.proto$/);

      const writtenContent = mockFs.getFile(result as string) || '';
      expect(writtenContent).toContain('syntax = "proto3"');
      expect(writtenContent).toContain('package different');
    });

    it('should handle module reference without version', async () => {
      resolver = new BufImportResolver(
        baseDir,
        {
          'no-version/': 'buf.build/test/module', // No version specified
        },
        {
          cacheDir: testCacheDir,
          fileSystem: mockFs,
        },
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'no-version/test.proto',
                syntax: 'proto3',
              },
            ],
          },
        }),
      } as Response);

      await resolver.resolveImport('no-version/test.proto');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('"module":"buf.build/test/module"'),
        }),
      );
      // Should not include version in request
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.not.stringContaining('"version"'),
        }),
      );
    });

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing fileDescriptorSet
          error: 'Invalid request',
        }),
      } as Response);

      const result = await resolver.resolveImport('test/malformed.proto');

      expect(result).toBeNull();
    });
  });

  describe('security', () => {
    beforeEach(() => {
      resolver = new BufImportResolver(
        baseDir,
        {
          // Use patterns that will match the malicious paths to trigger validation
          '../': 'buf.build/test/module',
          '/': 'buf.build/test/module',
          'test/': 'buf.build/test/module',
          '**': 'buf.build/catch-all/module',
        },
        {
          cacheDir: testCacheDir,
          fileSystem: mockFs,
        },
      );

      // Mock successful API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          fileDescriptorSet: {
            file: [
              {
                name: 'test.proto',
                syntax: 'proto3',
                package: 'test',
                messageType: [],
              },
            ],
          },
        }),
      } as Response);
    });

    it('should reject path traversal with .. segments', async () => {
      await expect(resolver.resolveImport('../../../etc/passwd')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('test/../../../etc/passwd')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('../test.proto')).rejects.toThrow(BufConfigurationError);
    });

    it('should reject absolute paths', async () => {
      await expect(resolver.resolveImport('/etc/passwd')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('/home/user/test.proto')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('C:\\Windows\\System32\\test.proto')).rejects.toThrow(BufConfigurationError);
    });

    it('should reject paths with null bytes', async () => {
      await expect(resolver.resolveImport('test\0.proto')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('test/file\0.proto')).rejects.toThrow(BufConfigurationError);
    });

    it('should reject empty or invalid import paths', async () => {
      await expect(resolver.resolveImport('')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('.')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('..')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('./test.proto')).rejects.toThrow(BufConfigurationError);
    });

    it('should reject paths starting with separators', async () => {
      await expect(resolver.resolveImport('/test.proto')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('\\test.proto')).rejects.toThrow(BufConfigurationError);
    });

    it('should accept valid relative import paths', async () => {
      // These should not throw errors
      await expect(resolver.resolveImport('test/valid.proto')).resolves.toBeTruthy();
      await expect(resolver.resolveImport('deeply/nested/path/file.proto')).resolves.toBeTruthy();
      await expect(resolver.resolveImport('single.proto')).resolves.toBeTruthy();
    });

    it('should reject path traversal in Windows-style paths', async () => {
      await expect(resolver.resolveImport('test\\..\\..\\system.proto')).rejects.toThrow(BufConfigurationError);
      await expect(resolver.resolveImport('..\\test.proto')).rejects.toThrow(BufConfigurationError);
    });
  });
});
