IMPORTANT: Complete ONE task per loop. After completion, exit the copilot CLI. NEVER work on a second task.

---

## Phase 1: ORIENT — Pick the next task

Use a subagent to read the last entry in `progress.txt` for context on what was done last.

List pending tasks:
```bash
python3 -c "
import json
with open('prd.json') as f:
    tasks = json.load(f)['tasks']
pending = [t for t in tasks if t['status'] == 'not-started']
for t in pending:
    pri = t.get('priority', '')
    deps = ', '.join(t.get('dependencies', []))
    print(f'[{t[\"id\"]}] {t[\"title\"]} | {t[\"category\"]} | pri={pri} | deps=[{deps}]')
print(f'\n{len(pending)} tasks not-started')
"
```

Choose the highest-priority task. **You decide** what has the highest priority — not necessarily the first item. If a task should be split into multiple tasks, split it, update `docs/prd.json`, and exit (that counts as your one task).

---

## Phase 2: STUDY — Research before coding

Use up to 500 parallel subagents to study the codebase. **Do NOT assume something is not implemented** — always search first using subagents. Think hard.

1. Search the codebase for existing implementations related to your task.
2. Study how the functionality is implemented in the legacy emitter (`submodules/typespec/packages/http-client-csharp`).
3. If the task is already done, mark it as done in `docs/prd.json` and exit.
4. Consult `docs/knowledge.md` via a subagent for known gotchas related to your task.

---

## Phase 3: DESIGN — Evaluate approaches before coding

Before writing any code, do a design review using subagents:

1. Identify at least **2 viable approaches** for implementing the task.
2. For each approach, evaluate against these criteria (in priority order):
   - **Output consistency with the legacy emitter** — the generated code must match the legacy emitter's public API surface. This is the top priority.
   - **Idiomatic Alloy** — follows patterns from `submodules/flight-instructor/src/csharp` and `docs/alloy-csharp-guide.md` (refkeys, `code` templates, `<For>`, no string concatenation, no manual imports).
   - **Completeness** — covers all edge cases visible in the legacy implementation.
   - **Simplicity** — fewer moving parts, less indirection, easier for future loops to understand.
3. Choose the approach that best satisfies the criteria above. Record your decision in `knowledge.md` under a `## Design Decisions` section (approach chosen, why, and what was rejected) so future loops don't revisit the same question.

---

## Phase 4: IMPLEMENT — Write code and tests

1. Every component must have a unit test.
2. Every function must have JSDoc explaining what it does and why.
3. Every test must document **why it is important and what it validates** — future loops will not have your reasoning context. Capture this in docstrings/comments on the test.
4. You may add temporary logging if needed to debug issues.

---

## Phase 5: VALIDATE — Build and test

Run validation with a **single subagent** (do not fan out builds/tests to multiple subagents — it causes backpressure):

```bash
pnpm build && pnpm test
```

If tests unrelated to your work fail, it is **your job** to resolve them as part of this increment of change. **IMORTANT**: You should think hard when investigating these failure, it is not acceptable to just update the test expectations to make it pass without being 100% certain that it is the correct thing to do

---

## Phase 6: RECORD — Document and commit

1. Update `prd.json` — mark your task as done:
```bash
python3 -c "
import json
TASK_ID = 'REPLACE_ME'
with open('prd.json') as f:
    prd = json.load(f)
for t in prd['tasks']:
    if t['id'] == TASK_ID:
        t['status'] = 'done'
        break
with open('prd.json', 'w') as f:
    json.dump(prd, f, indent=2)
print(f'Marked {TASK_ID} as done')
"
```
2. Append your progress to `docs/progress.txt` — leave a note for the next iteration describing what was done, patterns used, and anything the next person should know.
3. If you discovered a failure mode, gotcha, or learning, record it in `docs/knowledge.md`.
4. If `docs/progress.txt` or `docs/knowledge.md` are becoming very large (>200 entries), use a subagent to summarize old entries and keep only the last 20 detailed entries.
5. `git add -A && git commit` with a descriptive message.

---

## Phase 7: EXIT

Exit the copilot CLI. If the PRD is complete (no remaining not-started tasks), output `<promise>COMPLETED</promise>` before exiting.

---

## Critical Rules (NEVER violate)

999\. NEVER MAKE CHANGES IN `submodules/`.

9999\. DO NOT IMPLEMENT PLACEHOLDER, STUB, OR MINIMAL IMPLEMENTATIONS. Write full, complete implementations. If you can't fully implement something, document what's missing in `knowledge.md` and move on.

99999\. Use up to 500 parallel subagents for exploring, studying, or searching code. Use only **1 subagent** for build and test operations.

999999\. If you are stuck on a task (e.g., blocked by a missing dependency, unclear spec, or repeated failures), document the blocker in `knowledge.md`, mark the task as blocked in `prd.json` with a reason, and exit. Do not loop forever.

9999999\. Generated output must NEVER contain `<Unresolved Symbol: refkey[...]>`. If you see this in test output, your change is broken — fix it before committing.
