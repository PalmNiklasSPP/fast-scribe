# First functional plugin handoff

## Purpose

This document scopes the work required to ship Fast Scribe's first production-ready pipeline
plugin. It is intentionally separate from the pipeline editor and runtime handoff documents.

The pipeline infrastructure is available: saved pipeline selection, versioned graph validation,
plugin execution, artifact storage, typed secondary destinations, staged publication, rollback,
and artifact export. The remaining product work is to replace the bundled placeholder processor
with a real, trusted plugin and make its behavior safe and supportable.

## Current state

`fast-scribe.placeholder-anonymizer` is a demonstration plugin. It runs in the main process,
replaces digit groups, and emits a replacement-map artifact, but it is not a privacy or
compliance feature. Its output must not be presented as real anonymization.

The Pipeline editor can add the plugin to a saved graph and configure its declared fields. A
transcription run captures the selected saved pipeline, executes it after transcription, writes
the primary text transcript, and can publish an optional replacement-map JSON file.

## Recommended first release

Choose one narrowly scoped plugin before implementing it:

| Option | Benefit | Risk |
| --- | --- | --- |
| Deterministic text cleanup | No external provider, straightforward tests, low privacy risk | Limited transformation value |
| Production anonymization | Valuable secondary JSON output and clear workflow | Requires privacy policy, detection quality, and secure data handling |

A deterministic cleanup plugin is the lowest-risk first release. Do not label it anonymization.
If anonymization is the product priority, complete every decision and control below before
shipping it.

## Required product decisions

For a production anonymizer, document and approve:

1. Supported entity categories, such as phone numbers, email addresses, personal names, customer
   IDs, and addresses.
2. Replacement format, determinism across a transcript, handling of false positives and false
   negatives, language support, and confidence thresholds.
3. Whether users can inspect, edit, or export the replacement map.
4. The provider or local algorithm, data residency, retention, authentication, rate limits, and
   provider failure behavior.
5. Run policy when anonymization fails: fail the transcription, fall back to the raw transcript,
   or require an explicit user retry. A raw fallback must never be mistaken for anonymized output.
6. Who may access raw transcripts, transformed transcripts, and maps; map retention and deletion
   policy; and whether encryption at rest is required.

## Implementation work

### Plugin runtime

1. Add a new stable plugin ID and semantic version in
   `electron/plugins/builtin-plugins.cjs`, rather than changing the placeholder's behavior in
   place.
2. Define a strict manifest with typed input/output ports and an object configuration schema.
   Supply useful, validated configuration defaults in the editor.
3. Implement `execute({ inputs, config, signal })` in the Electron main process. Keep provider
   credentials and network access out of preload and the renderer.
4. Add cancellation checks around each long-running operation, bounded request timeouts, response
   validation, and errors that identify the failing plugin/node without exposing sensitive text.
5. Register and validate every emitted artifact type. Version both the artifact value schema and
   any map format so later revisions remain readable.

### Data handling

1. Do not persist or export original-value maps until the required privacy posture is approved.
2. If maps are retained, encrypt them at rest or document an explicit approved exception; add
   retention/cleanup behavior and user-facing warnings.
3. Ensure diagnostic logs, provider errors, run manifests, and UI status messages never include
   raw transcript content or original map values.
4. Confirm that manual typed-artifact export uses the same access and warning expectations as
   configured destination publication.

### Editor and run experience

1. Replace placeholder-specific labels, descriptions, and warnings with the real plugin's
   product language.
2. Expose only supported configuration, with descriptions that explain the output and any
   irreversible transformations.
3. Preserve the existing recovery state for missing plugin versions and stale-save conflicts.
4. Show the selected saved revision used by each run; do not use the active editor draft as a
   proxy for execution.
5. For sensitive outputs, require a clear pre-save acknowledgement and identify the destination
   folder and file format.

## Verification

Add tests for:

- Plugin input/config validation, every supported entity/transformation, and malformed provider
  responses.
- Cancellation and timeout behavior at each provider/algorithm boundary.
- Provider/network failures, retry behavior, and the approved run-failure policy.
- Artifact schema validation and serializer output.
- Primary transcript plus every supported secondary destination, custom and inherited folders,
  collision suffixing, rollback, and partial-publication reporting.
- Immutable saved-pipeline snapshots while users edit, save, or select another pipeline.
- Sensitive-data redaction in errors, run manifests, and UI-visible status.

Before release, run the full Electron test suite and a packaged-app end-to-end smoke test using
representative non-production audio. Verify the actual transformed transcript, secondary output,
error path, cancellation path, and update/close dirty-state prompts.

## Release gate

The first functional plugin is ready only when its behavior and data policy are approved, the
main-process implementation and tests are complete, the UI contains no placeholder claims, and a
packaged build has passed end-to-end verification. The existing release process can then version,
merge, tag, and publish the installers.
