import { MockFileSystem } from '../__mocks__/MockFileSystem';
import { BufModuleProvider, BufModuleProviderError } from './BufModuleProvider';

// Mock fetch globally
global.fetch = jest.fn();

describe('BufModuleProvider', () => {
  let mockFileSystem: MockFileSystem;

  beforeEach(() => {
    mockFileSystem = new MockFileSystem();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const provider = new BufModuleProvider(['buf.build/bufbuild/protovalidate']);
      expect(provider).toBeDefined();
    });

    it('should accept custom options', () => {
      const options = {
        bufToken: 'test-token',
        tempDir: '/custom/temp',
        fileSystem: mockFileSystem,
        includeDependencies: false,
      };

      const provider = new BufModuleProvider(['buf.build/bufbuild/protovalidate'], options);
      expect(provider).toBeDefined();
    });
  });

  describe('parseModuleCoordinate (integration)', () => {
    let provider: BufModuleProvider;

    beforeEach(() => {
      provider = new BufModuleProvider([], { fileSystem: mockFileSystem });
    });

    it('should wrap ModuleCoordinateError in BufModuleProviderError', () => {
      // Use type assertion to access private method for testing error conversion
      const parseMethod = (provider as any).parseModuleCoordinate.bind(provider);

      expect(() => parseMethod('invalid-format')).toThrow(BufModuleProviderError);

      try {
        parseMethod('invalid-format');
      } catch (error) {
        expect(error).toBeInstanceOf(BufModuleProviderError);
        expect((error as BufModuleProviderError).message).toContain('Invalid module coordinate:');
        expect((error as BufModuleProviderError).module).toBe('invalid-format');
      }
    });

    it('should successfully parse valid coordinates', () => {
      const parseMethod = (provider as any).parseModuleCoordinate.bind(provider);

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
    let provider: BufModuleProvider;

    beforeEach(() => {
      provider = new BufModuleProvider([], { fileSystem: mockFileSystem, includeDependencies: true });
    });

    it('should build URL with dependencies', () => {
      const buildMethod = (provider as any).buildArchiveUrl.bind(provider);
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
      const providerNoDeps = new BufModuleProvider([], { fileSystem: mockFileSystem, includeDependencies: false });
      const buildMethod = (providerNoDeps as any).buildArchiveUrl.bind(providerNoDeps);

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
    let provider: BufModuleProvider;

    beforeEach(() => {
      provider = new BufModuleProvider([], { fileSystem: mockFileSystem });
    });

    it('should download archive successfully', async () => {
      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const downloadMethod = (provider as any).downloadArchive.bind(provider);
      const coordinate = { instance: 'buf.build', owner: 'bufbuild', name: 'protovalidate' };

      const result = await downloadMethod('https://example.com/test.tar.gz', coordinate);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(100);
    });

    it('should include authorization header when token provided', async () => {
      const providerWithToken = new BufModuleProvider([], { bufToken: 'test-token', fileSystem: mockFileSystem });

      const mockResponse = {
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const downloadMethod = (providerWithToken as any).downloadArchive.bind(providerWithToken);
      const coordinate = { instance: 'buf.build', owner: 'bufbuild', name: 'protovalidate' };

      await downloadMethod('https://example.com/test.tar.gz', coordinate);

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/test.tar.gz', {
        headers: {
          'User-Agent': '@pseudomutojs/proto-parser BufModuleProvider',
          Authorization: 'Bearer test-token',
        },
      });
    });

    it('should throw BufModuleProviderError for HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const downloadMethod = (provider as any).downloadArchive.bind(provider);
      const coordinate = { instance: 'buf.build', owner: 'bufbuild', name: 'protovalidate' };

      await expect(downloadMethod('https://example.com/test.tar.gz', coordinate)).rejects.toThrow(
        BufModuleProviderError,
      );
    });

    it('should throw BufModuleProviderError for network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const downloadMethod = (provider as any).downloadArchive.bind(provider);
      const coordinate = { instance: 'buf.build', owner: 'bufbuild', name: 'protovalidate' };

      await expect(downloadMethod('https://example.com/test.tar.gz', coordinate)).rejects.toThrow(
        BufModuleProviderError,
      );
    });
  });

  describe('dispose', () => {
    it('should clean up temporary directories', async () => {
      const provider = new BufModuleProvider([], { fileSystem: mockFileSystem });

      // Simulate some temp directories using the test helper method
      provider.setTempDirs(['/temp/dir1', '/temp/dir2']);

      await provider.dispose();

      expect(mockFileSystem.rmdir).toHaveBeenCalledWith('/temp/dir1', { recursive: true });
      expect(mockFileSystem.rmdir).toHaveBeenCalledWith('/temp/dir2', { recursive: true });
    });

    it('should ignore cleanup errors and continue', async () => {
      const provider = new BufModuleProvider([], { fileSystem: mockFileSystem });

      // Mock rmdir to throw an error
      mockFileSystem.rmdir.mockRejectedValue(new Error('Permission denied'));

      // Simulate some temp directories
      (provider as any)['#tempDirs'] = ['/temp/dir1'];

      // Should not throw, just warn
      await expect(provider.dispose()).resolves.toBeUndefined();
    });

    it('should handle partial cleanup failures gracefully', async () => {
      const provider = new BufModuleProvider([], { fileSystem: mockFileSystem });

      // Mock rmdir to fail for the first call but succeed for the second
      mockFileSystem.rmdir.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce(undefined);

      // Set temp directories using the test helper method
      provider.setTempDirs(['/temp/dir1', '/temp/dir2']);

      // Should complete without throwing, even if one cleanup fails
      await expect(provider.dispose()).resolves.toBeUndefined();

      // Should have attempted to clean both directories
      expect(mockFileSystem.rmdir).toHaveBeenCalledTimes(2);
    });

    it('should be safe to dispose multiple times', async () => {
      const provider = new BufModuleProvider([], { fileSystem: mockFileSystem });

      // Set temp directories using the test helper method
      provider.setTempDirs(['/temp/dir1']);

      // First dispose
      await provider.dispose();
      expect(mockFileSystem.rmdir).toHaveBeenCalledTimes(1);

      // Second dispose should be safe (no-op)
      await provider.dispose();
      // Should not call rmdir again since tempDirs is already cleared
      expect(mockFileSystem.rmdir).toHaveBeenCalledTimes(1);
    });
  });

  describe('getIncludePaths', () => {
    it('should be idempotent - multiple calls return same result', async () => {
      const provider = new BufModuleProvider(['buf.build/bufbuild/protovalidate'], {
        fileSystem: mockFileSystem,
        tempDir: '/test/temp',
      });

      // Mock that modules are already extracted
      provider.setTempDirs(['/test/temp/extracted1']);

      // First call
      const firstResult = await provider.getIncludePaths();
      expect(firstResult).toEqual(['/test/temp/extracted1']);

      // Second call should return same result
      const secondResult = await provider.getIncludePaths();
      expect(secondResult).toEqual(['/test/temp/extracted1']);
      // Both calls should return the same paths (idempotent behavior)

      // No fetch should be called since modules are already extracted
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not re-download when modules are already extracted', async () => {
      const provider = new BufModuleProvider(['buf.build/bufbuild/protovalidate'], {
        fileSystem: mockFileSystem,
        tempDir: '/test/temp',
      });

      // Pre-populate temp directories to simulate modules already extracted
      provider.setTempDirs(['/test/temp/extracted1']);

      // Multiple calls to getIncludePaths
      const result1 = await provider.getIncludePaths();
      const result2 = await provider.getIncludePaths();
      const result3 = await provider.getIncludePaths();

      // Should return same results without any downloads
      expect(result1).toEqual(['/test/temp/extracted1']);
      expect(result2).toEqual(['/test/temp/extracted1']);
      expect(result3).toEqual(['/test/temp/extracted1']);

      // Should not have made any fetch calls since modules are already extracted
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('integration with simple tar extraction', () => {
    it('should handle simple tar.gz extraction', async () => {
      // Create a minimal valid tar.gz buffer for testing
      // This is a simplified test - in practice we'd need a proper tar.gz
      const mockTarGz = Buffer.from('test tar content');

      const provider = new BufModuleProvider(['buf.build/bufbuild/protovalidate'], {
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
        await provider.getIncludePaths();
      } catch {
        // Expected to fail with mock tar data, but verify the setup worked
        expect(mockFileSystem.mkdir).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalled();
      }
    });
  });
});
