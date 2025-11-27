import * as protobuf from 'protobufjs';

import { Enum, EnumValue, Field, FieldRule, Message, OneOf, Service, ServiceMethod } from './types';

/**
 * Interface for proto parsing functionality.
 * Handles conversion of protobufjs objects to our internal types.
 *
 * This interface uses proper protobufjs types to ensure full type safety and better
 * developer experience when implementing custom proto parsers.
 *
 * @public
 * @since 0.2.0
 */
export interface IProtoParser {
  /** Converts a protobuf.Field to our Field type */
  parseField(field: protobuf.Field): Field;
  /** Determines the field rule (repeated, required, optional) */
  parseFieldRule(field: protobuf.Field): FieldRule | undefined;
  /** Converts a protobuf.Enum value to our EnumValue type */
  parseEnumValue(value: string, enumObj: protobuf.Enum): EnumValue;
  /** Converts a protobuf.Enum to our Enum type */
  parseEnum(enumObj: protobuf.Enum, namespace: string): Enum;
  /** Converts a protobuf.OneOf to our OneOf type */
  parseOneof(oneof: protobuf.OneOf): OneOf;
  /** Converts a protobuf.Type to our Message type */
  parseMessage(messageType: protobuf.Type, namespace: string): Message;
  /** Converts a protobuf.Method to our ServiceMethod type */
  parseServiceMethod(method: protobuf.Method): ServiceMethod;
  /** Converts a protobuf.Service to our Service type */
  parseService(service: protobuf.Service, namespace: string): Service;
}
