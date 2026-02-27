IMPORTANT: Complete ONE task per loop. After completion, exit the copilot CLI. NEVER work on a second task.

---

## Context — loaded every loop

These files form the deterministic stack that is loaded at the start of every iteration to ensure consistent context:

- **`.github/copilot-instructions.md`** — loaded automatically by Copilot. Contains architecture, conventions, and build/test instructions. This is the project's technical standard library.
- **`docs/knowledge.md`** — read via subagent at the start of each loop. Contains accumulated gotchas, failure modes, and learnings from prior loops.
- **`docs/alloy-csharp-guide.md`** — consult via subagent when implementing components. Reference for Alloy C# framework patterns (refkeys, `code` templates, `<For>`, naming policies, etc.).

---

## Phase 1: ORIENT — Pick the next task

Use a subagent to read the last entry in `progress.txt` for context on what was done last.

List pending tasks:

```bash
python3 -c "
import json
with open('docs/prd.json') as f:
    prd = json.load(f)
pending = [t for phase in prd['phases'] for t in phase.get('tasks', []) if t['status'] == 'pending']
for t in pending:
    deps = ', '.join(t.get('dependencies', []))
    print(f'[{t[\"id\"]}] {t[\"title\"]} | phase={t.get(\"phase\", \"\")} | deps=[{deps}]')
print(f'\n{len(pending)} tasks pending')
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

## Phase 5: VALIDATE — Back pressure

Build, test, and lint form the **back pressure** that rejects bad code generation. The faster this wheel turns, the better the outcomes.

Run validation with a **single subagent** (do not fan out builds/tests to multiple subagents — it causes backpressure):

```bash
pnpm build && pnpm test
```

- **`pnpm build`** — TypeScript type system catches structural errors before runtime.
- **`pnpm test`** — vitest assertions verify the emitted C# matches expected output. This is the primary correctness gate.
- **`pnpm lint`** — ESLint catches code quality regressions. Run when making style-sensitive changes.

If tests unrelated to your work fail, it is **your job** to resolve them as part of this increment of change. **IMPORTANT**: You should think hard when investigating these failures — it is not acceptable to just update the test expectations to make it pass without being 100% certain that it is the correct thing to do

---

## Phase 6: RECORD — Document and commit

1. Update `prd.json` — mark your task as done:

```bash
python3 -c "
import json
TASK_ID = 'REPLACE_ME'
with open('docs/prd.json') as f:
    prd = json.load(f)
for phase in prd['phases']:
    for t in phase.get('tasks', []):
        if t['id'] == TASK_ID:
            t['status'] = 'done'
            break
with open('docs/prd.json', 'w') as f:
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

99999999\. When you learn something new about how to build, test, or debug this project — or discover a pattern that works well — update `.github/copilot-instructions.md` via a subagent. Keep updates brief and actionable.
