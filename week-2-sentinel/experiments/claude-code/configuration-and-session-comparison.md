# Claude Code Configuration and Session Comparison

## Configuration inspection

I started Claude Code version `2.1.245` from the `week-2-sentinel` project directory.

I used `/status` and observed these setting sources:

- User settings
- Shared project settings

This confirmed that Claude Code discovered `.claude/settings.json`.

I used `/context` and observed one memory file using approximately 1.3k tokens. This confirmed that the project's `CLAUDE.md` was loaded into the session context.

I used `/permissions` and observed the project rules:

### Allowed without an additional prompt

- `Bash(npm run build)`
- `Bash(npm run validate:json -- *)`

### Denied

- `Read(./.env)`

During my initial `/verify-sentinel` attempt, Claude added a file-existence loop and command chaining that were not covered by the allowed rules, so Claude Code requested approval. I narrowed the command instructions to require the exact approved commands without wrappers, chaining, redirection, or extra checks.

After restarting Claude Code, I ran `/verify-sentinel` without repeated approval prompts. The TypeScript build succeeded, and all seven recorded incident-analysis files passed schema validation. The command did not start Sentinel, make an API request, expose an environment variable, change a project file, or create a Git commit.

## Clean versus continued session experiment

I provided the following conversation-only marker in a Claude Code session:

`SENTINEL-104`

I explicitly instructed Claude not to save the marker to automatic memory.

### Continued session

I exited the session and reopened it with:

```powershell
claude --continue
```

When I asked for the conversation-only marker, Claude returned `SENTINEL-104`. I concluded that a continued session restores earlier conversation history.

### Clean session

I exited the continued session and opened a new session with:

```powershell
claude
```

When I asked for the marker, Claude reported that the new conversation contained no definition for it. Claude also searched the repository and found no matching value. I concluded that a clean session did not receive the previous session's conversation history.

### Comparison

| Context source | Clean session | Continued session |
| --- | --- | --- |
| Project `CLAUDE.md` | Loaded | Loaded |
| Shared project settings | Loaded | Loaded |
| Previous conversation messages | Not loaded | Loaded |
| `SENTINEL-104` marker | Unknown | Remembered |

I learned that session continuation is different from Sentinel prompt caching. Session continuation restores a Claude Code conversation. Prompt caching reuses computation for a matching prompt prefix and does not give the model memory of a different application request.

## Guidance versus enforcement

`CLAUDE.md` provides project context and behavioral instructions to the model. The model interprets those instructions, so the file is guidance rather than a guaranteed security control.

Claude Code permission rules are evaluated by the application before covered tool calls run. For example, `Read(./.env)` blocks the Claude Code `Read` tool from accessing that file. This rule is narrower than an operating-system security boundary: it does not claim to prevent every program or separately approved shell command from accessing the file.
