import * as protobuf from 'protobufjs';

import { Enum, EnumValue, Field, FieldRule, Message, OneOf, Service, ServiceMethod } from './types';
import { joinNamespace } from './utils';

/**
 * Handles conversion of protobufjs objects to our internal types.
 * Provides unified logic for parsing messages, enums, services, etc.
 */
export class ContentProcessor {
  /**
   * Converts a protobuf.Field to our Field type.
   */
  static parseField(field: protobuf.Field): Field {
    return {
      name: field.name,
      type: field.type,
      number: field.id,
      rule: ContentProcessor.parseFieldRule(field),
      defaultValue: field.defaultValue,
      options: field.options || {},
      oneofIndex: field.partOf ? field.partOf.fieldsArray.indexOf(field) : undefined,
    };
  }

  /**
   * Determines the field rule (repeated, required, optional).
   */
  static parseFieldRule(field: protobuf.Field): FieldRule | undefined {
    if (field.repeated) return 'repeated';
    if (field.required) return 'required';
    if (field.optional) return 'optional';
    return undefined;
  }

  /**
   * Converts a protobuf.Enum value to our EnumValue type.
   */
  static parseEnumValue(value: string, enumObj: protobuf.Enum): EnumValue {
    return {
      name: value,
      number: enumObj.values[value],
      options: enumObj.valuesOptions?.[value] || {},
    };
  }

  /**
   * Converts a protobuf.Enum to our Enum type.
   */
  static parseEnum(enumObj: protobuf.Enum, namespace: string): Enum {
    return {
      name: enumObj.name,
      namespace,
      values: Object.keys(enumObj.values).map(key => ContentProcessor.parseEnumValue(key, enumObj)),
      options: enumObj.options || {},
    };
  }

  /**
   * Converts a protobuf.OneOf to our OneOf type.
   */
  static parseOneof(oneof: protobuf.OneOf): OneOf {
    return {
      name: oneof.name,
      fieldNames: oneof.fieldsArray.map(f => f.name),
    };
  }

  /**
   * Converts a protobuf.Type to our Message type.
   */
  static parseMessage(messageType: protobuf.Type, namespace: string): Message {
    const message: Message = {
      name: messageType.name,
      namespace,
      fields: messageType.fieldsArray.map(ContentProcessor.parseField),
      nestedMessages: [],
      nestedEnums: [],
      oneofs: messageType.oneofsArray.map(ContentProcessor.parseOneof),
      extensions: [],
      options: messageType.options || {},
    };

    // Process nested types
    if (messageType.nested) {
      for (const nestedName of Object.keys(messageType.nested)) {
        const nested = messageType.nested[nestedName];
        const nestedNamespace = joinNamespace(namespace, messageType.name);

        if (nested instanceof protobuf.Type) {
          message.nestedMessages = message.nestedMessages || [];
          message.nestedMessages.push(ContentProcessor.parseMessage(nested, nestedNamespace));
        } else if (nested instanceof protobuf.Enum) {
          message.nestedEnums = message.nestedEnums || [];
          message.nestedEnums.push(ContentProcessor.parseEnum(nested, nestedNamespace));
        }
      }
    }

    // Process extensions
    if (messageType.extensions && messageType.extensions.length > 0) {
      message.extensions = messageType.extensions.map(([name, id, type]) => ({
        name: String(name),
        type: String(type),
        extend: messageType.fullName,
        number: Number(id),
      }));
    }

    return message;
  }

  /**
   * Converts a protobuf.Method to our ServiceMethod type.
   */
  static parseServiceMethod(method: protobuf.Method): ServiceMethod {
    return {
      name: method.name,
      requestType: method.requestType,
      responseType: method.responseType,
      requestStream: method.requestStream || false,
      responseStream: method.responseStream || false,
      options: method.options || {},
    };
  }

  /**
   * Converts a protobuf.Service to our Service type.
   */
  static parseService(service: protobuf.Service, namespace: string): Service {
    return {
      name: service.name,
      namespace,
      methods: service.methodsArray.map(ContentProcessor.parseServiceMethod),
    };
  }

  /**
   * Recursively collects all messages from a protobuf namespace.
   */
  static collectAllMessages(root: protobuf.Namespace, messages: Message[] = [], currentNamespace = ''): Message[] {
    if (root.nested) {
      for (const name of Object.keys(root.nested)) {
        const nested = root.nested[name];

        if (nested instanceof protobuf.Type) {
          messages.push(ContentProcessor.parseMessage(nested, currentNamespace));
        }

        if (
          nested instanceof protobuf.Namespace &&
          !(nested instanceof protobuf.Type) &&
          !(nested instanceof protobuf.Service)
        ) {
          const nestedNamespace = currentNamespace ? `${currentNamespace}.${name}` : name;
          ContentProcessor.collectAllMessages(nested, messages, nestedNamespace);
        }
      }
    }
    return messages;
  }

  /**
   * Recursively collects all enums from a protobuf namespace.
   */
  static collectAllEnums(root: protobuf.Namespace, enums: Enum[] = [], currentNamespace = ''): Enum[] {
    if (root.nested) {
      for (const name of Object.keys(root.nested)) {
        const nested = root.nested[name];

        if (nested instanceof protobuf.Enum) {
          enums.push(ContentProcessor.parseEnum(nested, currentNamespace));
        }

        if (nested instanceof protobuf.Namespace && !(nested instanceof protobuf.Service)) {
          const nestedNamespace = currentNamespace ? `${currentNamespace}.${name}` : name;
          ContentProcessor.collectAllEnums(nested, enums, nestedNamespace);
        }
      }
    }
    return enums;
  }

  /**
   * Recursively collects all services from a protobuf namespace.
   */
  static collectAllServices(root: protobuf.Namespace, services: Service[] = [], currentNamespace = ''): Service[] {
    if (root.nested) {
      for (const name of Object.keys(root.nested)) {
        const nested = root.nested[name];

        if (nested instanceof protobuf.Service) {
          services.push(ContentProcessor.parseService(nested, currentNamespace));
        }

        if (
          nested instanceof protobuf.Namespace &&
          !(nested instanceof protobuf.Type) &&
          !(nested instanceof protobuf.Service)
        ) {
          const nestedNamespace = currentNamespace ? `${currentNamespace}.${name}` : name;
          ContentProcessor.collectAllServices(nested, services, nestedNamespace);
        }
      }
    }
    return services;
  }
}
