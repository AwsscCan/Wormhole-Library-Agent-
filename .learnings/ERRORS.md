# Errors

Command failures and integration errors.

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
