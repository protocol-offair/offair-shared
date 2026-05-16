# OffAir Shared

OffAir Shared is the public TypeScript package for shared protocol types, risk utilities, journal helpers, identity continuity, blocklist structures and simulation primitives.

Portuguese version: [README.pt-BR.md](./README.pt-BR.md)

## Installation

```bash
npm install @protocol-offair/shared
```

## Development

```bash
npm install
npm run build
npm test
```

## Package Contents

- `dist/crypto.js`: canonical JSON, hashing, nonces and crypto helpers.
- `dist/journal.js`: offline journal and receipt helpers.
- `dist/policy.js`: settlement-tier and policy evaluation helpers.
- `dist/identity.js`: device reputation and lineage utilities.
- `dist/blocklist.js`: blocklist root/history primitives.
- `dist/types.js`: shared runtime constants and type exports.

## Compatibility

The npm package is published as `@protocol-offair/shared`. Legacy internal import names from the original monorepo should be migrated to this package name when consuming from separate repositories.
