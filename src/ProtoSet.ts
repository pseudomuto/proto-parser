import * as path from 'path';

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
   * Determines if a proto file should be considered "local" (part of the project)
   * versus "external" (from external libraries).
   *
   * @param proto - The proto object to check
   * @param baseDir - Optional base directory to help determine locality
   * @returns true if the proto is considered local to the project
   */
  private isLocalProto(proto: Proto, baseDir?: string): boolean {
    // If we have a baseDir, use path-based detection as primary method
    if (baseDir && proto.path) {
      try {
        const relativePath = path.relative(baseDir, proto.path);
        // If the relative path starts with '..' or is absolute, it's external
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          return false;
        }
        // If the path is within baseDir, it's local regardless of namespace
        return true;
      } catch {
        // If path.relative fails, fall back to namespace-based detection
      }
    }

    // Fallback to namespace-based detection for files without valid paths
    const externalNamespacePatterns = ['google.protobuf', 'google.api', 'buf.validate', 'grpc.', 'protoc_gen_'];

    // Get the package namespace from the first available definition
    const namespace =
      proto.messages?.[0]?.namespace || proto.services?.[0]?.namespace || proto.enums?.[0]?.namespace || '';

    // Check if namespace matches external patterns
    for (const pattern of externalNamespacePatterns) {
      if (namespace.startsWith(pattern)) {
        return false;
      }
    }

    // If we can't determine based on path or namespace, assume local
    return true;
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
      } catch {
        // Return null for failed parses - error will be handled below if all inputs fail
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
   * Returns an array of local Proto objects (part of the current project).
   *
   * @param baseDir - Optional base directory to help determine locality
   * @returns Array of local Proto objects
   */
  getLocalProtos(baseDir?: string): Proto[] {
    return this.#protos.filter(proto => this.isLocalProto(proto, baseDir));
  }

  /**
   * Returns an array of external Proto objects (from external libraries).
   *
   * @param baseDir - Optional base directory to help determine locality
   * @returns Array of external Proto objects
   */
  getExternalProtos(baseDir?: string): Proto[] {
    return this.#protos.filter(proto => !this.isLocalProto(proto, baseDir));
  }

  /**
   * Gets imports from a specific set of protos.
   *
   * @param protos - Array of Proto objects to get imports from
   * @returns Array of unique import paths
   */
  private getImportsFromProtos(protos: Proto[]): string[] {
    const importSet = new Set<string>();
    for (const proto of protos) {
      if (proto.imports) {
        for (const importPath of proto.imports) {
          importSet.add(importPath);
        }
      }
    }
    return Array.from(importSet).sort();
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
    const {
      syntax = 'proto3',
      packageName,
      includeComments = true,
      namespaceConflictResolution = 'prefix',
      baseDir,
      includeLocalOnly = true,
    } = options;

    const lines: string[] = [];

    // Add syntax declaration
    lines.push(`syntax = "${syntax}";`);
    lines.push('');

    // Add package declaration if specified
    if (packageName) {
      lines.push(`package ${packageName};`);
      lines.push('');
    }

    // Get the protos to process (local only or all)
    const protosToProcess = includeLocalOnly ? this.getLocalProtos(baseDir) : this.#protos;

    // Add all unique imports from the protos being processed
    const imports = this.getImportsFromProtos(protosToProcess);
    if (imports.length > 0) {
      for (const importPath of imports) {
        lines.push(`import "${importPath}";`);
      }
      lines.push('');
    }

    // Track used names for conflict resolution
    const usedNames = {
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

    // Helper function to get display path
    const getDisplayPath = (proto: Proto): string => {
      if (baseDir && proto.path) {
        try {
          const relativePath = path.relative(baseDir, proto.path);
          // If within baseDir (local file), use relative path
          if (!relativePath.startsWith('..')) {
            return relativePath;
          }
        } catch {
          // If path.relative fails, fall back to other methods
        }
      }

      // For external files (outside baseDir), try to extract the import path from the full path
      if (proto.path) {
        // Extract import path from temp directory structure
        // e.g., /tmp/.buf-resolver-xxx/buf/validate/validate.proto -> buf/validate/validate.proto
        const pathSegments = proto.path.split(path.sep);

        // Look for common import path patterns (for BufResolver and similar)
        const importPathPatterns = ['buf', 'google', 'grpc', 'protoc'];

        for (let i = 0; i < pathSegments.length; i++) {
          const segment = pathSegments[i];
          if (importPathPatterns.some(pattern => segment.startsWith(pattern))) {
            // Found a pattern, return everything from this segment onwards
            // Proto import paths conventionally use forward slashes, regardless of platform
            return pathSegments.slice(i).join('/');
          }
        }
      }

      // Default to just the filename for backward compatibility
      return proto.file;
    };

    // Collect all enums first
    const allEnums: Array<{ enum: Enum; resolvedName: string; displayPath: string }> = [];
    for (const proto of protosToProcess) {
      const displayPath = getDisplayPath(proto);

      // Process top-level enums
      if (proto.enums) {
        for (const enumDef of proto.enums) {
          const resolvedName = this.resolveNameConflict(
            enumDef.name,
            enumDef.namespace,
            usedNames.enums,
            namespaceConflictResolution,
            suffixCounters.enums,
          );
          allEnums.push({ enum: enumDef, resolvedName, displayPath });
          usedNames.enums.add(resolvedName);
        }
      }

      // Process nested enums from messages
      if (proto.messages) {
        for (const message of proto.messages) {
          this.collectNestedEnumsForSuperset(
            message,
            displayPath,
            usedNames.enums,
            namespaceConflictResolution,
            suffixCounters.enums,
            allEnums,
          );
        }
      }
    }

    // Collect all messages
    const allMessages: Array<{ message: Message; resolvedName: string; displayPath: string }> = [];
    for (const proto of protosToProcess) {
      const displayPath = getDisplayPath(proto);

      if (proto.messages) {
        for (const message of proto.messages) {
          this.collectMessagesRecursivelyForSuperset(
            message,
            displayPath,
            usedNames.messages,
            namespaceConflictResolution,
            suffixCounters.messages,
            allMessages,
          );
        }
      }
    }

    // Collect all services
    const allServices: Array<{ service: Service; resolvedName: string; displayPath: string }> = [];
    for (const proto of protosToProcess) {
      const displayPath = getDisplayPath(proto);

      if (proto.services) {
        for (const service of proto.services) {
          const resolvedName = this.resolveNameConflict(
            service.name,
            service.namespace,
            usedNames.services,
            namespaceConflictResolution,
            suffixCounters.services,
          );
          allServices.push({ service, resolvedName, displayPath });
          usedNames.services.add(resolvedName);
        }
      }
    }

    // Add enum definitions
    if (allEnums.length > 0) {
      if (includeComments) {
        lines.push('// Enum definitions');
      }
      for (const enumDef of allEnums) {
        if (includeComments) {
          lines.push(`// From: ${enumDef.displayPath}`);
        }
        lines.push(...this.formatEnum(enumDef.enum, enumDef.resolvedName));
        lines.push('');
      }
    }

    // Add message definitions
    if (allMessages.length > 0) {
      if (includeComments) {
        lines.push('// Message definitions');
      }
      for (const messageDef of allMessages) {
        if (includeComments) {
          lines.push(`// From: ${messageDef.displayPath}`);
        }
        lines.push(...this.formatMessage(messageDef.message, messageDef.resolvedName, 0));
        lines.push('');
      }
    }

    // Add service definitions
    if (allServices.length > 0) {
      if (includeComments) {
        lines.push('// Service definitions');
      }
      for (const serviceDef of allServices) {
        if (includeComments) {
          lines.push(`// From: ${serviceDef.displayPath}`);
        }
        lines.push(...this.formatService(serviceDef.service, serviceDef.resolvedName));
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * Recursively collects nested enums from a message for superset generation.
   */
  private collectNestedEnumsForSuperset(
    message: Message,
    displayPath: string,
    usedNames: Set<string>,
    strategy: 'prefix' | 'ignore',
    suffixCounter: Map<string, number>,
    allEnums: Array<{ enum: Enum; resolvedName: string; displayPath: string }>,
  ): void {
    if (message.nestedEnums) {
      for (const enumDef of message.nestedEnums) {
        const resolvedName = this.resolveNameConflict(
          enumDef.name,
          enumDef.namespace,
          usedNames,
          strategy,
          suffixCounter,
        );
        allEnums.push({ enum: enumDef, resolvedName, displayPath });
        usedNames.add(resolvedName);
      }
    }

    if (message.nestedMessages) {
      for (const nestedMessage of message.nestedMessages) {
        this.collectNestedEnumsForSuperset(nestedMessage, displayPath, usedNames, strategy, suffixCounter, allEnums);
      }
    }
  }

  /**
   * Recursively collects messages for superset generation.
   */
  private collectMessagesRecursivelyForSuperset(
    message: Message,
    displayPath: string,
    usedNames: Set<string>,
    strategy: 'prefix' | 'ignore',
    suffixCounter: Map<string, number>,
    allMessages: Array<{ message: Message; resolvedName: string; displayPath: string }>,
  ): void {
    // Check if we already have an equivalent message
    const existingMessageIndex = allMessages.findIndex(item =>
      this.areMessagesEquivalent(item.message, message, item.displayPath, displayPath),
    );

    if (existingMessageIndex >= 0) {
      // Found a duplicate - decide which one to keep
      const existing = allMessages[existingMessageIndex];
      const current = { message, displayPath };
      const preferred = this.getPreferredMessageSource(existing, current);

      // If we prefer the current message, replace the existing one
      if (preferred === current) {
        // Remove the old resolved name from usedNames
        usedNames.delete(existing.resolvedName);

        // Calculate new resolved name for the preferred message
        const resolvedName = this.resolveNameConflict(
          message.name,
          message.namespace,
          usedNames,
          strategy,
          suffixCounter,
        );

        // Replace the existing message with the preferred one
        allMessages[existingMessageIndex] = { message, resolvedName, displayPath };
        usedNames.add(resolvedName);
      }
      // If we prefer the existing message, do nothing (skip adding the current one)
    } else {
      // No duplicate found - process the message normally
      const resolvedName = this.resolveNameConflict(
        message.name,
        message.namespace,
        usedNames,
        strategy,
        suffixCounter,
      );
      allMessages.push({ message, resolvedName, displayPath });
      usedNames.add(resolvedName);
    }

    // Process nested messages recursively
    if (message.nestedMessages) {
      for (const nestedMessage of message.nestedMessages) {
        this.collectMessagesRecursivelyForSuperset(
          nestedMessage,
          displayPath,
          usedNames,
          strategy,
          suffixCounter,
          allMessages,
        );
      }
    }
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
   * Checks if two messages are truly equivalent and should be deduplicated.
   * This is more conservative than just structural equivalence - it only treats
   * messages as equivalent if they represent the same logical message from import chains.
   */
  private areMessagesEquivalent(msg1: Message, msg2: Message, displayPath1: string, displayPath2: string): boolean {
    // Basic name check
    if (msg1.name !== msg2.name) {
      return false;
    }

    // Compare field count
    const fields1 = msg1.fields || [];
    const fields2 = msg2.fields || [];
    if (fields1.length !== fields2.length) {
      return false;
    }

    // Compare fields by field number, not array index
    const fieldsByNumber1 = new Map<number, Field>();
    for (const field of fields1) {
      fieldsByNumber1.set(field.number, field);
    }
    const fieldsByNumber2 = new Map<number, Field>();
    for (const field of fields2) {
      fieldsByNumber2.set(field.number, field);
    }

    // Check that both have the same field numbers
    if (fieldsByNumber1.size !== fieldsByNumber2.size) {
      return false;
    }

    for (const [number, field1] of fieldsByNumber1.entries()) {
      const field2 = fieldsByNumber2.get(number);
      if (!field2) {
        return false;
      }

      if (field1.name !== field2.name || field1.type !== field2.type || field1.rule !== field2.rule) {
        return false;
      }
    }

    // Compare oneOf fields by name, not array index
    const oneOfs1 = msg1.oneofs || [];
    const oneOfs2 = msg2.oneofs || [];
    if (oneOfs1.length !== oneOfs2.length) {
      return false;
    }

    const oneOfsByName1 = new Map<string, OneOf>();
    for (const oneOf of oneOfs1) {
      oneOfsByName1.set(oneOf.name, oneOf);
    }
    const oneOfsByName2 = new Map<string, OneOf>();
    for (const oneOf of oneOfs2) {
      oneOfsByName2.set(oneOf.name, oneOf);
    }

    for (const [name, oneOf1] of oneOfsByName1.entries()) {
      const oneOf2 = oneOfsByName2.get(name);
      if (!oneOf2) {
        return false;
      }

      if ((oneOf1.fieldNames?.length || 0) !== (oneOf2.fieldNames?.length || 0)) {
        return false;
      }

      // Compare field names in oneOf (order shouldn't matter for equivalence)
      const fieldNames1 = new Set(oneOf1.fieldNames || []);
      const fieldNames2 = new Set(oneOf2.fieldNames || []);

      if (fieldNames1.size !== fieldNames2.size) {
        return false;
      }

      for (const fieldName of fieldNames1) {
        if (!fieldNames2.has(fieldName)) {
          return false;
        }
      }
    }

    // Additional check: Only deduplicate if this looks like an import relationship
    // We should be conservative and only deduplicate if one path suggests it's an imported
    // version of the other (e.g., user.proto vs service.proto importing user.proto)
    const isLikelyImportRelationship = this.isLikelyImportDuplicate(displayPath1, displayPath2, msg1, msg2);

    return isLikelyImportRelationship;
  }

  /**
   * Determines if two messages with the same structure are likely duplicates due to imports
   * rather than legitimate separate definitions.
   */
  private isLikelyImportDuplicate(displayPath1: string, displayPath2: string, msg1: Message, msg2: Message): boolean {
    // If the display paths are identical, these are definitely the same message
    if (displayPath1 === displayPath2) {
      return true;
    }

    // If both have the same base filename, they're likely the same proto file
    const baseName1 = path.basename(displayPath1).replace('.proto', '');
    const baseName2 = path.basename(displayPath2).replace('.proto', '');
    if (baseName1 && baseName2 && baseName1 === baseName2) {
      return true;
    }

    // Check namespace relationship - if one has empty namespace and the other has
    // a namespace that matches the package, this could be an import situation
    const namespace1 = msg1.namespace || '';
    const namespace2 = msg2.namespace || '';

    // If namespaces are different and both non-empty, these are likely separate definitions
    if (namespace1 !== namespace2 && namespace1.length > 0 && namespace2.length > 0) {
      return false;
    }

    // For the specific case we're fixing: if one message comes from a file that matches
    // the message name (e.g., User from user.proto) and the other comes from a different
    // file (e.g., User from service.proto), this is likely an import duplicate
    const messageNameLower = msg1.name.toLowerCase();
    const isMsg1FromOwnFile = baseName1?.toLowerCase() === messageNameLower;
    const isMsg2FromOwnFile = baseName2?.toLowerCase() === messageNameLower;

    if (isMsg1FromOwnFile && !isMsg2FromOwnFile) {
      return true; // msg2 is likely importing from msg1's file
    }
    if (isMsg2FromOwnFile && !isMsg1FromOwnFile) {
      return true; // msg1 is likely importing from msg2's file
    }

    // If we can't determine a clear import relationship, be conservative and don't deduplicate
    return false;
  }

  /**
   * Determines which message source should be preferred when duplicates are found.
   * Prefers messages from their original source file over imported references.
   */
  private getPreferredMessageSource(
    msg1: { message: Message; displayPath: string },
    msg2: { message: Message; displayPath: string },
  ): { message: Message; displayPath: string } {
    // Prefer the message with fewer namespace components (likely the original source)
    const namespace1Length = (msg1.message.namespace || '').split('.').filter(s => s.length > 0).length;
    const namespace2Length = (msg2.message.namespace || '').split('.').filter(s => s.length > 0).length;

    if (namespace1Length !== namespace2Length) {
      return namespace1Length < namespace2Length ? msg1 : msg2;
    }

    // If namespace lengths are equal, prefer the one with shorter display path (likely more direct)
    if (msg1.displayPath.length !== msg2.displayPath.length) {
      return msg1.displayPath.length < msg2.displayPath.length ? msg1 : msg2;
    }

    // If all else is equal, prefer the first one
    return msg1;
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
