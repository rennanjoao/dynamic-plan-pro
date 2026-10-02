# Architecture Rules

- Store unpublished protocol edits only in the coach-private `protocol_drafts` table; published student reads use `protocols.payload`.
- Save and publish protocols through `save_protocol_with_plan` with the current revision; this keeps snapshots, plans, and conflict detection atomic.
- Identify workout exercises by persisted `__id` and periodization overrides by `exerciseId`, retaining positional lookup only for legacy payloads.
- Preserve food quantity units and calculate nutrition only from explicit, safely convertible quantities; never invent a default serving weight.