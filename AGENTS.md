# AGENTS.md

## Agent skills

### Issue tracker

Issues, specs and tickets are markdown files under `.scratch/<feature-slug>/` (local-markdown tracker; `.scratch/` is gitignored, so they stay local). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles, label string equals role name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### Docs map

- `README.md` — architecture, plugin inventory, install and "how to add a workspace" (the checklist at §5.4 is the one to follow).
- `CHANGELOG.md` — what changed since the last working version; not a release log.
- `docs/adr/` — why the shell / frame / workspace boundaries are where they are.
- `plugins/<name>/docs/DETAIL.md` — per-plugin service surface, wiring and limits; linked from the plugin page via `locale/*.json` `meta.detail`.

