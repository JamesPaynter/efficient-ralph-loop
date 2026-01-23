# Policy Artifacts (Autonomy Tiers)

Autonomy tiers classify tasks into a minimal 0-3 risk scale. The tier drives default
policy strictness (warn vs block) and check selection (scoped vs global).

## Tier semantics (MVP defaults)

- Tier 0: no surface change, low blast radius (single component).
- Tier 1: moderate blast radius (2-3 components), no surface change.
- Tier 2: any surface change, large blast radius (4+ components), or repo-root fallback.
- Tier 3: migration surface changes, config+contract combos, or repo-root fallback with wide impact.

## Behavior

- Checks: tiers 2/3 force global doctor commands even when scoped commands exist.
- Enforcement: when `manifest_enforcement=warn`, tiers 2/3 upgrade to `block`.
  `off` and `block` remain unchanged.

## Artifact location

Each task writes one JSON report at:

```
.mycelium/reports/control-plane/policy/<runId>/<taskId>.json
```

## Report shape

```json
{
  "tier": 2,
  "surface_change": true,
  "blast_radius": {
    "touched": 1,
    "impacted": 4,
    "confidence": "high"
  },
  "checks": {
    "mode": "enforce",
    "selected_command": "npm test",
    "rationale": ["surface_change:contract", "fallback:tier_high_risk"]
  },
  "locks": {
    "declared": {
      "reads": [],
      "writes": ["component:acme-web-app"]
    },
    "derived": {
      "reads": [],
      "writes": ["component:acme-web-app", "surface:acme-web-app"]
    }
  }
}
```

`locks.derived` is only present when derived scope is computed.
