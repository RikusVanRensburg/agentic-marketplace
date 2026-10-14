# Prompt Master (Flow / Claude edition)

A Claude skill that writes accurate prompts for **Claude** and **Claude Code**. Zero tokens or credits wasted. Full context and memory retention. No re-prompting your way to an answer you should have gotten on attempt one.

> Forked from [nidhinjs/prompt-master](https://github.com/nidhinjs/prompt-master) and trimmed to the only two targets Flow actually uses: Claude (chat / API) and Claude Code.

---

## What changed in this fork

The upstream skill covers 30+ AI tools (Cursor, Midjourney, ComfyUI, Sora, etc.). This version is cut down for Flow's day-to-day reality:

- **Tools removed:** ChatGPT, Gemini, o3, Qwen, Ollama, Llama/Mistral, DeepSeek, MiniMax, Cursor/Windsurf/Cline/Copilot, Antigravity, Bolt/v0/Lovable, Devin/SWE-agent, Perplexity/Manus, browser agents, all image/video/3D/voice generators, ComfyUI, Zapier/Make/n8n.
- **Templates removed:** G (File-Scope for IDE AI), I (Visual Descriptor), J (Reference Image Editing), K (ComfyUI).
- **Patterns removed:** image-AI negative prompts, Midjourney prose, IDE-AI template mismatch (Cursor).
- **Kept:** all Claude-relevant routing, templates A/B/C/D/E/F/H/L/M, and patterns covering task / context / format / scope / reasoning / agentic failure modes.

If you ever need the full multi-tool version, pull from upstream.

---

## Usage

Invoke naturally:

```
Write me a prompt for Claude Code to refactor my auth module
```

```
I need a prompt for Claude Code to migrate this Blazor page to React — ask me what you need to know
```

```
Here's a bad prompt I wrote for Claude, fix it: [paste prompt]
```

```
Break this prompt down and simplify it
```

Or explicitly:

```
/prompt-master

I want to ask Claude Code to build a sidebar component for Timebase
```

---

## How it works

1. **Detect the target** — Claude or Claude Code. Ask once if ambiguous.
2. **Extract 9 dimensions of intent** — task, target, output, constraints, input, context, audience, success criteria, examples.
3. **Ask targeted clarifying questions** — max 3 if critical info is missing.
4. **Pick the right template** — silently, from the 9 kept (RTF / CO-STAR / RISEN / CRISPE / CoT / Few-Shot / ReAct+Stop / Decompiler / Opus 4.7 Task Brief).
5. **Apply safe techniques only** — role assignment, few-shot, XML structure, grounding anchors, memory block.
6. **Token efficiency audit** — strip every word that doesn't change the output.
7. **Deliver** — one clean copyable block with a one-line strategy note.

---

## Targets covered

| Target | What Prompt Master Fixes |
|--------|--------------------------|
| **Claude** (claude.ai, Claude API, Claude 4.x) | Removes padding, adds XML structure, specifies length, removes CoT from extended thinking, front-loads Opus 4.7 context |
| **Claude Code** | Stop conditions, file scope, checkpoint output, session strategy, forbidden actions, human review triggers |

---

## Templates (auto-selected)

| Template | Best For |
|----------|----------|
| **RTF** (Role, Task, Format) | Fast one-shot tasks |
| **CO-STAR** (Context, Objective, Style, Tone, Audience, Response) | Professional documents, reports, business writing |
| **RISEN** (Role, Instructions, Steps, End Goal, Narrowing) | Complex multi-step projects |
| **CRISPE** (Capacity, Role, Insight, Statement, Personality, Experiment) | Creative work, brand voice, iterative content |
| **Chain of Thought** | Math, logic, debugging, multi-step analysis (standard Claude only) |
| **Few-Shot** | Consistent structured output, pattern replication |
| **ReAct + Stop Conditions** | Claude Code — any autonomous agentic task |
| **Prompt Decompiler** | Breaking down, simplifying, or splitting existing prompts |
| **Opus 4.7 Task Brief** | Complex / multi-step / agentic work on Claude Opus 4.7 |

---

## Safe techniques (applied when needed)

Methods known to produce hallucinations or unpredictable output (Tree of Thought, Graph of Thought, Universal Self-Consistency, prompt chaining) are explicitly excluded.

| Technique | What it does |
|-----------|--------------|
| **Role Assignment** | Assigns a specific expert identity to calibrate depth and vocabulary |
| **Few-Shot Examples** | Adds 2-5 examples when format consistency matters more than instructions |
| **XML Structural Tags** | Wraps sections in XML — Claude parses XML reliably |
| **Grounding Anchors** | Adds anti-hallucination rules for factual and citation tasks |
| **Chain of Thought** | Forces step-by-step reasoning for logic tasks — never applied to Claude extended thinking |

---

## 34 patterns detected

Patterns are grouped into Task (7), Context (6), Format (4), Scope (5), Reasoning (5), and Agentic (7). See [references/patterns.md](references/patterns.md) for the full reference with before/after examples.

---

## Memory Block system

When your conversation has history, Prompt Master pulls out prior decisions and prepends a Memory Block so the AI never contradicts earlier work:

```
## Memory (Carry Forward from Previous Context)
- Stack: React 18 + TypeScript + Vite + Base UI + Tailwind v4
- Brand tokens: --tb-* (no hardcoded hex)
- Component naming: PascalCase, no default exports
- Architecture: no Redux, context API only
```

This is the single biggest fix for long sessions. Most wasted re-prompts come from the AI forgetting what you already decided.

---

## Version history

- **1.7.0 (Flow fork)** — Trimmed to Claude / Claude Code only. Removed 25+ tool sections, 4 templates (G/I/J/K), and 3 image/IDE-specific patterns. Renumbered patterns.
- **1.6.0** — Opus 4.7 update. Added Template M (Opus 4.7 Task Brief). Updated Claude and Claude Code routing for literalism, adaptive thinking, xhigh effort, and session hygiene.
- **1.5.0** — Added more tool routing. New Agentic AI and 3D Model AI routing added. Removed token estimate from output.
- **1.4.0** — Added reference image editing detection, ComfyUI support, Prompt Decompiler mode.
- **1.3.0** — Rebuilt around PAC2026 positional structure (30/55/15). Silent routing replaces user-facing framework selection. References folder introduced.
- **1.2.0** — Restructured for attention architecture. Removed fabrication-prone techniques (ToT, GoT, USC, prompt chaining).
- **1.1.0** — Expanded tool coverage, added memory block system, 35 credit-killing patterns.
- **1.0.0** — Initial release.

---

## License

MIT: See [LICENSE](LICENSE) for details.
