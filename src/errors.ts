/**
 * Base error class for proto-parser library errors
 */
export class ProtoParserError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProtoParserError';
  }
}

/**
 * Error thrown when parsing a proto file fails
 */
export class ProtoParseError extends ProtoParserError {
  constructor(
    message: string,
    public readonly filePath?: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'ProtoParseError';
  }
}

/**
 * Error thrown when import resolution fails
 */
export class ImportResolutionError extends ProtoParserError {
  constructor(
    message: string,
    public readonly importPath: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'ImportResolutionError';
  }
}

/**
 * Error thrown when proto file building fails
 */
export class ProtoBuildError extends ProtoParserError {
  constructor(
    message: string,
    public readonly filePath?: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'ProtoBuildError';
  }
}

/**
 * Utility for creating detailed error messages
 */
export function formatErrorMessage(baseMessage: string, context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) {
    return baseMessage;
  }

  const contextStr = Object.entries(context)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');

  return `${baseMessage}\nContext:\n${contextStr}`;
}

/**
 * Type guard to check if an error is a NodeJS errno exception
 */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Extract a safe error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}
