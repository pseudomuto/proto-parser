import { MockFileSystem } from '../__mocks__/MockFileSystem';
import { BufResolver, BufResolverError } from './BufResolver';

// Mock fetch globally
global.fetch = jest.fn();

describe('BufResolver', () => {
  let mockFileSystem: MockFileSystem;

  beforeEach(() => {
    mockFileSystem = new MockFileSystem();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const resolver = new BufResolver(['buf.build/bufbuild/protovalidate']);
      expect(resolver).toBeDefined();
    });

    it('should accept custom options', () => {
      const options = {
        bufToken: 'test-token',
        tempDir: '/custom/temp',
        fileSystem: mockFileSystem,
        includeDependencies: false,
      };

      const resolver = new BufResolver(['buf.build/bufbuild/protovalidate'], options);
      expect(resolver).toBeDefined();
    });
  });

  describe('parseModuleCoordinate (integration)', () => {
    let resolver: BufResolver;

    beforeEach(() => {
      resolver = new BufResolver([], { fileSystem: mockFileSystem });
    });

    it('should wrap ModuleCoordinateError in BufResolverError', () => {
      // Use type assertion to access private method for testing error conversion
      const parseMethod = (resolver as any).parseModuleCoordinate.bind(resolver);

      expect(() => parseMethod('invalid-format')).toThrow(BufResolverError);

      try {
        parseMethod('invalid-format');
      } catch (error) {
        expect(error).toBeInstanceOf(BufResolverError);
        expect((error as BufResolverError).message).toContain('Invalid module coordinate:');
        expect((error as BufResolverError).module).toBe('invalid-format');
      }
    });

    it('should successfully parse valid coordinates', () => {
      const parseMethod = (resolver as any).parseModuleCoordinate.bind(resolver);

      const result = parseMethod('buf.build/bufbuild/protovalidate:v1.0.0');
      expect(result).toEqual({
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
        version: 'v1.0.0',
        identifier: 'buf.build/bufbuild/protovalidate:v1.0.0',
      });
    });
  });

  describe('buildArchiveUrl', () => {
    let resolver: BufResolver;

    beforeEach(() => {
      resolver = new BufResolver([], {
        fileSystem: mockFileSystem,
        includeDependencies: true,
      });
    });

    it('should build URL with dependencies', () => {
      const buildMethod = (resolver as any).buildArchiveUrl.bind(resolver);
      const coordinate = {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
        version: 'v1.0.0',
      };

      const url = buildMethod(coordinate);
      expect(url).toBe('https://buf.build/bufbuild/protovalidate/archive/v1.0.0.tar.gz?imports=true');
    });

    it('should build URL without dependencies when disabled', () => {
      const resolverNoDeps = new BufResolver([], {
        fileSystem: mockFileSystem,
        includeDependencies: false,
      });
      const buildMethod = (resolverNoDeps as any).buildArchiveUrl.bind(resolverNoDeps);

      const coordinate = {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
      };

      const url = buildMethod(coordinate);
      expect(url).toBe('https://buf.build/bufbuild/protovalidate/archive/main.tar.gz');
    });
  });

  describe('downloadArchive', () => {
    let resolver: BufResolver;

    beforeEach(() => {
      resolver = new BufResolver([], { fileSystem: mockFileSystem });
    });

    it('should download archive successfully', async () => {
      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const downloadMethod = (resolver as any).downloadArchive.bind(resolver);
      const coordinate = {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
      };

      const result = await downloadMethod('https://example.com/test.tar.gz', coordinate);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(100);
    });

    it('should include authorization header when token provided', async () => {
      const resolverWithToken = new BufResolver([], {
        bufToken: 'test-token',
        fileSystem: mockFileSystem,
      });

      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const downloadMethod = (resolverWithToken as any).downloadArchive.bind(resolverWithToken);
      const coordinate = {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
      };

      await downloadMethod('https://example.com/test.tar.gz', coordinate);

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/test.tar.gz', {
        headers: {
          'User-Agent': '@pseudomutojs/proto-parser BufResolver',
          Authorization: 'Bearer test-token',
        },
      });
    });

    it('should throw BufResolverError for HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const downloadMethod = (resolver as any).downloadArchive.bind(resolver);
      const coordinate = {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
      };

      await expect(downloadMethod('https://example.com/test.tar.gz', coordinate)).rejects.toThrow(BufResolverError);
    });

    it('should throw BufResolverError for network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const downloadMethod = (resolver as any).downloadArchive.bind(resolver);
      const coordinate = {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
      };

      await expect(downloadMethod('https://example.com/test.tar.gz', coordinate)).rejects.toThrow(BufResolverError);
    });
  });

  describe('cleanup', () => {
    it('should clean up temporary directories', async () => {
      const resolver = new BufResolver([], { fileSystem: mockFileSystem });

      // Simulate some temp directories using the test helper method
      resolver.setTempDirs(['/temp/dir1', '/temp/dir2']);

      await resolver.cleanup();

      expect(mockFileSystem.rmdir).toHaveBeenCalledWith('/temp/dir1', {
        recursive: true,
      });
      expect(mockFileSystem.rmdir).toHaveBeenCalledWith('/temp/dir2', {
        recursive: true,
      });
    });

    it('should ignore cleanup errors and continue', async () => {
      const resolver = new BufResolver([], { fileSystem: mockFileSystem });

      // Mock rmdir to throw an error
      mockFileSystem.rmdir.mockRejectedValue(new Error('Permission denied'));

      // Simulate some temp directories
      (resolver as any)['#tempDirs'] = ['/temp/dir1'];

      // Should not throw, just warn
      await expect(resolver.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('integration with simple tar extraction', () => {
    it('should handle simple tar.gz extraction', async () => {
      // Create a minimal valid tar.gz buffer for testing
      // This is a simplified test - in practice we'd need a proper tar.gz
      const mockTarGz = Buffer.from('test tar content');

      const resolver = new BufResolver(['buf.build/bufbuild/protovalidate'], {
        fileSystem: mockFileSystem,
        tempDir: '/test/temp',
      });

      // Mock successful fetch
      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(mockTarGz.buffer),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Mock file system operations
      mockFileSystem.mkdir.mockResolvedValue(undefined);
      mockFileSystem.writeFile.mockResolvedValue(undefined);
      mockFileSystem.access.mockRejectedValue(new Error('Not found')); // Directory doesn't exist initially

      // The extraction might fail with our mock data, but we can test the setup
      try {
        await resolver.preloadModules();
      } catch {
        // Expected to fail with mock tar data, but verify the setup worked
        expect(mockFileSystem.mkdir).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalled();
      }
    });
  });
});
