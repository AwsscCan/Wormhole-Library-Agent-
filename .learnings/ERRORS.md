# Errors

Command failures and integration errors.

---

## [ERR-20260829-001] npm-install-electron-builder

**Logged**: 2026-08-29T21:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
Adding the desktop packager with npm's default peer-dependency resolution failed because the existing Better Auth dependency tree reports a Zod peer conflict.

### Error
```text
npm error ERESOLVE could not resolve
peerOptional zod@^4.0.0 from better-call@1.4.0
found zod@3.25.76
```

### Context
- The command was attempted from the formal repository while adding `electron-builder`.
- No source file was changed by the failed install.

### Suggested Fix
Use `npm install --save-dev electron-builder --legacy-peer-deps` only after checking the resulting lockfile, then run the full dependency and build regression suite.

### Metadata
- Reproducible: yes
- Related Files: package.json, package-lock.json
- Pattern-Key: deps.npm-error
- Recurrence-Count: 1

---

## [ERR-20260829-002] docs-skill-path

**Logged**: 2026-08-29T21:03:00+08:00
**Priority**: low
**Status**: resolved
**Area**: docs

### Summary
The first attempt to load the local documentation skill used an incorrect skill-root path.

### Error
```text
Get-Content: Cannot find path ... .agents\\skills\\docs-generator\\SKILL.md
```

### Context
- The skill index located the skill under the bundled reverse-skill root, not the agents root.
- The correct instructions were then loaded from `.codex\\skills\\reverse-skill\\skills\\docs-generator\\SKILL.md`.

### Suggested Fix
Resolve skill paths from the injected skill-root table before reading a local skill.

### Metadata
- Reproducible: yes
- Pattern-Key: fs.no-such-file
- Recurrence-Count: 1

---

## [ERR-20260828-001] sdd-workspace-script

**Logged**: 2026-08-28T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
The bundled Superpowers SDD helper is a Bash script, but this Windows host has no `bash` executable available.

### Error
```
bash: The term 'bash' is not recognized as a name of a cmdlet, function, script file, or executable program.
```

### Context
- Attempted to initialize the plan-scoped SDD workspace for the final integration plan.
- The repository is operated through PowerShell on Windows.

### Resolution
- Recreate the helper's documented plan-scoped directory and self-ignoring `.gitignore` behaviour with PowerShell.

### Metadata
- Reproducible: yes
- Related Files: docs/superpowers/plans/2026-08-28-final-integration.md
- Pattern-Key: shell.command-not-found
- First-Seen: 2026-08-28
- Last-Seen: 2026-08-28

---

## [ERR-20260821-001] powershell-interpolation

**Logged**: 2026-08-21T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
A read-only PowerShell inspection command failed because a variable was followed directly by a colon in an interpolated string.

### Error
```text
Variable reference is not valid. ':' was not followed by a valid variable name character.
```

### Context
- Command was read-only and made no workspace changes.
- Use format strings or `${variable}` when punctuation immediately follows a variable.

### Suggested Fix
Use `("{0}: ..." -f $variable)` for labels.

### Metadata
- Reproducible: yes
- Related Files: none
- Pattern-Key: shell.powershell-interpolation
- Recurrence-Count: 1

---

## [ERR-20260821-002] orchestration-script-syntax

**Logged**: 2026-08-21T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
A read-only orchestration wrapper failed before executing because of malformed JavaScript syntax.

### Error
```text
SyntaxError: Unexpected identifier 'r'
```

### Context
- No nested command ran and no workspace files were changed.

### Suggested Fix
Use a direct `const result = await ...` wrapper and avoid compressed control-flow syntax in tool orchestration.

### Metadata
- Reproducible: no
- Related Files: none
- Pattern-Key: shell.orchestration-syntax
- Recurrence-Count: 1

---

## [ERR-20260821-003] windows-glob-syntax

**Logged**: 2026-08-21T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
An `rg` verification command failed because a Windows path argument contained an unexpanded wildcard.

### Error
```text
文件名、目录名或卷标语法不正确。
```

### Context
- The failed command was read-only and did not affect source files.

### Suggested Fix
Pass each design-document path explicitly instead of using a glob in a Windows argument.

### Metadata
- Reproducible: yes
- Related Files: wormhole-library-agent-claude-code-design.md, wormhole-library-agent-claude-code-design-zh.md
- Pattern-Key: shell.windows-glob-syntax
- Recurrence-Count: 1

---

## [ERR-20260828-001] git-stale-remote-ref

**Logged**: 2026-08-28T00:10:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
An explicitly supplied commit abbreviation was absent from local objects because the remote branch advanced after the last fetch.

### Error
```text
fatal: Needed a single revision
```

### Context
- Initial local lookup for `161476d` failed during teammate-submission acceptance.
- `git ls-remote origin` found the exact remote P05 head; a scoped `git fetch origin <full-sha>` made it available without changing local branches.

### Suggested Fix
When a user-provided SHA is not local, check remote refs with `git ls-remote` before treating the identifier as invalid.

### Metadata
- Reproducible: yes
- Related Files: .git/FETCH_HEAD
- Pattern-Key: vcs.stale-remote-ref
- Recurrence-Count: 1

---
