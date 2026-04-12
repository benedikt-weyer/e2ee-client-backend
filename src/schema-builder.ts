import { z } from "zod";
import {
  type EncryptionAlgorithmId,
  type EncryptedFieldValue,
  isEncryptedFieldValue,
} from "./crypto/types";
import type {
  EntitySchema,
  FieldPolicy,
} from "./repositories/entity-repository";

type JsonObject = Record<string, unknown>;

type Simplify<TValue> = {
  [TKey in keyof TValue]: TValue[TKey];
} & {};

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getByPath(target: JsonObject, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as JsonObject)[segment];
  }, target);
}

function setByPath(target: JsonObject, path: string, value: unknown): void {
  const segments = path.split(".");
  const lastSegment = segments.at(-1);
  if (!lastSegment) {
    return;
  }

  let current: JsonObject = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as JsonObject;
  }

  current[lastSegment] = value;
}

function cloneValue<TValue>(value: TValue): TValue {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }

  return structuredClone(value);
}

const encryptedFieldSchema = z.custom<EncryptedFieldValue>(
  isEncryptedFieldValue,
  "Expected an encrypted payload.",
);

interface ModelFieldConfig<
  TEntityValue,
  TRemotePlainValue,
  TRemotePath extends string | undefined,
> {
  deserialize: ((value: TRemotePlainValue, remote: JsonObject) => TEntityValue) | undefined;
  encrypted: boolean;
  entitySchema: z.ZodType<TEntityValue>;
  remotePath: TRemotePath;
  remoteSchema: z.ZodType<TRemotePlainValue>;
  serialize: ((value: TEntityValue, entity: JsonObject) => TRemotePlainValue) | undefined;
  strategyId: EncryptionAlgorithmId | undefined;
}

export class ModelFieldBuilder<
  TEntityValue,
  TRemotePlainValue = TEntityValue,
  TRemotePath extends string | undefined = undefined,
  TEncrypted extends boolean = false,
> {
  public declare readonly __entityValue: TEntityValue;
  public declare readonly __remotePath: TRemotePath;
  public declare readonly __remotePlainValue: TRemotePlainValue;
  public declare readonly __encrypted: TEncrypted;

  public constructor(
    private readonly config: ModelFieldConfig<
      TEntityValue,
      TRemotePlainValue,
      TRemotePath
    >,
  ) {}

  public encrypted(options: { strategyId?: EncryptionAlgorithmId } = {}): ModelFieldBuilder<
    TEntityValue,
    TRemotePlainValue,
    TRemotePath,
    true
  > {
    return new ModelFieldBuilder({
      ...this.config,
      encrypted: true,
      strategyId: options.strategyId ?? this.config.strategyId,
    });
  }

  public map<TRemoteNext>(options: {
    deserialize?: (value: TRemoteNext, remote: JsonObject) => TEntityValue;
    remoteSchema: z.ZodType<TRemoteNext>;
    serialize?: (value: TEntityValue, entity: JsonObject) => TRemoteNext;
  }): ModelFieldBuilder<TEntityValue, TRemoteNext, TRemotePath, TEncrypted> {
    return new ModelFieldBuilder({
      ...this.config,
      deserialize: options.deserialize,
      remoteSchema: options.remoteSchema,
      serialize: options.serialize,
    });
  }

  public nullable(): ModelFieldBuilder<
    TEntityValue | null,
    TRemotePlainValue | null,
    TRemotePath,
    TEncrypted
  > {
    const deserialize = this.config.deserialize;
    const serialize = this.config.serialize;

    return new ModelFieldBuilder({
      ...this.config,
      deserialize: deserialize
        ? (value, remote) => (value === null ? null : deserialize(value, remote))
        : undefined,
      entitySchema: this.config.entitySchema.nullable() as z.ZodType<TEntityValue | null>,
      remoteSchema: this.config.remoteSchema.nullable() as z.ZodType<TRemotePlainValue | null>,
      serialize: serialize
        ? (value, entity) => (value === null ? null : serialize(value, entity))
        : undefined,
    });
  }

  public optional(): ModelFieldBuilder<
    TEntityValue | undefined,
    TRemotePlainValue | undefined,
    TRemotePath,
    TEncrypted
  > {
    const deserialize = this.config.deserialize;
    const serialize = this.config.serialize;

    return new ModelFieldBuilder({
      ...this.config,
      deserialize: deserialize
        ? (value, remote) =>
            value === undefined ? undefined : deserialize(value, remote)
        : undefined,
      entitySchema: this.config.entitySchema.optional() as z.ZodType<TEntityValue | undefined>,
      remoteSchema: this.config.remoteSchema.optional() as z.ZodType<TRemotePlainValue | undefined>,
      serialize: serialize
        ? (value, entity) =>
            value === undefined ? undefined : serialize(value, entity)
        : undefined,
    });
  }

  public remote<TNextPath extends string>(
    remotePath: TNextPath,
  ): ModelFieldBuilder<TEntityValue, TRemotePlainValue, TNextPath, TEncrypted> {
    return new ModelFieldBuilder({
      ...this.config,
      remotePath,
    });
  }

  public toConfig(): ModelFieldConfig<TEntityValue, TRemotePlainValue, TRemotePath> {
    return this.config;
  }
}

type AnyModelField = ModelFieldBuilder<any, any, string | undefined, boolean>;

export type ModelFields = Record<string, AnyModelField>;

type EntityValueOf<TField extends AnyModelField> = TField["__entityValue"];

type RemotePathOf<
  TField extends AnyModelField,
  TFallback extends string,
> = TField["__remotePath"] extends string ? TField["__remotePath"] : TFallback;

type RemoteValueOf<TField extends AnyModelField> = TField["__encrypted"] extends true
  ? TField["__remotePlainValue"] | EncryptedFieldValue
  : TField["__remotePlainValue"];

export type EntityShape<TFields extends ModelFields> = Simplify<{
  [TKey in keyof TFields]: EntityValueOf<TFields[TKey]>;
}>;

export type RemoteShape<TFields extends ModelFields> = Simplify<{
  [TKey in keyof TFields as RemotePathOf<TFields[TKey], Extract<TKey, string>>]: RemoteValueOf<
    TFields[TKey]
  >;
}>;

type IdValueOf<
  TFields extends ModelFields,
  TIdField extends Extract<keyof TFields, string> | undefined,
> = TIdField extends Extract<keyof TFields, string>
  ? Extract<EntityShape<TFields>[TIdField], string | number>
  : string;

export interface DefineEntityModelOptions<
  TFields extends ModelFields,
  TIdField extends Extract<keyof TFields, string> | undefined = undefined,
> {
  cacheCollection?: string;
  defaultStrategyId?: EncryptionAlgorithmId;
  fields: TFields;
  idField?: TIdField;
  name: string;
}

export interface DefinedEntityModel<
  TFields extends ModelFields,
  TIdField extends Extract<keyof TFields, string> | undefined = undefined,
> extends EntitySchema<
    EntityShape<TFields>,
    RemoteShape<TFields>,
    IdValueOf<TFields, TIdField>
  > {
  definition: DefineEntityModelOptions<TFields, TIdField>;
}

export type InferEntity<TModel> = TModel extends {
  definition: { fields: infer TFields };
}
  ? TFields extends ModelFields
    ? EntityShape<TFields>
    : never
  : never;

export type InferRemote<TModel> = TModel extends {
  definition: { fields: infer TFields };
}
  ? TFields extends ModelFields
    ? RemoteShape<TFields>
    : never
  : never;

function buildRemoteFieldSchema(
  field: ModelFieldConfig<any, any, string | undefined>,
): z.ZodType<unknown> {
  if (!field.encrypted) {
    return field.remoteSchema;
  }

  return z.union([field.remoteSchema, encryptedFieldSchema]);
}

function parseObjectWithFields<TValue>(args: {
  fields: ModelFields;
  input: unknown;
  kind: "entity" | "remote";
  modelName: string;
}): TValue {
  if (!isPlainObject(args.input)) {
    throw new Error(
      `Model "${args.modelName}" ${args.kind} payload must be a plain object.`,
    );
  }

  const output = cloneValue(args.input);
  for (const [entityPath, fieldBuilder] of Object.entries(args.fields)) {
    const field = fieldBuilder.toConfig();
    const path = args.kind === "entity" ? entityPath : field.remotePath ?? entityPath;
    const schema = args.kind === "entity"
      ? field.entitySchema
      : buildRemoteFieldSchema(field);
    const parsed = schema.parse(getByPath(output, path));
    setByPath(output, path, parsed);
  }

  return output as TValue;
}

function buildFieldPolicies<TFields extends ModelFields>(
  fields: TFields,
): FieldPolicy<EntityShape<TFields>, RemoteShape<TFields>>[] {
  return Object.entries(fields).map(([entityPath, fieldBuilder]) => {
    const field = fieldBuilder.toConfig();
    const policy: FieldPolicy<EntityShape<TFields>, RemoteShape<TFields>> = {
      encrypted: field.encrypted,
      entityPath,
    };

    if (field.deserialize) {
      policy.deserialize = (value, remote) =>
        field.deserialize?.(value, remote as JsonObject);
    }

    if (field.remotePath) {
      policy.remotePath = field.remotePath;
    }

    if (field.serialize) {
      policy.serialize = (value, entity) =>
        field.serialize?.(value, entity as JsonObject);
    }

    if (field.strategyId) {
      policy.strategyId = field.strategyId;
    }

    return policy;
  });
}

function assertUniqueRemotePaths(
  name: string,
  fields: ModelFields,
): void {
  const seen = new Set<string>();

  for (const [entityPath, fieldBuilder] of Object.entries(fields)) {
    const remotePath = fieldBuilder.toConfig().remotePath ?? entityPath;
    if (seen.has(remotePath)) {
      throw new Error(
        `Model "${name}" maps multiple fields to remote path "${remotePath}".`,
      );
    }
    seen.add(remotePath);
  }
}

export function defineEntityModel<
  TFields extends ModelFields,
  TIdField extends Extract<keyof TFields, string> | undefined = undefined,
>(
  definition: DefineEntityModelOptions<TFields, TIdField>,
): DefinedEntityModel<TFields, TIdField> {
  assertUniqueRemotePaths(definition.name, definition.fields);

  const model: DefinedEntityModel<TFields, TIdField> = {
    createEntity(remote) {
      const entity: JsonObject = {};
      const remoteRecord = remote as JsonObject;

      for (const [entityPath, fieldBuilder] of Object.entries(definition.fields)) {
        const field = fieldBuilder.toConfig();
        const remotePath = field.remotePath ?? entityPath;
        const value = getByPath(remoteRecord, remotePath);
        entity[entityPath] = field.deserialize
          ? field.deserialize(value, remoteRecord)
          : value;
      }

      return entity as EntityShape<TFields>;
    },
    createRemote(entity) {
      const remote: JsonObject = {};
      const entityRecord = entity as JsonObject;

      for (const [entityPath, fieldBuilder] of Object.entries(definition.fields)) {
        const field = fieldBuilder.toConfig();
        const remotePath = field.remotePath ?? entityPath;
        const value = entityRecord[entityPath];
        setByPath(
          remote,
          remotePath,
          field.serialize ? field.serialize(value, entityRecord) : value,
        );
      }

      return remote as RemoteShape<TFields>;
    },
    definition,
    fields: buildFieldPolicies(definition.fields),
    name: definition.name,
    parseEntity(input) {
      return parseObjectWithFields<EntityShape<TFields>>({
        fields: definition.fields,
        input,
        kind: "entity",
        modelName: definition.name,
      });
    },
    parseRemote(input) {
      return parseObjectWithFields<RemoteShape<TFields>>({
        fields: definition.fields,
        input,
        kind: "remote",
        modelName: definition.name,
      });
    },
  };

  if (definition.cacheCollection) {
    model.cacheCollection = definition.cacheCollection;
  }

  if (definition.defaultStrategyId) {
    model.defaultStrategyId = definition.defaultStrategyId;
  }

  if (definition.idField) {
    model.idPath = definition.idField;
  }

  return model;
}

export const field = {
  array<TItem>(schema: z.ZodType<TItem>) {
    return new ModelFieldBuilder<TItem[]>({
      deserialize: undefined,
      encrypted: false,
      entitySchema: z.array(schema),
      remotePath: undefined,
      remoteSchema: z.array(schema),
      serialize: undefined,
      strategyId: undefined,
    });
  },
  boolean() {
    return new ModelFieldBuilder<boolean>({
      deserialize: undefined,
      encrypted: false,
      entitySchema: z.boolean(),
      remotePath: undefined,
      remoteSchema: z.boolean(),
      serialize: undefined,
      strategyId: undefined,
    });
  },
  custom<TEntityValue, TRemoteValue = TEntityValue>(options: {
    deserialize?: (value: TRemoteValue, remote: JsonObject) => TEntityValue;
    entitySchema: z.ZodType<TEntityValue>;
    remoteSchema?: z.ZodType<TRemoteValue>;
    serialize?: (value: TEntityValue, entity: JsonObject) => TRemoteValue;
  }) {
    return new ModelFieldBuilder<TEntityValue, TRemoteValue>({
      deserialize: options.deserialize,
      encrypted: false,
      entitySchema: options.entitySchema,
      remotePath: undefined,
      remoteSchema: options.remoteSchema ?? (options.entitySchema as unknown as z.ZodType<TRemoteValue>),
      serialize: options.serialize,
      strategyId: undefined,
    });
  },
  enum<TValues extends readonly [string, ...string[]]>(values: TValues) {
    return new ModelFieldBuilder<TValues[number]>({
      deserialize: undefined,
      encrypted: false,
      entitySchema: z.enum(values),
      remotePath: undefined,
      remoteSchema: z.enum(values),
      serialize: undefined,
      strategyId: undefined,
    });
  },
  json<TValue>(schema: z.ZodType<TValue>) {
    return new ModelFieldBuilder<TValue>({
      deserialize: undefined,
      encrypted: false,
      entitySchema: schema,
      remotePath: undefined,
      remoteSchema: schema,
      serialize: undefined,
      strategyId: undefined,
    });
  },
  number() {
    return new ModelFieldBuilder<number>({
      deserialize: undefined,
      encrypted: false,
      entitySchema: z.number(),
      remotePath: undefined,
      remoteSchema: z.number(),
      serialize: undefined,
      strategyId: undefined,
    });
  },
  string() {
    return new ModelFieldBuilder<string>({
      deserialize: undefined,
      encrypted: false,
      entitySchema: z.string(),
      remotePath: undefined,
      remoteSchema: z.string(),
      serialize: undefined,
      strategyId: undefined,
    });
  },
} as const;