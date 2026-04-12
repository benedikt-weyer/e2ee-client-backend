import Loki from "lokijs";
import type { Collection } from "lokijs";

type CacheEntry<TValue> = {
  id: string;
  updatedAt: number;
  value: TValue;
};

function cloneValue<TValue>(value: TValue): TValue {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  return structuredClone(value);
}

export interface CacheStore<TEntity, TId = string> {
  clear(): void;
  clearCollection(collectionName: string): void;
  get(collectionName: string, id: TId): TEntity | null;
  list(collectionName: string): TEntity[];
  put(collectionName: string, id: TId, value: TEntity): void;
  remove(collectionName: string, id: TId): void;
}

export class LokiCacheStore<TEntity, TId = string>
  implements CacheStore<TEntity, TId>
{
  private readonly collections = new Map<string, Collection<CacheEntry<TEntity>>>();
  private readonly db = new Loki("e2ee-client-backend", {
    autoload: false,
    autosave: false,
    persistenceMethod: "memory",
  });

  public clear(): void {
    for (const name of this.collections.keys()) {
      this.clearCollection(name);
    }
  }

  public clearCollection(collectionName: string): void {
    this.collections.delete(collectionName);
    if (this.db.getCollection(collectionName)) {
      this.db.removeCollection(collectionName);
    }
  }

  public get(collectionName: string, id: TId): TEntity | null {
    const collection = this.ensureCollection(collectionName);
    const entry = collection.findOne({ id: String(id) });
    return entry ? cloneValue(entry.value) : null;
  }

  public list(collectionName: string): TEntity[] {
    const collection = this.ensureCollection(collectionName);
    return collection
      .chain()
      .simplesort("updatedAt")
      .data()
      .map((entry) => cloneValue(entry.value));
  }

  public put(collectionName: string, id: TId, value: TEntity): void {
    const collection = this.ensureCollection(collectionName);
    const normalizedId = String(id);
    const existing = collection.findOne({ id: normalizedId });

    if (existing) {
      existing.updatedAt = Date.now();
      existing.value = cloneValue(value);
      collection.update(existing);
      return;
    }

    collection.insert({
      id: normalizedId,
      updatedAt: Date.now(),
      value: cloneValue(value),
    });
  }

  public remove(collectionName: string, id: TId): void {
    const collection = this.ensureCollection(collectionName);
    const existing = collection.findOne({ id: String(id) });
    if (existing) {
      collection.remove(existing);
    }
  }

  private ensureCollection(collectionName: string): Collection<CacheEntry<TEntity>> {
    const existing = this.collections.get(collectionName);
    if (existing) {
      return existing;
    }

    const created = this.db.addCollection<CacheEntry<TEntity>>(collectionName, {
      indices: ["updatedAt"],
      unique: ["id"],
    });
    this.collections.set(collectionName, created);
    return created;
  }
}

export function createLokiCacheStore<TEntity, TId = string>(): LokiCacheStore<
  TEntity,
  TId
> {
  return new LokiCacheStore<TEntity, TId>();
}