import type { EncryptedFieldValue, EncryptionStrategy } from "./types";

export class StrategyRegistry {
  private readonly strategies = new Map<string, EncryptionStrategy<any, any>>();

  public constructor(strategies: EncryptionStrategy<any, any>[] = []) {
    for (const strategy of strategies) {
      this.register(strategy);
    }
  }

  public register(strategy: EncryptionStrategy<any, any>): void {
    this.strategies.set(strategy.id, strategy);
  }

  public get<TEncryptContext, TDecryptContext>(
    id: string,
  ): EncryptionStrategy<TEncryptContext, TDecryptContext> {
    const strategy = this.strategies.get(id);
    if (!strategy) {
      throw new Error(`No encryption strategy registered for "${id}".`);
    }

    return strategy as EncryptionStrategy<TEncryptContext, TDecryptContext>;
  }

  public encrypt<TEncryptContext>(
    id: string,
    plaintext: Uint8Array,
    context: TEncryptContext,
  ): Promise<EncryptedFieldValue> {
    return this.get<TEncryptContext, never>(id).encrypt(plaintext, context);
  }

  public decrypt<TDecryptContext>(
    payload: EncryptedFieldValue,
    context: TDecryptContext,
  ): Promise<Uint8Array> {
    return this.get<never, TDecryptContext>(payload.algorithm).decrypt(
      payload,
      context,
    );
  }
}

export function createStrategyRegistry(
  ...strategies: EncryptionStrategy<any, any>[]
): StrategyRegistry {
  return new StrategyRegistry(strategies);
}