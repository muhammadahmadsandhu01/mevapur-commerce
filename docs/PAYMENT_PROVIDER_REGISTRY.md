# Payment Provider Registry

The registry distinguishes five independent facts:

1. `installed`: the source adapter is registered.
2. `included`: the active edition manifest includes it.
3. `enabled`: its explicit feature flag is true.
4. `configured`: its adapter validates the available configuration.
5. `eligible`: country, currency and checkout context are supported.

`available` is true only when all five checks pass. Public clients receive only available methods. Admin clients can see all installed provider states and safe blocker codes.

Historical records are resolved from their persisted provider snapshot. An unavailable or removed plugin does not make a historical payment unreadable.
