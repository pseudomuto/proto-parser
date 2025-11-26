/**
 * Error thrown when module coordinate parsing fails.
 *
 * This error is thrown when:
 * - Module coordinate format is invalid (e.g., missing parts)
 * - Module coordinate parts are empty or malformed
 * - Coordinate string doesn't match expected pattern
 *
 * @example
 * ```typescript
 * try {
 *   const coord = parseModuleCoordinate('invalid-format');
 * } catch (error) {
 *   if (error instanceof ModuleCoordinateError) {
 *     console.error(`Invalid coordinate: ${error.message}`);
 *     console.error(`Input was: ${error.coordinate}`);
 *   }
 * }
 * ```
 *
 * @public
 * @since 0.3.0
 */
export class ModuleCoordinateError extends Error {
  constructor(
    message: string,
    /** The coordinate string that failed to parse */
    public readonly coordinate: string,
  ) {
    super(message);
    this.name = 'ModuleCoordinateError';
  }
}

/**
 * Represents a parsed Buf module coordinate with its components.
 *
 * A module coordinate follows the pattern: `instance/owner/name[:version]`
 * where version is optional and defaults to "main" if not specified.
 *
 * @example
 * ```typescript
 * // Basic coordinate without version
 * const coord1: ModuleCoordinate = {
 *   instance: 'buf.build',
 *   owner: 'bufbuild',
 *   name: 'protovalidate',
 *   identifier: 'buf.build/bufbuild/protovalidate'
 * };
 *
 * // Coordinate with specific version
 * const coord2: ModuleCoordinate = {
 *   instance: 'buf.build',
 *   owner: 'googleapis',
 *   name: 'googleapis',
 *   version: 'v1.0.0',
 *   identifier: 'buf.build/googleapis/googleapis:v1.0.0'
 * };
 * ```
 *
 * @public
 * @since 0.3.0
 */
export interface ModuleCoordinate {
  /** BSR instance hostname (e.g., "buf.build", "registry.company.com") */
  instance: string;
  /** Module owner/organization (e.g., "bufbuild", "googleapis") */
  owner: string;
  /** Module name/repository (e.g., "protovalidate", "googleapis") */
  name: string;
  /** Version/reference (optional, defaults to "main" when not specified) */
  version?: string;
  /** Complete coordinate identifier string in "instance/owner/name[:version]" format */
  identifier: string;
}

/**
 * Parses a Buf module coordinate string into its component parts.
 *
 * Accepts coordinates in the format: `instance/owner/name[:version]`
 * where version is optional. If no version is provided, it defaults to "main"
 * in most Buf registry contexts.
 *
 * @param coordinate - The module coordinate string to parse
 * @returns Parsed coordinate components with identifier field
 * @throws {ModuleCoordinateError} When the coordinate format is invalid
 *
 * @example
 * ```typescript
 * // Parse coordinate without version
 * const coord1 = parseModuleCoordinate('buf.build/bufbuild/protovalidate');
 * // Returns: { instance: 'buf.build', owner: 'bufbuild', name: 'protovalidate', identifier: 'buf.build/bufbuild/protovalidate' }
 *
 * // Parse coordinate with version
 * const coord2 = parseModuleCoordinate('buf.build/googleapis/googleapis:v1.0.0');
 * // Returns: { instance: 'buf.build', owner: 'googleapis', name: 'googleapis', version: 'v1.0.0', identifier: 'buf.build/googleapis/googleapis:v1.0.0' }
 *
 * // Parse coordinate with custom registry
 * const coord3 = parseModuleCoordinate('registry.company.com/team/project:latest');
 * // Returns: { instance: 'registry.company.com', owner: 'team', name: 'project', version: 'latest', identifier: 'registry.company.com/team/project:latest' }
 * ```
 *
 * @public
 * @since 0.3.0
 */
export function parseModuleCoordinate(coordinate: string): ModuleCoordinate {
  if (!coordinate || coordinate === '') {
    throw new ModuleCoordinateError(
      `Module coordinate must be a non-empty string, got: ${typeof coordinate}`,
      String(coordinate),
    );
  }

  const moduleCoord = coordinate.trim();
  if (!moduleCoord) {
    throw new ModuleCoordinateError('Module coordinate cannot be empty or whitespace only', coordinate);
  }

  // Split by : to separate version (only split on the last : to handle cases like "https://example.com/owner/name:v1.0.0")
  const lastColonIndex = moduleCoord.lastIndexOf(':');
  let moduleSpec: string;
  let version: string | undefined;

  if (lastColonIndex > 0 && lastColonIndex < moduleCoord.length - 1) {
    moduleSpec = moduleCoord.substring(0, lastColonIndex);
    version = moduleCoord.substring(lastColonIndex + 1);

    // Validate version is not empty
    if (!version.trim()) {
      throw new ModuleCoordinateError(
        `Module coordinate has empty version after ':'. Expected "instance/owner/name[:version]", got: ${coordinate}`,
        coordinate,
      );
    }
  } else if (lastColonIndex === moduleCoord.length - 1) {
    // Coordinate ends with : but no version
    throw new ModuleCoordinateError(
      `Module coordinate ends with ':' but has no version. Expected "instance/owner/name[:version]", got: ${coordinate}`,
      coordinate,
    );
  } else {
    // No version specified
    moduleSpec = moduleCoord;
  }

  // Split module spec by / to get instance, owner, name
  const parts = moduleSpec.split('/').map(p => p.trim());

  if (parts.length !== 3) {
    throw new ModuleCoordinateError(
      `Invalid module coordinate format. Expected "instance/owner/name[:version]" with exactly 3 parts separated by '/', got ${parts.length} parts: ${coordinate}`,
      coordinate,
    );
  }

  const [instance, owner, name] = parts;

  // Validate all required parts are non-empty
  [
    ['instance', instance],
    ['owner', owner],
    ['name', name],
  ].forEach(value => {
    if (!value[1]) {
      throw new ModuleCoordinateError(
        `Module coordinate has empty ${value[0]}. Expected "instance/owner/name[:version]", got: ${coordinate}`,
        coordinate,
      );
    }
  });

  // Generate the identifier string
  const baseIdentifier = `${instance}/${owner}/${name}`;
  const identifier = version ? `${baseIdentifier}:${version}` : baseIdentifier;

  return {
    instance,
    owner,
    name,
    version,
    identifier,
  };
}
