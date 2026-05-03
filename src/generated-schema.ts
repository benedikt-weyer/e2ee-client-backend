import { z } from "zod";
import type { EncryptionAlgorithmId } from "./crypto/types";
import type {
  BackendAdapterExpectedSchemaEntityManifest,
  BackendAdapterExpectedSchemaManifest,
  BackendAdapterSchemaType,
} from "./manifest";
import type { EntitySchema } from "./repositories/entity-repository";
import { defineEntityModel, field } from "./schema-builder";

type JsonObject = Record<string, unknown>;

export interface CreateGeneratedEntitySchemaOptions {
  cacheCollection?: string;
  defaultStrategyId?: EncryptionAlgorithmId;
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
    let fieldBuilder = field.custom({
      entitySchema,
      remoteSchema,
    });

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
        ? fieldBuilder.encrypted({ strategyId: fieldManifest.strategyId })
        : fieldBuilder.encrypted();
    }

    return [fieldManifest.entityPath, fieldBuilder];
  }));

  return defineEntityModel({
    cacheCollection: options.cacheCollection,
    defaultStrategyId: options.defaultStrategyId,
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