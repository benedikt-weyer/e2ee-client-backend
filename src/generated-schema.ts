import { z } from "zod";
import type { EncryptionAlgorithmId } from "./crypto/types";
import type {
  BackendAdapterEntityGraphqlManifest,
  BackendAdapterEntityRestManifest,
  BackendAdapterExpectedSchemaEntityApiManifest,
  BackendAdapterExpectedSchemaEntityManifest,
  BackendAdapterExpectedSchemaGraphqlApiManifest,
  BackendAdapterExpectedSchemaManifest,
  BackendAdapterExpectedSchemaRestApiManifest,
  BackendAdapterSchemaType,
} from "./manifest";
import type { GraphqlTransport, RestTransport } from "./adapters/contracts";
import {
  GraphqlCrudAdapter,
  createGraphqlTransport,
  type GraphqlExecutorInput,
} from "./adapters/graphql";
import {
  createFetchRestTransport,
  type FetchRestTransport,
  type FetchRestTransportOptions,
  RestCrudAdapter,
} from "./adapters/rest";
import {
  createGraphqlPasswordAuthConfig,
  type GraphqlPasswordAuthConfig,
} from "./auth/password-auth-client";
import type { EntitySchema } from "./repositories/entity-repository";
import {
  defineEntityModel,
  field,
  type ModelFieldBuilder,
  type ModelFields,
} from "./schema-builder";

type JsonObject = Record<string, unknown>;

function normalizeBasePath(basePath: string): string {
  if (basePath === "/") {
    return "/";
  }

  return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

function resolveEntityItemPath(basePath: string, id: string | number): string {
  const normalizedBasePath = normalizeBasePath(basePath);

  return `${normalizedBasePath}/${encodeURIComponent(String(id))}`;
}

function getEntityRestApi(
  entity: BackendAdapterExpectedSchemaEntityManifest,
): BackendAdapterEntityRestManifest {
  const api = entity.api;
  if (!api || api.type !== "rest") {
    throw new Error(`Generated schema entity "${entity.name}" does not define REST API metadata.`);
  }

  return api.rest;
}

function getSchemaRestApi(
  schema: BackendAdapterExpectedSchemaManifest,
): BackendAdapterExpectedSchemaRestApiManifest {
  const api = schema.api;
  if (!api || api.type !== "rest") {
    throw new Error("Generated schema file does not define REST transport metadata.");
  }

  return api.rest;
}

function getEntityGraphqlApi(
  entity: BackendAdapterExpectedSchemaEntityManifest,
): BackendAdapterEntityGraphqlManifest {
  const api = entity.api;
  if (!api || api.type !== "graphql") {
    throw new Error(`Generated schema entity "${entity.name}" does not define GraphQL API metadata.`);
  }

  return api.graphql;
}

function getSchemaGraphqlApi(
  schema: BackendAdapterExpectedSchemaManifest,
): BackendAdapterExpectedSchemaGraphqlApiManifest {
  const api = schema.api;
  if (!api || api.type !== "graphql") {
    throw new Error("Generated schema file does not define GraphQL transport metadata.");
  }

  return api.graphql;
}

export interface CreateGeneratedEntitySchemaOptions {
  cacheCollection?: string;
  defaultStrategyId?: EncryptionAlgorithmId;
}

export interface BackendAdapterGeneratedSchemaFile {
  expectedSchema: BackendAdapterExpectedSchemaManifest;
}

export interface CreateGeneratedRestTransportOptions {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  fetch?: FetchRestTransportOptions["fetch"];
}

export interface CreateGeneratedGraphqlTransportOptions {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  endpointPath?: string;
  fetch?: typeof fetch;
}

export interface CreateGeneratedGraphqlAuthOptions {
  fieldNames?: Partial<{
    getKdfSalt: string;
    login: string;
    logout: string;
    refresh: string;
    registerBegin: string;
    registerComplete: string;
  }>;
  userSelectionSet?: string;
}

export function parseGeneratedSchemaFile(
  json: string,
): BackendAdapterGeneratedSchemaFile {
  return JSON.parse(json) as BackendAdapterGeneratedSchemaFile;
}

const DEFAULT_GRAPHQL_AUTH_FIELDS = {
  getKdfSalt: "kdfSalt",
  login: "login",
  logout: "logout",
  refresh: "refreshSession",
  registerBegin: "registerBegin",
  registerComplete: "registerComplete",
} as const;

type SelectionNode = {
  children: Map<string, SelectionNode>;
  leaf: boolean;
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(`Expected ${label} to be an object.`);
  }

  return value as Record<string, unknown>;
}

function extractGraphqlRootField(
  value: unknown,
  fieldName: string,
  operationName: string,
): unknown {
  const objectValue = asObject(value, `${operationName} result`);
  if (!(fieldName in objectValue)) {
    throw new Error(`Expected ${operationName} result to include "${fieldName}".`);
  }

  return objectValue[fieldName];
}

function normalizeGraphqlOperationName(value: string): string {
  const fragments = value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (!fragments.length) {
    return "GeneratedOperation";
  }

  return fragments
    .map((fragment) => `${fragment[0]!.toUpperCase()}${fragment.slice(1)}`)
    .join("");
}

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function resolveGraphqlEndpoint(
  schema: BackendAdapterExpectedSchemaManifest,
  options: CreateGeneratedGraphqlTransportOptions,
): string {
  const graphql = getSchemaGraphqlApi(schema);
  const endpointPath = options.endpointPath ?? graphql.endpointPath;

  if (options.baseUrl) {
    return joinUrl(options.baseUrl, endpointPath);
  }

  return endpointPath;
}

function createSelectionNode(): SelectionNode {
  return {
    children: new Map<string, SelectionNode>(),
    leaf: false,
  };
}

function addSelectionPath(root: SelectionNode, path: string): void {
  const segments = path.split(".").filter(Boolean);
  let current = root;

  for (const [index, segment] of segments.entries()) {
    if (current.leaf) {
      throw new Error(
        `GraphQL selection path conflict at "${path}". A scalar field is already mapped above this path.`,
      );
    }

    const next = current.children.get(segment) ?? createSelectionNode();
    current.children.set(segment, next);
    current = next;

    if (index === segments.length - 1) {
      if (current.children.size > 0) {
        throw new Error(
          `GraphQL selection path conflict at "${path}". The same field is used as both object and scalar.`,
        );
      }
      current.leaf = true;
    }
  }
}

function renderSelectionNode(root: SelectionNode, indent = 2): string {
  const spaces = " ".repeat(indent);

  return [...root.children.entries()].map(([segment, child]) => {
    if (child.children.size === 0) {
      return `${spaces}${segment}`;
    }

    return `${spaces}${segment} {\n${renderSelectionNode(child, indent + 2)}\n${spaces}}`;
  }).join("\n");
}

function buildGraphqlSelectionSet(
  entity: BackendAdapterExpectedSchemaEntityManifest,
): string {
  const root = createSelectionNode();

  for (const fieldManifest of entity.fields) {
    addSelectionPath(root, fieldManifest.remotePath);
  }

  return renderSelectionNode(root);
}

function buildGraphqlCreateInputTypeName(
  entity: BackendAdapterExpectedSchemaEntityManifest,
): string {
  return `Create${normalizeGraphqlOperationName(entity.name)}Input!`;
}

function buildGraphqlUpdateInputTypeName(
  entity: BackendAdapterExpectedSchemaEntityManifest,
): string {
  return `Update${normalizeGraphqlOperationName(entity.name)}Input!`;
}

function buildGraphqlDocument(
  operationType: "mutation" | "query",
  operationName: string,
  fieldName: string,
  args: string,
  selectionSet?: string,
): string {
  const selection = selectionSet ? ` {\n${selectionSet}\n}` : "";

  return `${operationType} ${operationName}${args ? `(${args})` : ""} {\n  ${fieldName}${args ? `(${args.replace(/\$([a-zA-Z0-9_]+): [^,)!]+!?/g, "$1: $$$1")})` : ""}${selection}\n}`;
}

function buildGraphqlPasswordAuthDocuments(
  options: CreateGeneratedGraphqlAuthOptions = {},
): GraphqlPasswordAuthConfig<unknown>["documents"] {
  const fields = {
    ...DEFAULT_GRAPHQL_AUTH_FIELDS,
    ...options.fieldNames,
  };
  const userSelectionSet = options.userSelectionSet?.trim() || "id\n      email";

  return {
    getKdfSalt: `query GetKdfSalt($email: String!) {\n  ${fields.getKdfSalt}(email: $email)\n}`,
    login: `mutation Login($email: String!, $authKeyMaterialHex: String!) {\n  ${fields.login}(email: $email, authKeyMaterialHex: $authKeyMaterialHex) {\n    ok\n    message\n    user {\n      ${userSelectionSet}\n    }\n  }\n}`,
    logout: `mutation Logout {\n  ${fields.logout}\n}`,
    refresh: `mutation RefreshSession {\n  ${fields.refresh} {\n    ok\n    message\n    user {\n      ${userSelectionSet}\n    }\n  }\n}`,
    registerBegin: `mutation RegisterBegin($email: String!) {\n  ${fields.registerBegin}(email: $email) {\n    kdfSaltBase64\n  }\n}`,
    registerComplete: `mutation RegisterComplete($email: String!, $authKeyMaterialHex: String!) {\n  ${fields.registerComplete}(email: $email, authKeyMaterialHex: $authKeyMaterialHex) {\n    ok\n    message\n    user {\n      ${userSelectionSet}\n    }\n  }\n}`,
  };
}

function schemaForType(type: BackendAdapterSchemaType): z.ZodTypeAny {
  switch (type) {
    case "array":
      return z.array(z.unknown());
    case "boolean":
      return z.boolean();
    case "number":
      return z.number();
    case "object":
      return z.record(z.string(), z.unknown());
    case "string":
      return z.string();
    case "json":
    case "unknown":
      return z.unknown();
  }
}

export function createEntitySchemaFromExpectedSchemaEntity(
  entity: BackendAdapterExpectedSchemaEntityManifest,
  options: CreateGeneratedEntitySchemaOptions = {},
): EntitySchema<JsonObject, JsonObject, string | number> {
  const fields = Object.fromEntries(entity.fields.map((fieldManifest) => {
    const entitySchema = schemaForType(fieldManifest.entityType);
    const remoteSchema = schemaForType(fieldManifest.remoteType);
    let fieldBuilder: ModelFieldBuilder<
      unknown,
      unknown,
      string | undefined,
      boolean
    > = field.custom({ entitySchema, remoteSchema });

    if (fieldManifest.nullable) {
      fieldBuilder = fieldBuilder.nullable();
    }

    if (fieldManifest.optional) {
      fieldBuilder = fieldBuilder.optional();
    }

    if (fieldManifest.remotePath !== fieldManifest.entityPath) {
      fieldBuilder = fieldBuilder.remote(fieldManifest.remotePath);
    }

    if (fieldManifest.encrypted) {
      fieldBuilder = fieldManifest.strategyId
        ? fieldBuilder.encrypted({
          strategyId: fieldManifest.strategyId as EncryptionAlgorithmId,
        })
        : fieldBuilder.encrypted();
    }

    return [fieldManifest.entityPath, fieldBuilder];
  })) as ModelFields;

  return defineEntityModel({
    cacheCollection: options.cacheCollection ?? entity.tableName,
    ...(options.defaultStrategyId ? { defaultStrategyId: options.defaultStrategyId } : {}),
    fields,
    idField: entity.idPath,
    name: entity.name,
  });
}

export function createEntitySchemasFromExpectedSchema(
  schema: BackendAdapterExpectedSchemaManifest,
  optionsByEntity: Record<string, CreateGeneratedEntitySchemaOptions> = {},
): Record<string, EntitySchema<JsonObject, JsonObject, string | number>> {
  return Object.fromEntries(schema.entities.map((entity) => [
    entity.name,
    createEntitySchemaFromExpectedSchemaEntity(entity, optionsByEntity[entity.name]),
  ]));
}

export function createEntitySchemasFromGeneratedSchemaFile(
  json: string,
  optionsByEntity: Record<string, CreateGeneratedEntitySchemaOptions> = {},
): Record<string, EntitySchema<JsonObject, JsonObject, string | number>> {
  return createEntitySchemasFromExpectedSchema(
    parseGeneratedSchemaFile(json).expectedSchema,
    optionsByEntity,
  );
}

export function createGraphqlCrudAdapterFromExpectedSchemaEntity<
  TRemote = JsonObject,
  TId extends string | number = string | number,
>(
  entity: BackendAdapterExpectedSchemaEntityManifest,
  transport: GraphqlTransport,
): GraphqlCrudAdapter<TRemote, TId> {
  const graphql = getEntityGraphqlApi(entity);
  const selectionSet = buildGraphqlSelectionSet(entity);

  return new GraphqlCrudAdapter<TRemote, TId>(transport, {
    ...(graphql.allowCreate
      ? {
          create: {
            buildVariables: (input: TRemote) => ({ input }),
            document: buildGraphqlDocument(
              "mutation",
              `Create${normalizeGraphqlOperationName(entity.name)}`,
              graphql.createMutation,
              `$input: ${buildGraphqlCreateInputTypeName(entity)}`,
              selectionSet,
            ),
            select: (result: unknown) => extractGraphqlRootField(
              result,
              graphql.createMutation,
              graphql.createMutation,
            ) as TRemote,
          },
        }
      : {}),
    ...(graphql.allowDelete
      ? {
          delete: {
            buildVariables: (id: TId) => ({ id }),
            document: buildGraphqlDocument(
              "mutation",
              `Delete${normalizeGraphqlOperationName(entity.name)}`,
              graphql.deleteMutation,
              "$id: ID!",
            ),
          },
        }
      : {}),
    ...(graphql.allowGetById
      ? {
          getById: {
            buildVariables: (id: TId) => ({ id }),
            document: buildGraphqlDocument(
              "query",
              `Get${normalizeGraphqlOperationName(entity.name)}ById`,
              graphql.getByIdQuery,
              "$id: ID!",
              selectionSet,
            ),
            select: (result: unknown) => extractGraphqlRootField(
              result,
              graphql.getByIdQuery,
              graphql.getByIdQuery,
            ) as TRemote | null,
          },
        }
      : {}),
    ...(graphql.allowList
      ? {
          list: {
            document: buildGraphqlDocument(
              "query",
              `List${normalizeGraphqlOperationName(entity.tableName)}`,
              graphql.listQuery,
              "",
              selectionSet,
            ),
            select: (result: unknown) => extractGraphqlRootField(
              result,
              graphql.listQuery,
              graphql.listQuery,
            ) as TRemote[],
          },
        }
      : {}),
    ...(graphql.allowUpdate
      ? {
          update: {
            buildVariables: (id: TId, input: TRemote) => ({ id, input }),
            document: buildGraphqlDocument(
              "mutation",
              `Update${normalizeGraphqlOperationName(entity.name)}`,
              graphql.updateMutation,
              `$id: ID!, $input: ${buildGraphqlUpdateInputTypeName(entity)}`,
              selectionSet,
            ),
            select: (result: unknown) => extractGraphqlRootField(
              result,
              graphql.updateMutation,
              graphql.updateMutation,
            ) as TRemote,
          },
        }
      : {}),
  });
}

export function createGraphqlCrudAdaptersFromExpectedSchema<
  TRemote = JsonObject,
  TId extends string | number = string | number,
>(
  schema: BackendAdapterExpectedSchemaManifest,
  transport: GraphqlTransport,
): Record<string, GraphqlCrudAdapter<TRemote, TId>> {
  if (schema.api?.type !== "graphql") {
    throw new Error("Generated schema file does not declare GraphQL API support.");
  }

  return Object.fromEntries(schema.entities.map((entity) => [
    entity.name,
    createGraphqlCrudAdapterFromExpectedSchemaEntity<TRemote, TId>(entity, transport),
  ]));
}

export function createGraphqlTransportFromExpectedSchema(
  schema: BackendAdapterExpectedSchemaManifest,
  options: CreateGeneratedGraphqlTransportOptions = {},
): GraphqlTransport {
  const graphql = getSchemaGraphqlApi(schema);
  const endpoint = resolveGraphqlEndpoint(schema, options);
  const fetchImpl = options.fetch ?? fetch;
  const defaultHeaders = {
    ...(graphql.defaultHeaders ?? {}),
    ...(options.defaultHeaders ?? {}),
  };

  return createGraphqlTransport(async <
    TResult,
    TVariables = Record<string, unknown>,
  >(
    input: GraphqlExecutorInput<TVariables>,
  ): Promise<TResult> => {
    const { document, variables } = input;
    const headers = new Headers(defaultHeaders);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetchImpl(endpoint, {
      body: JSON.stringify(
        variables === undefined
          ? { query: String(document) }
          : { query: String(document), variables },
      ),
      headers,
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed with ${response.status}.`);
    }

    const payload = await response.json() as {
      data?: unknown;
      errors?: Array<{ message?: string }>;
    };

    if (payload.errors?.length) {
      throw new Error(payload.errors[0]?.message ?? "GraphQL request failed.");
    }

    return payload.data as TResult;
  });
}

export function createGraphqlPasswordAuthConfigFromExpectedSchema<
  TUser = unknown,
>(
  schema: BackendAdapterExpectedSchemaManifest,
  transport: GraphqlTransport,
  options: CreateGeneratedGraphqlAuthOptions = {},
): GraphqlPasswordAuthConfig<TUser> {
  getSchemaGraphqlApi(schema);

  return createGraphqlPasswordAuthConfig<TUser>({
    documents: buildGraphqlPasswordAuthDocuments(options),
    ...(options.fieldNames ? { fieldNames: options.fieldNames } : {}),
    transport,
  });
}

export function createRestCrudAdapterFromExpectedSchemaEntity<
  TRemote = JsonObject,
  TId extends string | number = string | number,
>(
  entity: BackendAdapterExpectedSchemaEntityManifest,
  transport: RestTransport,
): RestCrudAdapter<TRemote, TId> {
  const rest = getEntityRestApi(entity);
  const basePath = normalizeBasePath(rest.basePath);

  return new RestCrudAdapter<TRemote, TId>(transport, {
    ...(rest.allowCreate ? { create: { path: basePath } } : {}),
    ...(rest.allowDelete
      ? { delete: { path: (id: TId) => resolveEntityItemPath(basePath, id) } }
      : {}),
    ...(rest.allowGetById
      ? { getById: { path: (id: TId) => resolveEntityItemPath(basePath, id) } }
      : {}),
    ...(rest.allowList ? { list: { path: basePath } } : {}),
    ...(rest.allowUpdate
      ? { update: { path: (id: TId) => resolveEntityItemPath(basePath, id) } }
      : {}),
  });
}

export function createRestCrudAdaptersFromExpectedSchema<
  TRemote = JsonObject,
  TId extends string | number = string | number,
>(
  schema: BackendAdapterExpectedSchemaManifest,
  transport: RestTransport,
): Record<string, RestCrudAdapter<TRemote, TId>> {
  if (schema.api?.type !== "rest") {
    throw new Error("Generated schema file does not declare REST API support.");
  }

  return Object.fromEntries(schema.entities.map((entity) => [
    entity.name,
    createRestCrudAdapterFromExpectedSchemaEntity<TRemote, TId>(entity, transport),
  ]));
}

export function createRestTransportFromExpectedSchema(
  schema: BackendAdapterExpectedSchemaManifest,
  options: CreateGeneratedRestTransportOptions = {},
): FetchRestTransport {
  const rest = getSchemaRestApi(schema);

  return createFetchRestTransport({
    baseUrl: options.baseUrl ?? rest.baseUrl,
    defaultHeaders: {
      ...(rest.defaultHeaders ?? {}),
      ...(options.defaultHeaders ?? {}),
    },
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export function createRestCrudAdaptersFromGeneratedSchemaFile<
  TRemote = JsonObject,
  TId extends string | number = string | number,
>(
  json: string,
  transport: RestTransport,
): Record<string, RestCrudAdapter<TRemote, TId>> {
  return createRestCrudAdaptersFromExpectedSchema<TRemote, TId>(
    parseGeneratedSchemaFile(json).expectedSchema,
    transport,
  );
}

export function createRestTransportFromGeneratedSchemaFile(
  json: string,
  options: CreateGeneratedRestTransportOptions = {},
): FetchRestTransport {
  return createRestTransportFromExpectedSchema(
    parseGeneratedSchemaFile(json).expectedSchema,
    options,
  );
}

export function createGraphqlCrudAdaptersFromGeneratedSchemaFile<
  TRemote = JsonObject,
  TId extends string | number = string | number,
>(
  json: string,
  transport: GraphqlTransport,
): Record<string, GraphqlCrudAdapter<TRemote, TId>> {
  return createGraphqlCrudAdaptersFromExpectedSchema<TRemote, TId>(
    parseGeneratedSchemaFile(json).expectedSchema,
    transport,
  );
}

export function createGraphqlTransportFromGeneratedSchemaFile(
  json: string,
  options: CreateGeneratedGraphqlTransportOptions = {},
): GraphqlTransport {
  return createGraphqlTransportFromExpectedSchema(
    parseGeneratedSchemaFile(json).expectedSchema,
    options,
  );
}