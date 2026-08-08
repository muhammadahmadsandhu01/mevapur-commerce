# P3 Staging Post-Migration Verification

> **Final authoritative status: PASS.** The original pre-initialization
> snapshot is historical; `Final Verification` records the completed state.

## Historical Gate Status

**APPLY NOT EXECUTED — dry-run safely blocked implicit collection creation**

| Verification | Result |
|---|---|
| Pre-dry-run collection count | 1 |
| Post-dry-run collection count | 1 |
| Pre-dry-run document count | 1 |
| Post-dry-run document count | 1 |
| Pre-dry-run index count | 1 |
| Post-dry-run index count | 1 |
| Required indexes verified | 0 |
| Legacy indexes removed | 0 |
| Unexpected collections | 0 |
| Documents deleted | No operation executed |
| Index mutations | 0 |
| Staging marker | Intact |
| Staging backup retained | Yes; hashes verified |
| Production recovery dump retained | Present: 14 BSON/14 metadata files |
| Production Atlas touched | No |

The only collection remains `environment_markers`, containing one marker
document and its `_id` index. The corrected dry-run returned exit code `3`
because all 14 allowlisted creates target absent application collections.

## Required Future Verification

After an independently approved synthetic schema-initialization step creates
the seven allowlisted target collections without using index side effects:

1. compare exact collection-name sets;
2. compare per-collection and aggregate document counts;
3. compare canonical index definitions;
4. verify every allowlisted create/retain;
5. verify the exact legacy Payment TTL is absent when approved;
6. verify no unapproved index is missing;
7. verify no unexpected collection appeared;
8. verify the staging dump and isolated restore evidence remain intact;
9. verify the production recovery dump remains intact;
10. rerun the migration and require an idempotent successful result.

## Final Verification

The historical blocked state above was resolved by the separately approved
schema initialization. The requirements were then completed.

| Verification | Result |
|---|---|
| Pre-apply collections/documents/indexes | 8 / 1 / 8 |
| First apply | 14 created, 0 removed, exit `0` |
| Immediate post-apply collections/documents/indexes | 8 / 1 / 22 |
| Required allowlisted definitions | 14/14 exact |
| Conflicting definitions | 0 |
| Legacy Payment TTL | Absent; no removal |
| Second apply | 14 retained, 0 created, exit `0` |
| Marker | Intact |
| Document insert/update/delete during migration | 0 / 0 / 0 |
| Production Atlas | Untouched |

After the later application smoke and exact record cleanup, 11 empty
Mongoose-materialized model collections remain. Final topology is 19
collections, 1 marker document, and 33 indexes. The original 14 allowlisted
definitions remain exact and all synthetic application documents are absent.
This section is the authoritative final status.

A final migration-identity read-only snapshot after rollback confirmed
`19 collections / 1 marker document / 33 indexes`, 14/14 required indexes,
zero application documents, no legacy Payment TTL, and zero mutations.
