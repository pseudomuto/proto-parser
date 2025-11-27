import * as path from 'path';

/**
 * Extracts the directory path from a proto file path.
 *
 * @param protoPath - Full path to a proto file
 * @returns The directory containing the proto file, or current working directory if path is empty
 *
 * @public
 * @since 0.1.0
 */
export const getProtoDirectory = (protoPath: string): string => {
  return protoPath ? path.dirname(protoPath) : process.cwd();
};

/**
 * Extracts namespace and name components from a fully qualified proto name.
 *
 * @param fullName - Fully qualified name (e.g., 'google.protobuf.Timestamp')
 * @returns Object containing separate namespace and name components
 *
 * @example
 * ```typescript
 * const result = extractNamespace('google.protobuf.Timestamp');
 * // result = { namespace: 'google.protobuf', name: 'Timestamp' }
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const extractNamespace = (fullName: string): { namespace: string; name: string } => {
  const parts = fullName.split('.');
  const name = parts.pop() || '';
  const namespace = parts.join('.');
  return { namespace, name };
};

/**
 * Joins namespace parts into a fully qualified namespace string.
 *
 * @param parts - Variable number of namespace parts
 * @returns Joined namespace string with dots as separators
 *
 * @example
 * ```typescript
 * const namespace = joinNamespace('google', 'protobuf');
 * // namespace = 'google.protobuf'
 * ```
 *
 * @public
 * @since 0.1.0
 */
export const joinNamespace = (...parts: string[]): string => {
  return parts.filter(Boolean).join('.');
};
