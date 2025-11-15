import { parseProto, parseProtoSync } from './parser';
import { Enum, Message, ParseOptions, Proto, Service } from './types';

/**
 * Represents a collection of parsed Protocol Buffer files.
 *
 * ProtoSet provides methods to aggregate and access parsed proto definitions
 * across multiple files, making it easier to work with complex proto projects.
 *
 * @public
 * @since 0.1.0
 */
export class ProtoSet {
  readonly #protos: Proto[];

  /**
   * Creates a new ProtoSet from an array of parsed Proto objects.
   *
   * @param protos - Array of parsed Proto objects
   *
   * @example
   * ```typescript
   * const proto1 = await parseProto('./user.proto');
   * const proto2 = await parseProto('./service.proto');
   * const protoSet = new ProtoSet([proto1, proto2]);
   * ```
   */
  constructor(protos: Proto[]) {
    this.#protos = [...protos];
  }

  /**
   * Creates a ProtoSet from multiple file paths and/or proto content strings.
   *
   * This static method accepts a variable number of strings, which can be either
   * file paths to .proto files or literal proto content. It automatically detects
   * the type of each input and parses them all, returning a ProtoSet containing
   * all successfully parsed protos.
   *
   * @param inputs - Variable number of file paths or proto content strings
   * @returns A Promise that resolves to a ProtoSet containing all parsed protos
   * @throws {Error} If all inputs fail to parse
   *
   * @example
   * ```typescript
   * // Mix of file paths and literal content
   * const protoSet = await ProtoSet.from(
   *   './user.proto',
   *   './service.proto',
   *   'syntax = "proto3"; message Test { string id = 1; }'
   * );
   *
   * // With options
   * const protoSet = await ProtoSet.from(
   *   './user.proto',
   *   'syntax = "proto3"; message Test { string id = 1; }',
   *   { keepCase: false }
   * );
   * ```
   *
   * @since 0.1.0
   */
  static async from(...inputs: string[]): Promise<ProtoSet>;
  static async from(...args: [...string[], ParseOptions]): Promise<ProtoSet>;
  static async from(...args: (string | ParseOptions)[]): Promise<ProtoSet> {
    // Determine if the last argument is options
    let options: ParseOptions = {};
    let inputs: string[] = args as string[];

    if (args.length > 0) {
      const lastArg = args[args.length - 1];
      if (typeof lastArg === 'object' && lastArg !== null) {
        options = lastArg as ParseOptions;
        inputs = args.slice(0, -1) as string[];
      }
    }

    if (inputs.length === 0) {
      return new ProtoSet([]);
    }

    // Parse all inputs in parallel
    const parsePromises = inputs.map(async input => {
      try {
        return await parseProto(input, options);
      } catch (error) {
        console.warn(`Failed to parse input: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });

    const results = await Promise.all(parsePromises);
    const protos = results.filter((proto): proto is Proto => proto !== null);

    if (protos.length === 0 && inputs.length > 0) {
      throw new Error('Failed to parse any of the provided inputs');
    }

    return new ProtoSet(protos);
  }

  /**
   * Synchronously creates a ProtoSet from multiple file paths and/or proto content strings.
   *
   * This is the synchronous version of {@link from}. It provides the same
   * functionality but uses blocking operations.
   *
   * @param inputs - Variable number of file paths or proto content strings
   * @returns A ProtoSet containing all parsed protos
   * @throws {Error} If all inputs fail to parse
   *
   * @example
   * ```typescript
   * // Mix of file paths and literal content
   * const protoSet = ProtoSet.fromSync(
   *   './user.proto',
   *   'syntax = "proto3"; message Test { string id = 1; }'
   * );
   * ```
   *
   * @since 0.1.0
   */
  static fromSync(...inputs: string[]): ProtoSet;
  static fromSync(...args: [...string[], ParseOptions]): ProtoSet;
  static fromSync(...args: (string | ParseOptions)[]): ProtoSet {
    // Determine if the last argument is options
    let options: ParseOptions = {};
    let inputs: string[] = args as string[];

    if (args.length > 0) {
      const lastArg = args[args.length - 1];
      if (typeof lastArg === 'object' && lastArg !== null) {
        options = lastArg as ParseOptions;
        inputs = args.slice(0, -1) as string[];
      }
    }

    if (inputs.length === 0) {
      return new ProtoSet([]);
    }

    // Parse all inputs synchronously
    const protos: Proto[] = [];
    const errors: string[] = [];

    for (const input of inputs) {
      try {
        const proto = parseProtoSync(input, options);
        protos.push(proto);
      } catch (error) {
        const errorMsg = `Failed to parse input: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.warn(errorMsg);
      }
    }

    if (protos.length === 0 && inputs.length > 0) {
      throw new Error('Failed to parse any of the provided inputs');
    }

    return new ProtoSet(protos);
  }

  /**
   * Returns all Proto objects in this set.
   *
   * @returns Array of Proto objects
   */
  getProtos(): Proto[] {
    return [...this.#protos];
  }

  /**
   * Finds a Proto object by its filename.
   *
   * @param filename - The filename to search for (e.g., 'user.proto')
   * @returns The matching Proto object, or undefined if not found
   *
   * @example
   * ```typescript
   * const userProto = protoSet.getProtoByFile('user.proto');
   * ```
   */
  getProtoByFile(filename: string): Proto | undefined {
    return this.#protos.find(proto => proto.file === filename);
  }

  /**
   * Returns all Message definitions from all Proto files in the set.
   *
   * @returns Array of all Message objects across all protos
   */
  getAllMessages(): Message[] {
    const messages: Message[] = [];

    for (const proto of this.#protos) {
      if (proto.messages) {
        messages.push(...proto.messages);

        // Recursively collect nested messages
        for (const message of proto.messages) {
          this.collectNestedMessages(message, messages);
        }
      }
    }

    return messages;
  }

  /**
   * Returns all Service definitions from all Proto files in the set.
   *
   * @returns Array of all Service objects across all protos
   */
  getAllServices(): Service[] {
    const services: Service[] = [];

    for (const proto of this.#protos) {
      if (proto.services) {
        services.push(...proto.services);
      }
    }

    return services;
  }

  /**
   * Returns all Enum definitions from all Proto files in the set.
   *
   * @returns Array of all Enum objects across all protos
   */
  getAllEnums(): Enum[] {
    const enums: Enum[] = [];

    for (const proto of this.#protos) {
      if (proto.enums) {
        enums.push(...proto.enums);
      }

      // Also collect enums from nested messages
      if (proto.messages) {
        for (const message of proto.messages) {
          this.collectNestedEnums(message, enums);
        }
      }
    }

    return enums;
  }

  /**
   * Returns all unique import statements from all Proto files in the set.
   *
   * @returns Array of unique import paths
   */
  getAllImports(): string[] {
    const importSet = new Set<string>();

    for (const proto of this.#protos) {
      if (proto.imports) {
        for (const importPath of proto.imports) {
          importSet.add(importPath);
        }
      }
    }

    return Array.from(importSet).sort();
  }

  /**
   * Returns the number of Proto files in this set.
   *
   * @returns Number of proto files
   */
  size(): number {
    return this.#protos.length;
  }

  /**
   * Checks if the set is empty.
   *
   * @returns True if the set contains no proto files
   */
  isEmpty(): boolean {
    return this.#protos.length === 0;
  }

  /**
   * Returns basic statistics about the proto set.
   *
   * @returns Object containing counts of files, messages, services, and enums
   */
  getStats(): {
    files: number;
    messages: number;
    services: number;
    enums: number;
    imports: number;
  } {
    return {
      files: this.size(),
      messages: this.getAllMessages().length,
      services: this.getAllServices().length,
      enums: this.getAllEnums().length,
      imports: this.getAllImports().length,
    };
  }

  /**
   * Recursively collects nested messages from a message and adds them to the array.
   */
  private collectNestedMessages(message: Message, messages: Message[]): void {
    if (message.nestedMessages) {
      for (const nested of message.nestedMessages) {
        messages.push(nested);
        this.collectNestedMessages(nested, messages);
      }
    }
  }

  /**
   * Recursively collects nested enums from a message and adds them to the array.
   */
  private collectNestedEnums(message: Message, enums: Enum[]): void {
    if (message.nestedEnums) {
      enums.push(...message.nestedEnums);
    }

    if (message.nestedMessages) {
      for (const nested of message.nestedMessages) {
        this.collectNestedEnums(nested, enums);
      }
    }
  }
}
