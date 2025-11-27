import * as protobuf from 'protobufjs';

import { IProtoParser } from './IProtoParser';
import { Enum, Message, ParsedProto, Service } from './types';

/**
 * Collects all proto definitions from a protobuf namespace using the provided parser.
 * Recursively traverses the namespace tree and converts protobuf objects to internal types.
 *
 * @param root - The protobuf namespace to collect definitions from
 * @param parser - The proto parser to use for converting protobuf objects
 * @param currentNamespace - Current namespace path for proper scoping (internal use)
 * @returns ParsedProto object containing all collected definitions
 *
 * @public
 * @since 0.3.0
 */
export function collectProtoDefinitions(
  root: protobuf.Namespace,
  parser: IProtoParser,
  currentNamespace = '',
): ParsedProto {
  const services: Service[] = [];
  const messages: Message[] = [];
  const enums: Enum[] = [];

  if (root.nested) {
    for (const name of Object.keys(root.nested)) {
      const nested = root.nested[name];

      // Collect services
      if (nested instanceof protobuf.Service) {
        services.push(parser.parseService(nested, currentNamespace));
      }

      // Collect messages (protobuf.Type instances)
      if (nested instanceof protobuf.Type) {
        messages.push(parser.parseMessage(nested, currentNamespace));
      }

      // Collect enums
      if (nested instanceof protobuf.Enum) {
        enums.push(parser.parseEnum(nested, currentNamespace));
      }

      // Recursively process nested namespaces (but not Types or Services)
      if (
        nested instanceof protobuf.Namespace &&
        !(nested instanceof protobuf.Type) &&
        !(nested instanceof protobuf.Service)
      ) {
        const nestedNamespace = currentNamespace ? `${currentNamespace}.${name}` : name;
        const nestedDefinitions = collectProtoDefinitions(nested, parser, nestedNamespace);

        // Merge results from nested namespaces
        services.push(...nestedDefinitions.services);
        messages.push(...nestedDefinitions.messages);
        enums.push(...nestedDefinitions.enums);
      }
    }
  }

  return {
    services,
    messages,
    enums,
  };
}
