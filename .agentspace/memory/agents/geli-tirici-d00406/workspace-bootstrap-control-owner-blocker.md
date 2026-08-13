---
name: workspace-bootstrap-control-owner-blocker
description: Unified Workspace OS bootstrap implementation and end-to-end apply require the Control repository's owner artifacts; Chef must not emulate them.
metadata:
  type: project
updatedAt: 2026-08-13
---

# Workspace bootstrap owner-artifact blocker

ADR-004 assigns the Windows unified bootstrap to `codex-chef-control`. A
Chef-only worktree lacking `codex-workspace-bootstrap.ps1`, the
`workspace-os.bootstrap.v1` schema, pinning manifest, and Control/Kitchen
owner setup/health commands cannot safely implement preview/apply or real
three-component E2E. Do not reimplement those owners in Chef; obtain the
Control worktree and Phase 0 artifacts, then add a Chef adapter only once the
contract is stable.
