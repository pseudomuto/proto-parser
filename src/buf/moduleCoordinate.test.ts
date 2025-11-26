import { ModuleCoordinate, ModuleCoordinateError, parseModuleCoordinate } from './moduleCoordinate';

/**
 * Test case definition for table-driven parseModuleCoordinate testing.
 */
interface CoordinateTest {
  /** Description of what this test case validates */
  description: string;
  /** Input coordinate string to parse */
  given: string;
  /** Expected result when parsing succeeds (undefined when error expected) */
  expected?: ModuleCoordinate;
  /** Expected error message when parsing should fail (undefined when success expected) */
  error?: string;
}

describe('parseModuleCoordinate', () => {
  const testCases: CoordinateTest[] = [
    // Success cases - basic functionality
    {
      description: 'basic coordinate without version',
      given: 'buf.build/bufbuild/protovalidate',
      expected: {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
        identifier: 'buf.build/bufbuild/protovalidate',
      },
    },
    {
      description: 'coordinate with version',
      given: 'buf.build/bufbuild/protovalidate:v1.0.0',
      expected: {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
        version: 'v1.0.0',
        identifier: 'buf.build/bufbuild/protovalidate:v1.0.0',
      },
    },
    {
      description: 'custom registry instance',
      given: 'registry.company.com/team/project:v2.1.0',
      expected: {
        instance: 'registry.company.com',
        owner: 'team',
        name: 'project',
        version: 'v2.1.0',
        identifier: 'registry.company.com/team/project:v2.1.0',
      },
    },

    // Success cases - edge cases and special formats
    {
      description: 'complex version with hyphens',
      given: 'buf.build/envoyproxy/envoy:v1.25.0-beta.1',
      expected: {
        instance: 'buf.build',
        owner: 'envoyproxy',
        name: 'envoy',
        version: 'v1.25.0-beta.1',
        identifier: 'buf.build/envoyproxy/envoy:v1.25.0-beta.1',
      },
    },
    {
      description: 'names with hyphens and underscores',
      given: 'buf.build/my-org/my_project_name:latest',
      expected: {
        instance: 'buf.build',
        owner: 'my-org',
        name: 'my_project_name',
        version: 'latest',
        identifier: 'buf.build/my-org/my_project_name:latest',
      },
    },
    {
      description: 'registry with port and version',
      given: 'registry.example.com:443/secure/repo:v1.0.0',
      expected: {
        instance: 'registry.example.com:443',
        owner: 'secure',
        name: 'repo',
        version: 'v1.0.0',
        identifier: 'registry.example.com:443/secure/repo:v1.0.0',
      },
    },
    {
      description: 'whitespace trimming',
      given: '  buf.build/bufbuild/protovalidate:v1.0.0  ',
      expected: {
        instance: 'buf.build',
        owner: 'bufbuild',
        name: 'protovalidate',
        version: 'v1.0.0',
        identifier: 'buf.build/bufbuild/protovalidate:v1.0.0',
      },
    },

    // Error cases - input validation
    {
      description: 'empty string',
      given: '',
      error: 'Module coordinate must be a non-empty string, got: string',
    },
    {
      description: 'whitespace only',
      given: '   ',
      error: 'Module coordinate cannot be empty or whitespace only',
    },
    {
      description: 'null input',
      given: null as any,
      error: 'Module coordinate must be a non-empty string, got: object',
    },

    // Error cases - format validation
    {
      description: 'too few parts (1 part)',
      given: 'invalid-format',
      error:
        'Invalid module coordinate format. Expected "instance/owner/name[:version]" with exactly 3 parts separated by \'/\', got 1 parts',
    },
    {
      description: 'too few parts (2 parts)',
      given: 'buf.build/only-two-parts',
      error:
        'Invalid module coordinate format. Expected "instance/owner/name[:version]" with exactly 3 parts separated by \'/\', got 2 parts',
    },
    {
      description: 'too many parts',
      given: 'buf.build/too/many/parts/here',
      error:
        'Invalid module coordinate format. Expected "instance/owner/name[:version]" with exactly 3 parts separated by \'/\', got 5 parts',
    },

    // Error cases - empty parts
    {
      description: 'empty instance',
      given: '/bufbuild/protovalidate',
      error: 'Module coordinate has empty instance',
    },
    {
      description: 'empty owner',
      given: 'buf.build//protovalidate',
      error: 'Module coordinate has empty owner',
    },
    {
      description: 'empty name',
      given: 'buf.build/bufbuild/',
      error: 'Module coordinate has empty name',
    },

    // Error cases - version validation
    {
      description: 'empty version after colon',
      given: 'buf.build/bufbuild/protovalidate:',
      error: "Module coordinate ends with ':' but has no version",
    },
    {
      description: 'whitespace version after colon',
      given: 'buf.build/bufbuild/protovalidate:  ',
      error: "Module coordinate ends with ':' but has no version",
    },

    // Error cases - ambiguous coordinates
    {
      description: 'ambiguous registry with port (no version)',
      given: 'localhost:8080/local/test',
      error: 'Invalid module coordinate format',
    },
    {
      description: 'ambiguous URL-like coordinate',
      given: 'https://registry.example.com/owner/name',
      error: 'Invalid module coordinate format',
    },
  ];

  it.each(testCases)('$description: $given', ({ given, expected, error }) => {
    if (error) {
      expect(() => parseModuleCoordinate(given)).toThrow(ModuleCoordinateError);
      expect(() => parseModuleCoordinate(given)).toThrow(error);
    } else {
      expect(parseModuleCoordinate(given)).toEqual(expected);
    }
  });

  describe('error details', () => {
    it('should include the coordinate in the error', () => {
      try {
        parseModuleCoordinate('invalid-format');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleCoordinateError);
        expect((error as ModuleCoordinateError).coordinate).toBe('invalid-format');
      }
    });

    it('should have correct error name', () => {
      try {
        parseModuleCoordinate('');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ModuleCoordinateError);
        expect((error as ModuleCoordinateError).name).toBe('ModuleCoordinateError');
      }
    });
  });
});
