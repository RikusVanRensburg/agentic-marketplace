---
name: grilling
description: 'Grill the user relentlessly, one question at a time, each question carrying a recommended answer. Use when a plan, design, or decision needs stress-testing to shared understanding, when the user says "grill me" or "interrogate this", or when another skill (wayfinder, orchestrated-run) needs its interrogation engine.'
---

# Grilling

## Overview

The plugin's one-question-at-a-time interrogation engine. The agent grills the user relentlessly about every aspect of a plan, design, or decision, walking each branch of the design tree and resolving dependencies between decisions one by one, until the user explicitly confirms shared understanding. Nothing is enacted before that confirmation.

The engine is generic: callers (`wayfinder`, `orchestrated-run`) supply the subject and any branch-ordering bias; this skill supplies only the discipline.

**Standing rule:** each recommended answer is a finding — keep it honest per `rr-workshop:defending-findings`: state the basis, or mark it an explicit hunch.

## The steps

1. **Map the design tree.** List every open branch of the subject — each point where a choice could change what gets built.
2. **Split facts from decisions.** A *fact* is anything the codebase, docs, or a command can answer — look those up directly and never spend a question on one. A *decision* belongs to the user — every one of those gets asked.
3. **Pick the next branch.** Choose a branch whose prerequisites are already resolved, so each answer stands on the last.
4. **Ask exactly one question, with a recommended answer. Stop.** One question per message: the question, the recommendation, its basis (or its "hunch" label). End the message there and wait for the user's reply — a wall of questions is bewildering, and the next question usually depends on this answer.
5. **Fold the answer back in.** Update the tree: the answer may close dependent branches, reopen settled ones, or grow new ones. Return to step 3 while any branch is open.
6. **Confirm shared understanding.** When no branch remains open, play the resolved understanding back and ask the user to confirm it. Shared understanding is declared by the user, never by the agent.

**Done when:** every open branch has been visited; every question was asked singly, with a recommended answer; every lookupable fact was answered from the codebase rather than asked; and the user's explicit confirmation message exists. Only after that confirmation may anything be enacted.

## Red flags

| Red flag | Positive move |
|---|---|
| A drafted message holds two or more questions (numbered clusters, "also…", "a few things:") | Send the first question only; the tree holds the rest. |
| A question with no recommended answer | Form the recommendation first — a question without a stance makes the user do the agent's thinking. |
| Proceeding past a question — answering it yourself, or asking the next — before the user replies | End the message at the question and wait. |
| Asking a fact the codebase can answer ("is there an index on X?") | Look it up; fold the fact into the next question's recommendation. |
| Declaring conclusions unilaterally ("the 3 things to nail down are…") | Put each one to the user as its own question; confirmation comes from the user. |
| Recommending an answer with no stated basis | Defend it per `rr-workshop:defending-findings`, or label it an explicit hunch. |
| Enacting anything before the confirmation message exists | Ask for explicit confirmation of shared understanding first. |
