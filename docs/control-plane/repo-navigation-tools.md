# Control Graph Repo Navigation Tools (Phase A)

Phase A defines the CLI surface and output contract for repository navigation.
The commands are intentionally stubbed until the navigation model is implemented.

## Command group

- `mycelium control-graph` (alias: `mycelium cg`)

## Shared flags

- `--repo <path>`: repo root to index (defaults to current working directory)
- `--base-sha <sha>`: explicit base commit for comparisons (overrides `--ref`)
- `--ref <ref>`: git ref to resolve into a base SHA later
- `--json`: emit the stable JSON envelope
- `--pretty`: pretty-print JSON output (implies JSON mode)
- `--no-build`: fail fast if the navigation model is missing

## Output envelope

When `--json` (or `--pretty`) is set, every command prints one JSON object:

```json
{ "ok": true, "result": {} }
```

or

```json
{
  "ok": false,
  "error": {
    "code": "MODEL_NOT_BUILT",
    "message": "Control graph model not built. Run `mycelium cg build` to generate it.",
    "details": null
  }
}
```

## Error codes

- `MODEL_NOT_BUILT`: query requires a navigation model that is not available
- `NOT_IMPLEMENTED`: the command is a stub (builder not wired yet)
- `POLICY_EVAL_ERROR`: policy evaluation input or configuration error

## Phase A command surface

- `cg build`
- `cg info`
- `cg components list`
- `cg components show <id>`
- `cg owner <path>`
- `cg deps <component>`
- `cg rdeps <component>`
- `cg blast ...`
- `cg symbols find ...`
- `cg symbols def ...`
- `cg symbols refs ...`
- `cg search <query>`

## Fast search

`cg search <query>` runs `git grep` and prints `file:line:content` matches.

- `--max <n>` caps results (default: 200).
- `--glob <pattern>` limits search to matching paths (repeatable).

## Phase B extensions

- `cg blast --run <runId> --task <taskId>` reads per-task blast artifacts (or recomputes deterministically if missing).
- `cg policy eval --repo <path> --base-sha <sha> --diff <range>` evaluates policy decisions for a change set.

## Stub behavior

- All commands return exit code `1` with a structured error until implemented.
- `--help` paths exit `0` and print standard help output.

## Run pinning (Phase B)

- Runs persist `control_plane.base_sha` (control graph metadata) at start.
- The base SHA is written immediately after checkout so failed runs remain auditable.
- Resume reuses the stored snapshot so base SHA and model hash stay fixed mid-run.
