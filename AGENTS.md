# Architecture Rules

- Store unpublished protocol edits only in the coach-private `protocol_drafts` table; published student reads use `protocols.payload`.
- Save and publish protocols through `save_protocol_with_plan` with the current revision; this keeps snapshots, plans, and conflict detection atomic.
- Identify workout exercises by persisted `__id` and periodization overrides by `exerciseId`, retaining positional lookup only for legacy payloads.
- Preserve food quantity units and calculate nutrition only from explicit, safely convertible quantities; never invent a default serving weight.
- Partition load history (last-load prefill and the load-progression drawer) by `workout_sets.periodization_week` (0..3, the week position), never by `periodization_key` (the week type); week 2 and week 3 keep separate histories. History belongs to the exercise, not to the workout day. Without periodization, use the exercise's latest sessions overall.