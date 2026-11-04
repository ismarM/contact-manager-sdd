# Token report – Ismar

Token usage per AI session run by Ismar. One row per session (each row has a matching *Seja N* section in
[ismar.md](ismar.md)); subagent sessions are listed under the session that started them and are included in its total.

**Sources**

- Exact numbers from the local session logs (`~/.claude/projects/<project>/<session>.jsonl`, subagents in `<session>/subagents/agent-*.jsonl`). Each API response is counted once (the log stores some responses several times under the same message ID).

**Columns**

- **Messages:** user messages / assistant API responses (one response per model call; a turn with tool calls has several).
- **Input tokens:** uncached input. **Cache creation / cache read:** input written to or read from the prompt cache. Cache reads are counted in usage but are much cheaper than uncached input.
- **Output tokens:** everything the model generated, including thinking; **thinking** is also shown separately.
- **Total** = input + cache creation + cache read + output.

## Sessions

| # | Session | Tool | Model | Messages (user / responses) | Tool calls | Input tokens | Output tokens (thinking) | Cache creation input tokens | Cache read input tokens | Total tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | *‹kratek opis seje› (`‹prvih 8 znakov ID seje›`) – **main session*** | | | | | | | | | |
| 1a | *└ subagent: ‹opis›* | | | | | | | | | |
| | **Session 1 total (main + subagents)** | | | | | | | | | |
| | **Total – Ismar** | | | | | | | | | |

Session notes: *‹sporočila, ki jih dnevnik ne hrani (odgovori v dialogih, ukazi), samodejno zgoščanje konteksta, delno štetje zadnjega obrata›*
