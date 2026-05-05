import { z } from "zod";
import type {
  ModelFieldBuilder,
  ModelFields,
} from "./schema-builder";

export const BACKEND_ADAPTER_MANIFEST_VERSION = 4 as const;

export type BackendAdapterManifestVersion =
  typeof BACKEND_ADAPTER_MANIFEST_VERSION;

export type BackendAdapterSchemaType =
  | "array"
  | "boolean"
  | "json"
  | "number"
  | "object"
  | "string"
  | "unknown";

export type BackendAdapterSchemaLiteral = boolean | number | string | null;

export interface BackendAdapterSchemaNode {
  nullable?: boolean;
  optional?: boolean;
  schema: BackendAdapterSchemaDescriptor;
}

export type BackendAdapterSchemaDescriptor =
  | {
      items: BackendAdapterSchemaNode;
      type: "array";
    }
  | {
      type: "boolean";
    }
  | {
      discriminator: string;
      options: BackendAdapterSchemaNode[];
      type: "discriminatedUnion";
    }
  | {
      type: "enum";
      values: string[];
    }
  | {
      type: "literal";
      value: BackendAdapterSchemaLiteral;
    }
  | {
      integer?: boolean;
      type: "number";
    }
  | {
      additionalProperties?: boolean | BackendAdapterSchemaNode;
      properties?: Record<string, BackendAdapterSchemaNode>;
      type: "object";
    }
  | {
      type: "record";
      values: BackendAdapterSchemaNode;
    }
  | {
      type: "string";
    }
  | {
      options: BackendAdapterSchemaNode[];
      type: "union";
    }
  | {
      type: "unknown";
    };

export interface BackendAdapterManifest {
  auth: BackendAdapterAuthManifest;
  database: BackendAdapterDatabaseManifest;
  entities: BackendAdapterEntityManifest[];
  name: string;
  realtime?: BackendAdapterRealtimeManifest;
  version: BackendAdapterManifestVersion;
}

export interface BackendAdapterAuthManifest {
  mode: "password-session";
  rest: BackendAdapterRestAuthManifest;
  session: BackendAdapterSessionManifest;
}

export interface BackendAdapterRestAuthManifest {
  paths: BackendAdapterRestAuthPaths;
}

export interface BackendAdapterRestAuthPaths {
  getKdfSalt: string;
  login: string;
  logout: string;
  refresh: string;
  registerBegin: string;
  registerComplete: string;
}

export interface BackendAdapterSessionManifest {
  cookieNames: {
    refresh: string;
    session: string;
  };
  refreshDurationSeconds: number;
  sessionDurationSeconds: number;
}

export interface BackendAdapterDatabaseManifest {
  engine: "postgres";
  expectedSchema: BackendAdapterExpectedSchemaManifest;
}

export interface BackendAdapterExpectedSchemaGraphqlApiManifest {
  defaultHeaders?: Record<string, string>;
  endpointPath: string;
}

export interface BackendAdapterExpectedSchemaRestApiManifest {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
}

export type BackendAdapterExpectedSchemaApiManifest =
  | {
      graphql: BackendAdapterExpectedSchemaGraphqlApiManifest;
      type: "graphql";
    }
  | {
      rest: BackendAdapterExpectedSchemaRestApiManifest;
      type: "rest";
    };

export interface BackendAdapterExpectedSchemaManifest {
  api: BackendAdapterExpectedSchemaApiManifest;
  authTables: string[];
  entities: BackendAdapterExpectedSchemaEntityManifest[];
  entityTables: BackendAdapterExpectedEntityTableManifest[];
}

export interface BackendAdapterExpectedEntityColumnManifest {
  columnName: string;
  nullable: boolean;
  sqlType: string;
}

export interface BackendAdapterEntityGraphqlManifest {
  allowCreate: boolean;
  allowDelete: boolean;
  allowGetById: boolean;
  allowList: boolean;
  allowUpdate: boolean;
  createMutation: string;
  deleteMutation: string;
  getByIdQuery: string;
  listQuery: string;
  updateMutation: string;
}

export type BackendAdapterExpectedSchemaEntityApiManifest =
  | {
      graphql: BackendAdapterEntityGraphqlManifest;
      type: "graphql";
    }
  | {
      rest: BackendAdapterEntityRestManifest;
      type: "rest";
    };

export interface BackendAdapterExpectedSchemaEntityManifest {
  api: BackendAdapterExpectedSchemaEntityApiManifest;
  fields: BackendAdapterEntityFieldManifest[];
  idPath: string;
  name: string;
  primaryKey: string;
  tableName: string;
}

export interface BackendAdapterExpectedEntityTableManifest {
  columns: BackendAdapterExpectedEntityColumnManifest[];
  primaryKey: string;
  tableName: string;
}

export interface BackendAdapterEntityDatabaseManifest {
  columns: BackendAdapterExpectedEntityColumnManifest[];
  primaryKey: string;
}

export interface BackendAdapterEntityManifest {
  database: BackendAdapterEntityDatabaseManifest;
  fields: BackendAdapterEntityFieldManifest[];
  graphql: BackendAdapterEntityGraphqlManifest;
  idPath: string;
  name: string;
  rest: BackendAdapterEntityRestManifest;
  tableName: string;
}

export interface BackendAdapterEntityRestManifest {
  allowCreate: boolean;
  allowDelete: boolean;
  allowGetById: boolean;
  allowList: boolean;
  allowUpdate: boolean;
  basePath: string;
}

export interface BackendAdapterEntityFieldManifest {
  encrypted: boolean;
  entitySchema?: BackendAdapterSchemaNode;
  entityPath: string;
  entityType: BackendAdapterSchemaType;
  nullable: boolean;
  optional: boolean;
  remotePath: string;
  remoteSchema?: BackendAdapterSchemaNode;
  remoteType: BackendAdapterSchemaType;
  strategyId?: string;
}

export interface BackendAdapterRealtimeManifest {
  entities: BackendAdapterRealtimeEntityManifest[];
  path: string;
  protocol: "websocket";
}

export interface BackendAdapterRealtimeEntityManifest {
  entityName: string;
  topic: string;
}

export interface DefineBackendAdapterEntityOptions<
  TModel extends BackendAdapterCompatibleModel<ModelFields>,
> {
  database?: Partial<BackendAdapterEntityDatabaseManifest>;
  graphql?: Partial<BackendAdapterEntityGraphqlManifest>;
  model: TModel;
  rest?: Partial<Omit<BackendAdapterEntityRestManifest, "basePath">> & {
    basePath?: string;
  };
  tableName?: string;
}

export interface CreateBackendAdapterManifestOptions {
  auth: BackendAdapterAuthManifest;
  database?: Omit<Partial<BackendAdapterDatabaseManifest>, "expectedSchema"> & {
    expectedSchema?: Partial<BackendAdapterExpectedSchemaManifest>;
  };
  entities: BackendAdapterEntityManifest[];
  name: string;
  realtime?: BackendAdapterRealtimeManifest;
}

type AnyModelField = ModelFieldBuilder<any, any, string | undefined, boolean>;

interface BackendAdapterCompatibleModel<TFields extends ModelFields> {
  defaultStrategyId?: string;
  idPath?: string;
  name: string;
  definition: {
    fields: TFields;
  };
}

function assertAbsolutePath(path: string, label: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`${label} must start with '/'. Received "${path}".`);
  }

  return path;
}

function normalizePathSegment(value: string): string {
  return value
    .trim()
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeGraphqlIdentifier(
  value: string,
  capitalizeFirst = false,
): string {
  const segments = normalizePathSegment(value)
    .split("-")
    .filter(Boolean);

  if (!segments.length) {
    return capitalizeFirst ? "Entity" : "entity";
  }

  return segments.map((segment, index) => {
    if (index === 0 && !capitalizeFirst) {
      return segment;
    }

    return `${segment[0]!.toUpperCase()}${segment.slice(1)}`;
  }).join("");
}

function unwrapSchema(schema: z.ZodTypeAny): {
  nullable: boolean;
  optional: boolean;
  schema: z.ZodTypeAny;
} {
  let current = schema;
  let nullable = false;
  let optional = false;

  while (true) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }

    return { nullable, optional, schema: current };
  }
}

function inferSchemaType(schema: z.ZodTypeAny): BackendAdapterSchemaType {
  const unwrapped = unwrapSchema(schema).schema;

  if (
    unwrapped instanceof z.ZodEnum ||
    unwrapped instanceof z.ZodLiteral ||
    unwrapped instanceof z.ZodString
  ) {
    return "string";
  }

  if (unwrapped instanceof z.ZodNumber) {
    return "number";
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return "boolean";
  }

  if (unwrapped instanceof z.ZodArray) {
    return "array";
  }

  if (
    unwrapped instanceof z.ZodObject ||
    unwrapped instanceof z.ZodRecord ||
    unwrapped instanceof z.ZodMap
  ) {
    return "object";
  }

  if (unwrapped instanceof z.ZodUnknown || unwrapped instanceof z.ZodAny) {
    return "unknown";
  }

  return "json";
}

function createEntityFieldManifest(
  entityPath: string,
  fieldBuilder: AnyModelField,
  defaultStrategyId: string | undefined,
): BackendAdapterEntityFieldManifest {
  const config = fieldBuilder.toConfig();
  const entityDetails = unwrapSchema(config.entitySchema);
  const remoteDetails = unwrapSchema(config.remoteSchema);
  const strategyId = config.encrypted
    ? (config.strategyId ?? defaultStrategyId)
    : undefined;

  const manifest: BackendAdapterEntityFieldManifest = {
    encrypted: config.encrypted,
    entityPath,
    entityType: inferSchemaType(config.entitySchema),
    nullable: entityDetails.nullable || remoteDetails.nullable,
    optional: entityDetails.optional || remoteDetails.optional,
    remotePath: config.remotePath ?? entityPath,
    remoteType: inferSchemaType(config.remoteSchema),
  };

  if (strategyId) {
    manifest.strategyId = strategyId;
  }

  return manifest;
}

function createExpectedSchemaEntityManifest(
  entity: BackendAdapterEntityManifest,
  apiType: BackendAdapterExpectedSchemaApiManifest["type"],
): BackendAdapterExpectedSchemaEntityManifest {
  return {
    api: apiType === "graphql"
      ? {
          graphql: { ...entity.graphql },
          type: "graphql",
        }
      : {
          rest: { ...entity.rest },
          type: "rest",
        },
    fields: entity.fields.map((field) => ({ ...field })),
    idPath: entity.idPath,
    name: entity.name,
    primaryKey: entity.database.primaryKey,
    tableName: entity.tableName,
  };
}

function inferDatabaseSqlType(type: BackendAdapterSchemaType): string {
  switch (type) {
    case "array":
    case "json":
    case "object":
    case "unknown":
      return "JSONB";
    case "boolean":
      return "BOOLEAN";
    case "number":
      return "DOUBLE PRECISION";
    default:
      return "TEXT";
  }
}

function createDefaultDatabaseColumns(
  fields: BackendAdapterEntityFieldManifest[],
): BackendAdapterExpectedEntityColumnManifest[] {
  const columns = new Map<string, BackendAdapterExpectedEntityColumnManifest>();

  for (const field of fields) {
    const column = {
      columnName: field.remotePath,
      nullable: field.nullable || field.optional,
      sqlType: inferDatabaseSqlType(field.remoteType),
    } satisfies BackendAdapterExpectedEntityColumnManifest;
    const existing = columns.get(column.columnName);

    if (!existing) {
      columns.set(column.columnName, column);
      continue;
    }

    if (
      existing.nullable !== column.nullable ||
      existing.sqlType !== column.sqlType
    ) {
      throw new Error(
        `Entity field mappings for column "${column.columnName}" disagree on SQL type or nullability. Provide explicit database columns for this entity.`,
      );
    }
  }

  return [...columns.values()];
}

function createEntityDatabaseManifest(args: {
  columns?: BackendAdapterExpectedEntityColumnManifest[];
  fields: BackendAdapterEntityFieldManifest[];
  idPath: string;
  name: string;
  primaryKey?: string;
}): BackendAdapterEntityDatabaseManifest {
  const columns = args.columns ?? createDefaultDatabaseColumns(args.fields);

  if (!columns.length) {
    throw new Error(`Entity "${args.name}" must define at least one database column.`);
  }

  const primaryKey = args.primaryKey
    ?? args.fields.find((field) => field.entityPath === args.idPath)?.remotePath
    ?? args.idPath;

  if (!columns.some((column) => column.columnName === primaryKey)) {
    throw new Error(
      `Entity "${args.name}" database columns must include the primary key column "${primaryKey}".`,
    );
  }

  return {
    columns,
    primaryKey,
  };
}

function createDefaultEntityGraphqlManifest(args: {
  allowCreate: boolean;
  allowDelete: boolean;
  allowGetById: boolean;
  allowList: boolean;
  allowUpdate: boolean;
  entityName: string;
  tableName: string;
}): BackendAdapterEntityGraphqlManifest {
  const singularName = normalizeGraphqlIdentifier(args.entityName);
  const entityPascalName = normalizeGraphqlIdentifier(args.entityName, true);
  const pluralName = normalizeGraphqlIdentifier(args.tableName);

  return {
    allowCreate: args.allowCreate,
    allowDelete: args.allowDelete,
    allowGetById: args.allowGetById,
    allowList: args.allowList,
    allowUpdate: args.allowUpdate,
    createMutation: `create${entityPascalName}`,
    deleteMutation: `delete${entityPascalName}`,
    getByIdQuery: singularName,
    listQuery: pluralName,
    updateMutation: `update${entityPascalName}`,
  };
}

export function defineBackendAdapterEntity<
  TModel extends BackendAdapterCompatibleModel<ModelFields>,
>(options: DefineBackendAdapterEntityOptions<TModel>): BackendAdapterEntityManifest {
  const { model } = options;
  const idPath = model.idPath ?? "id";
  const tableName = options.tableName ?? `${normalizePathSegment(model.name)}s`;
  const basePath = assertAbsolutePath(
    options.rest?.basePath ?? `/entities/${normalizePathSegment(model.name)}`,
    `REST base path for entity "${model.name}"`,
  );
  const fields = Object.entries(model.definition.fields).map(([entityPath, fieldBuilder]) =>
    createEntityFieldManifest(
      entityPath,
      fieldBuilder,
      model.defaultStrategyId,
    ),
  );
  const database = createEntityDatabaseManifest({
    fields,
    idPath,
    name: model.name,
    ...(options.database?.columns
      ? { columns: options.database.columns }
      : {}),
    ...(options.database?.primaryKey
      ? { primaryKey: options.database.primaryKey }
      : {}),
  });
  const graphqlDefaults = createDefaultEntityGraphqlManifest({
    allowCreate: options.graphql?.allowCreate ?? options.rest?.allowCreate ?? true,
    allowDelete: options.graphql?.allowDelete ?? options.rest?.allowDelete ?? true,
    allowGetById: options.graphql?.allowGetById ?? options.rest?.allowGetById ?? true,
    allowList: options.graphql?.allowList ?? options.rest?.allowList ?? true,
    allowUpdate: options.graphql?.allowUpdate ?? options.rest?.allowUpdate ?? true,
    entityName: model.name,
    tableName,
  });

  return {
    database: {
      columns: database.columns.map((column) => ({ ...column })),
      primaryKey: database.primaryKey,
    },
    fields,
    graphql: {
      allowCreate: options.graphql?.allowCreate ?? graphqlDefaults.allowCreate,
      allowDelete: options.graphql?.allowDelete ?? graphqlDefaults.allowDelete,
      allowGetById: options.graphql?.allowGetById ?? graphqlDefaults.allowGetById,
      allowList: options.graphql?.allowList ?? graphqlDefaults.allowList,
      allowUpdate: options.graphql?.allowUpdate ?? graphqlDefaults.allowUpdate,
      createMutation: options.graphql?.createMutation ?? graphqlDefaults.createMutation,
      deleteMutation: options.graphql?.deleteMutation ?? graphqlDefaults.deleteMutation,
      getByIdQuery: options.graphql?.getByIdQuery ?? graphqlDefaults.getByIdQuery,
      listQuery: options.graphql?.listQuery ?? graphqlDefaults.listQuery,
      updateMutation: options.graphql?.updateMutation ?? graphqlDefaults.updateMutation,
    },
    idPath,
    name: model.name,
    rest: {
      allowCreate: options.rest?.allowCreate ?? true,
      allowDelete: options.rest?.allowDelete ?? true,
      allowGetById: options.rest?.allowGetById ?? true,
      allowList: options.rest?.allowList ?? true,
      allowUpdate: options.rest?.allowUpdate ?? true,
      basePath,
    },
    tableName,
  };
}

export function createPasswordSessionAuthManifest(
  input: BackendAdapterAuthManifest["rest"] & {
    refreshDurationSeconds: number;
    refreshCookieName?: string;
    sessionCookieName?: string;
    sessionDurationSeconds: number;
  },
): BackendAdapterAuthManifest {
  return {
    mode: "password-session",
    rest: {
      paths: input.paths,
    },
    session: {
      cookieNames: {
        refresh: input.refreshCookieName ?? "e2ee_refresh_session",
        session: input.sessionCookieName ?? "e2ee_session",
      },
      refreshDurationSeconds: input.refreshDurationSeconds,
      sessionDurationSeconds: input.sessionDurationSeconds,
    },
  };
}

export function createBackendAdapterManifest(
  options: CreateBackendAdapterManifestOptions,
): BackendAdapterManifest {
  if (!options.entities.length) {
    throw new Error("Backend adapter manifest requires at least one entity.");
  }

  const expectedSchemaApi = options.database?.expectedSchema?.api ?? {
    rest: {
      baseUrl: "/api",
      defaultHeaders: {
        accept: "application/json",
      },
    },
    type: "rest",
  } satisfies BackendAdapterExpectedSchemaApiManifest;
  const expectedSchemaEntities =
    options.database?.expectedSchema?.entities ??
    options.entities.map((entity) =>
      createExpectedSchemaEntityManifest(entity, expectedSchemaApi.type)
    );

  const manifest: BackendAdapterManifest = {
    auth: options.auth,
    database: {
      engine: options.database?.engine ?? "postgres",
      expectedSchema: {
        api: expectedSchemaApi.type === "graphql"
          ? {
              graphql: {
                endpointPath: expectedSchemaApi.graphql.endpointPath,
                ...(expectedSchemaApi.graphql.defaultHeaders
                  ? { defaultHeaders: expectedSchemaApi.graphql.defaultHeaders }
                  : { defaultHeaders: { accept: "application/json" } }),
              },
              type: "graphql",
            }
          : {
              rest: {
                baseUrl: expectedSchemaApi.rest.baseUrl,
                ...(expectedSchemaApi.rest.defaultHeaders
                  ? { defaultHeaders: expectedSchemaApi.rest.defaultHeaders }
                  : { defaultHeaders: { accept: "application/json" } }),
              },
              type: "rest",
            },
        authTables: options.database?.expectedSchema?.authTables ?? [
          "users",
          "sessions",
        ],
        entities: expectedSchemaEntities,
        entityTables: options.database?.expectedSchema?.entityTables ??
          expectedSchemaEntities.map((entity) => ({
            columns: options.entities
              .find((candidate) => candidate.name === entity.name)?.database.columns
              .map((column) => ({ ...column })) ?? [],
            primaryKey: entity.primaryKey,
            tableName: entity.tableName,
          })),
      },
    },
    entities: options.entities,
    name: options.name,
    version: BACKEND_ADAPTER_MANIFEST_VERSION,
  };

  if (options.realtime) {
    manifest.realtime = options.realtime;
  }

  return manifest;
}

export function serializeBackendAdapterManifest(
  manifest: BackendAdapterManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
