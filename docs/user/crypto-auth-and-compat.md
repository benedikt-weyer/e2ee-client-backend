# Crypto, Auth, and Compatibility

## Strategy Selection

The package ships with multiple crypto strategies so the application can choose the right tradeoff.

### AES-256-GCM

Use `createAes256GcmStrategy()` when you want the simplest and fastest option that matches the existing dashboard flow.

This is the default recommendation unless your threat model requires the post-quantum envelope flow.

### ML-KEM Plus AES-256-GCM

Use the ML-KEM-based exports when you need a post-quantum envelope approach and are willing to carry the extra WASM dependency.

That path is appropriate when:

- you need hybrid encryption semantics
- your browser bundle can tolerate the additional dependency
- your threat model justifies the extra complexity

## Context Resolvers

The repository and client factory do not hard-code how crypto material is acquired.

Instead, a `contextResolver` provides the per-request crypto context, such as:

- a symmetric key
- strategy-specific encryption context
- other material needed for encrypt or decrypt operations

That keeps key management outside the repository and makes the package adaptable to different auth flows.

## Password-Based Client Auth

Use `createPasswordAuthClient` when:

- the backend stores only password-derived auth material
- the browser derives both auth and encryption material from the password
- you want to reuse the same auth flow logic across multiple apps

This is useful when authentication and E2EE key derivation should stay aligned but still be encapsulated behind a reusable browser client.

## Legacy Blob Compatibility

Some systems still store one encrypted JSON blob rather than separate encrypted fields.

For that migration path, use:

- `encryptJsonToLegacyBlob`
- `decryptJsonFromLegacyBlob`
- `legacyBlobToEncryptedField`
- `encryptedFieldToLegacyBlob`

These helpers let you adopt the repository layer incrementally while the backend storage model is still being normalized.