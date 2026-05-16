# OffAir Shared

OffAir Shared é o pacote TypeScript público com tipos compartilhados do protocolo, utilitários de risco, helpers de journal, continuidade de identidade, estruturas de blocklist e primitivas de simulação.

Versão em inglês: [README.md](./README.md)

## Instalação

```bash
npm install @protocol-offair/shared
```

## Desenvolvimento

```bash
npm install
npm run build
npm test
```

## Conteúdo do Pacote

- `dist/crypto.js`: JSON canônico, hashing, nonces e helpers criptográficos.
- `dist/journal.js`: helpers de journal offline e recibos.
- `dist/policy.js`: avaliação de tiers de settlement e policies.
- `dist/identity.js`: reputação de dispositivo e lineage.
- `dist/blocklist.js`: primitivas de blocklist root/histórico.
- `dist/types.js`: constantes runtime e tipos compartilhados.

## Compatibilidade

O pacote npm é publicado como `@protocol-offair/shared`. Imports internos legados do monorepo original devem migrar para este nome ao consumir de repositórios separados.
