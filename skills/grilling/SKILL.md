---
name: grilling
description: 'Grill the user relentlessly, one question at a time. Use when a plan, design, or decision needs stress-testing to shared understanding, when the user says "grill me" or "interrogate this", or when another skill needs its interrogation engine.'
---

# Grilling

## Overview

The plugin's one-question-at-a-time interrogation engine. The agent walks the **design tree** — every open **branch** of a plan, design, or decision — grilling the user branch by branch until the tree is at zero and the user confirms shared understanding. Nothing is enacted before that confirmation.

**The user answers every question.** Where the agent believes it already knows the answer, that belief becomes the *recommended* answer, never the answer itself. An agent that supplies both sides has drafted, not grilled, and the confirmation at the end confirms nothing.

**Standing rule:** each recommended answer is a finding — keep it honest per `rr-workshop:defending-findings`: state the basis, or mark it an explicit hunch.

## The contract

The engine is generic: the caller owns the subject and the destination; this skill supplies only the discipline.

- **From the caller:** the subject to grill, and any **branch-ordering bias** — breadth-first across the whole space, or depth-first down one thread.
- **Back to the caller:** the **resolutions** — one entry per resolved branch, in resolution order, each carrying *question · answer · basis* — plus any branch still open if the user called a halt. Where they land is the caller's business (a resolution comment, a decisions index, an `answers` map); this skill guarantees the list.

## The steps

1. **Map the design tree.** List every open branch of the subject. A branch is a point where the user's choice would change what gets built — where both answers produce the same build, it is not a branch: fold it into the recommendation on a branch that is.
2. **Split facts from decisions.** A *fact* is anything the codebase, docs, or a command can answer — look it up directly. Questions are spent only on *decisions*, which belong to the user.
3. **Pick the next branch.** Choose one whose prerequisites are already resolved, so each answer stands on the last.
4. **Ask exactly one question, with a recommended answer. Stop.** The question, the recommendation, its basis (or its "hunch" label) — then end the message and wait for the reply. A wall of questions is bewildering, and the next question usually depends on this answer.
5. **Fold the answer back in.** Update the tree: the answer may close dependent branches, reopen settled ones, or grow new ones. Return to step 3 while any branch could still change what gets built — grill the tree to zero.
6. **Confirm shared understanding.** Play the tree back as an enumeration — every branch, by name, with the answer it resolved to — and ask the user to confirm *that list*. Shared understanding is declared by the user, never by the agent.

**If the user calls a halt** — "just decide", "that's enough", "go" — stop asking at once and go to step 6 early. The playback then has two parts: the branches that resolved, and the branches still open, each with the recommendation you would have put to the user. The user confirms or overrides that list. A halt stops the questioning; the open branches still go back to the caller as open.

## Red flags

| Red flag | Positive move |
|---|---|
| A drafted message holds two or more questions (numbered clusters, "also…", "a few things:") | Send the first; the tree holds the rest (step 4). |
| A question drafted with no recommended answer | Settle your own stance first, then ask it (step 4). |
| The next question drafted, or the reply predicted, before the user has replied | End the message at the question and wait (step 4). |
| An answer taken on the user's behalf — from context, a prior session, or "they'd obviously want X" | That belief is the recommendation; the user still answers it (Overview). |
| A question the codebase could answer ("is there an index on X?") | Look it up; fold the fact into the next recommendation (step 2). |
| A conclusion announced rather than asked ("the 3 things to nail down are…") | Put each one to the user as its own question (steps 1, 3). |
| A recommendation with no stated basis | Cite the basis, or label it a hunch (`rr-workshop:defending-findings`). |
| A branch whose two answers produce the same build | Fold it into the recommendation on a branch that changes something (step 1). |
| A playback that summarizes the decisions | Enumerate every branch with its answer; the user confirms that list (step 6). |
| Anything enacted while the confirmation message is still missing | Wait for it (step 6). |

## Done when

- [ ] Every question went out on its own, carrying a recommended answer with its basis or an explicit hunch label.
- [ ] Every lookupable fact was answered from the codebase, docs, or a command — questions went only to decisions.
- [ ] The step 6 playback listed every branch by name with its answer (any open branch shown as open, with its recommendation) — a list, not a summary — and the user confirmed *that* list.
- [ ] The resolutions went back to the caller in resolution order, each carrying question · answer · basis.
- [ ] Nothing was enacted before the user's confirmation message existed.
