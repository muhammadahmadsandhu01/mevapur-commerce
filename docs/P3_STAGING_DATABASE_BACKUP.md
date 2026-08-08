# P3 Staging Database Backup

## Status

**PASS — staging dump and isolated restore independently verified**

## Result

| Check | Result |
|---|---|
| Private non-SRV configuration | 32/32 checks passed |
| Application identity gate | PASS |
| Migration identity gate | PASS |
| `mongodump` attempted | Yes |
| Dump exit code | `0` |
| Staging collection count | 1 |
| Staging document count | 1 |
| Staging index count | 1 |
| BSON / metadata files | 1 / 1 |
| Hashed dump files | 3 |
| Isolated restore attempted | Yes |
| Restore exit code | `0` |
| Collection comparison | 1/1 matched |
| Document comparison | 1/1 matched |
| Index comparison | 1/1 matched |
| Marker comparison | PASS |
| Exact restore-test database dropped | Yes |
| Restore-test database absent afterward | Yes |
| Source marker/counts unchanged | PASS |
| Source staging database dropped | No |
| Other database deleted | No |

Verified dump:

```text
C:\MevaPur-Backups\mongodb-staging-pre-index-20260728-090656
```

SHA-256 manifest:

```text
C:\MevaPur-Backups\mongodb-staging-pre-index-20260728-090656\SHA256SUMS.txt
```

- Manifest entries: 3
- Manifest SHA-256:
  `64DCB59F34C6A710E1A74D22E3A7B2419FC6D9E2587ED739EDDDEF80801365E6`
- Aggregate dump bytes including manifest: 738
- Dump hashes revalidated immediately before restore: PASS

The restore used namespace mapping into only the exact approved restore-test
database and did not use `--drop`. After exact collection/count/index/marker
comparison, only that restore-test database was dropped. A fresh source
reconnection verified the staging marker and counts remained unchanged.

The existing production recovery dump remains separately retained at
`C:\MevaPur-Backups\mongodb-pre-p0-20260727-115109`. It was not overwritten,
restored, or mutated.

Production and the generic runtime URI were not accessed. No private value was
printed or written to project evidence.

## Fresh Post-Schema-Initialization Backup

The earlier dump above remains valid historical pre-initialization evidence.
Index apply used the required fresh eight-collection dump instead:

```text
C:\MevaPur-Backups\mongodb-staging-post-schema-init-20260728-093143
```

| Check | Result |
|---|---|
| `mongodump` exit code | `0` |
| Collections | 8 |
| Aggregate documents | 1 |
| Aggregate indexes | 8 |
| BSON / metadata files | 8 / 8 |
| Hashed files / manifest entries | 17 / 17 |
| SHA-256 verification | PASS |
| Isolated restore exit code | `0` |
| Restore collection/document/index comparison | 8/8, 1/1, 8/8 |
| Exact restore-test cleanup | PASS |
| Source revalidation after cleanup | PASS |

Manifest SHA-256:

```text
6356237C47ADFBD3DA25A4E68222E887BD1C015AA077F6D2BA81B146685E361F
```

All earlier dumps remained untouched. This fresh dump, not the one-collection
historical dump, was the backup evidence accepted by the index migration.
