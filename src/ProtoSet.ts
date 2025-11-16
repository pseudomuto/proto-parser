import { parseProto } from './parser';
import { Enum, Field, Message, OneOf, ParseOptions, Proto, Service, ServiceMethod, SupersetOptions } from './types';

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

  /**
   * Generates a superset IDL containing all definitions from the ProtoSet.
   *
   * This method creates a single proto file that includes all messages, enums,
   * services, and imports from all proto files in the set. Namespace conflicts
   * can be resolved using configurable strategies (prefix with namespace or
   * numeric suffix, or ignore conflicts).
   *
   * @param options - Configuration options for IDL generation
   * @returns A string containing the complete proto IDL
   *
   * @example
   * ```typescript
   * const protoSet = await parseProtoDirectory('./protos');
   * const supersetIdl = protoSet.generateSupersetIdl({
   *   syntax: 'proto3',
   *   packageName: 'unified.api',
   *   includeComments: true
   * });
   * ```
   *
   * @public
   * @since 0.1.0
   */
  generateSupersetIdl(options: SupersetOptions = {}): string {
    const { syntax = 'proto3', packageName, includeComments = true, namespaceConflictResolution = 'prefix' } = options;

    const lines: string[] = [];

    // Add syntax declaration
    lines.push(`syntax = "${syntax}";`);
    lines.push('');

    // Add package declaration if specified
    if (packageName) {
      lines.push(`package ${packageName};`);
      lines.push('');
    }

    // Add all unique imports
    const imports = this.getAllImports();
    if (imports.length > 0) {
      for (const importPath of imports) {
        lines.push(`import "${importPath}";`);
      }
      lines.push('');
    }

    // Collect all definitions with conflict resolution
    const { messages, enums, services } = this.collectAllDefinitionsWithConflictResolution(namespaceConflictResolution);

    // Add enum definitions
    if (enums.length > 0) {
      if (includeComments) {
        lines.push('// Enum definitions');
      }
      for (const enumDef of enums) {
        if (includeComments && enumDef.sourceFile) {
          lines.push(`// From: ${enumDef.sourceFile}`);
        }
        lines.push(...this.formatEnum(enumDef.enum, enumDef.resolvedName));
        lines.push('');
      }
    }

    // Add message definitions
    if (messages.length > 0) {
      if (includeComments) {
        lines.push('// Message definitions');
      }
      for (const messageDef of messages) {
        if (includeComments && messageDef.sourceFile) {
          lines.push(`// From: ${messageDef.sourceFile}`);
        }
        lines.push(...this.formatMessage(messageDef.message, messageDef.resolvedName, 0));
        lines.push('');
      }
    }

    // Add service definitions
    if (services.length > 0) {
      if (includeComments) {
        lines.push('// Service definitions');
      }
      for (const serviceDef of services) {
        if (includeComments && serviceDef.sourceFile) {
          lines.push(`// From: ${serviceDef.sourceFile}`);
        }
        lines.push(...this.formatService(serviceDef.service, serviceDef.resolvedName));
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * Collects all definitions with conflict resolution applied.
   */
  private collectAllDefinitionsWithConflictResolution(strategy: 'prefix' | 'ignore'): {
    messages: Array<{ message: Message; resolvedName: string; sourceFile?: string }>;
    enums: Array<{ enum: Enum; resolvedName: string; sourceFile?: string }>;
    services: Array<{ service: Service; resolvedName: string; sourceFile?: string }>;
  } {
    const messages: Array<{ message: Message; resolvedName: string; sourceFile?: string }> = [];
    const enums: Array<{ enum: Enum; resolvedName: string; sourceFile?: string }> = [];
    const services: Array<{ service: Service; resolvedName: string; sourceFile?: string }> = [];

    const nameTracker = {
      messages: new Set<string>(),
      enums: new Set<string>(),
      services: new Set<string>(),
    };

    // Track suffix counters for names without namespaces
    const suffixCounters = {
      messages: new Map<string, number>(),
      enums: new Map<string, number>(),
      services: new Map<string, number>(),
    };

    for (const proto of this.#protos) {
      // Process messages
      if (proto.messages) {
        for (const message of proto.messages) {
          this.processDefinitionsRecursively(
            message,
            proto.file,
            strategy,
            nameTracker,
            suffixCounters,
            messages,
            enums,
          );
        }
      }

      // Process top-level enums
      if (proto.enums) {
        for (const enumDef of proto.enums) {
          const resolvedName = this.resolveNameConflict(
            enumDef.name,
            enumDef.namespace,
            nameTracker.enums,
            strategy,
            suffixCounters.enums,
          );
          enums.push({ enum: enumDef, resolvedName, sourceFile: proto.file });
          nameTracker.enums.add(resolvedName);
        }
      }

      // Process services
      if (proto.services) {
        for (const service of proto.services) {
          const resolvedName = this.resolveNameConflict(
            service.name,
            service.namespace,
            nameTracker.services,
            strategy,
            suffixCounters.services,
          );
          services.push({ service, resolvedName, sourceFile: proto.file });
          nameTracker.services.add(resolvedName);
        }
      }
    }

    return { messages, enums, services };
  }

  /**
   * Recursively processes messages and their nested definitions.
   */
  private processDefinitionsRecursively(
    message: Message,
    sourceFile: string,
    strategy: 'prefix' | 'ignore',
    nameTracker: { messages: Set<string>; enums: Set<string>; services: Set<string> },
    suffixCounters: { messages: Map<string, number>; enums: Map<string, number>; services: Map<string, number> },
    messages: Array<{ message: Message; resolvedName: string; sourceFile?: string }>,
    enums: Array<{ enum: Enum; resolvedName: string; sourceFile?: string }>,
  ): void {
    // Process the message itself
    const resolvedMessageName = this.resolveNameConflict(
      message.name,
      message.namespace,
      nameTracker.messages,
      strategy,
      suffixCounters.messages,
    );
    messages.push({ message, resolvedName: resolvedMessageName, sourceFile });
    nameTracker.messages.add(resolvedMessageName);

    // Process nested enums
    if (message.nestedEnums) {
      for (const enumDef of message.nestedEnums) {
        const resolvedName = this.resolveNameConflict(
          enumDef.name,
          enumDef.namespace,
          nameTracker.enums,
          strategy,
          suffixCounters.enums,
        );
        enums.push({ enum: enumDef, resolvedName, sourceFile });
        nameTracker.enums.add(resolvedName);
      }
    }

    // Process nested messages recursively
    if (message.nestedMessages) {
      for (const nestedMessage of message.nestedMessages) {
        this.processDefinitionsRecursively(
          nestedMessage,
          sourceFile,
          strategy,
          nameTracker,
          suffixCounters,
          messages,
          enums,
        );
      }
    }
  }

  /**
   * Resolves name conflicts based on the chosen strategy.
   */
  private resolveNameConflict(
    name: string,
    namespace: string,
    usedNames: Set<string>,
    strategy: 'prefix' | 'ignore',
    suffixCounter?: Map<string, number>,
  ): string {
    if (strategy === 'ignore' || !usedNames.has(name)) {
      return name;
    }

    // For prefix strategy, use namespace if available
    if (namespace) {
      const prefixedName = `${namespace.replace(/\./g, '_')}_${name}`;
      return prefixedName;
    }

    // If no namespace is available, use numeric suffix as fallback
    if (suffixCounter) {
      const count = suffixCounter.get(name) || 1;
      suffixCounter.set(name, count + 1);
      return `${name}_${count + 1}`;
    }

    return name;
  }

  /**
   * Formats a message definition as proto IDL.
   */
  private formatMessage(message: Message, name: string, indentLevel: number): string[] {
    const indent = '  '.repeat(indentLevel);
    const lines: string[] = [];

    lines.push(`${indent}message ${name} {`);

    // Group fields by oneof index
    const oneofFields = new Map<number, Field[]>();
    const regularFields: Field[] = [];

    if (message.fields) {
      for (const field of message.fields) {
        if (field.oneofIndex !== undefined) {
          const fields = oneofFields.get(field.oneofIndex) || [];
          fields.push(field);
          oneofFields.set(field.oneofIndex, fields);
        } else {
          regularFields.push(field);
        }
      }
    }

    // Add oneofs with their fields
    if (message.oneofs) {
      for (let i = 0; i < message.oneofs.length; i++) {
        const oneof = message.oneofs[i];
        const fields = oneofFields.get(i) || [];
        lines.push(...this.formatOneof(oneof, fields, indentLevel + 1));
      }
    }

    // Add regular fields (not part of any oneof)
    for (const field of regularFields) {
      lines.push(...this.formatField(field, indentLevel + 1));
    }

    // Note: Nested enums and messages are handled separately in the collection phase
    // to avoid duplication in the generated IDL

    lines.push(`${indent}}`);
    return lines;
  }

  /**
   * Formats an enum definition as proto IDL.
   */
  private formatEnum(enumDef: Enum, name: string, indentLevel: number = 0): string[] {
    const indent = '  '.repeat(indentLevel);
    const lines: string[] = [];

    lines.push(`${indent}enum ${name} {`);

    for (const value of enumDef.values) {
      lines.push(`${indent}  ${value.name} = ${value.number};`);
    }

    lines.push(`${indent}}`);
    return lines;
  }

  /**
   * Formats a service definition as proto IDL.
   */
  private formatService(service: Service, name: string): string[] {
    const lines: string[] = [];

    lines.push(`service ${name} {`);

    if (service.methods) {
      for (const method of service.methods) {
        lines.push(...this.formatServiceMethod(method));
      }
    }

    lines.push('}');
    return lines;
  }

  /**
   * Formats a service method as proto IDL.
   */
  private formatServiceMethod(method: ServiceMethod): string[] {
    const requestType = method.requestStream ? `stream ${method.requestType}` : method.requestType;
    const responseType = method.responseStream ? `stream ${method.responseType}` : method.responseType;

    return [`  rpc ${method.name}(${requestType}) returns (${responseType});`];
  }

  /**
   * Formats a field as proto IDL.
   */
  private formatField(field: Field, indentLevel: number): string[] {
    const indent = '  '.repeat(indentLevel);
    const rule = field.rule ? `${field.rule} ` : '';

    return [`${indent}${rule}${field.type} ${field.name} = ${field.number};`];
  }

  /**
   * Formats a oneof as proto IDL.
   */
  private formatOneof(oneof: OneOf, fields: Field[], indentLevel: number): string[] {
    const indent = '  '.repeat(indentLevel);
    const lines: string[] = [];

    lines.push(`${indent}oneof ${oneof.name} {`);

    // Add the fields that belong to this oneof
    for (const field of fields) {
      // Oneof fields don't have rules (repeated, optional, required)
      lines.push(`${indent}  ${field.type} ${field.name} = ${field.number};`);
    }

    lines.push(`${indent}}`);

    return lines;
  }
}
