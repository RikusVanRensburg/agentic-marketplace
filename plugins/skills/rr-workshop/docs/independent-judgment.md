# Dispatching an independent judgment

Every stage in this plugin that produces a **verdict** — per-slice QA, an end-of-run review, a
final review of the integrated whole — is dispatched the same way: a fresh sub-agent that forms its
own picture from the source of truth. This is that shared mandate. Each caller names its own scope
and its own verdict consumer; everything below holds for all of them.

## What the dispatch carries

- **Read-fresh instructions, aimed at the tracker.** For a **single slice**: the issue's body + *all*
  its comments + its acceptance criteria, the parent's body + *all* its comments, and the sibling
  slices' acceptance criteria — the siblings are how overlap and contradiction get caught. For the
  **integrated whole**: the parent's body + *all* its comments, and the acceptance criteria of every
  slice that landed.
- **Where to look.** The branch, worktree path, or commit range under judgment, named absolutely,
  plus the instruction that every command runs there.
- **The mandate.** Build from a **clean** state, run the **full** suite, and check each acceptance
  criterion against the parent's intent. A judgment of the integrated whole also covers the
  interactions *between* slices, which per-slice review structurally cannot see.
- **The verdict shape.** PASS, or a specific list of defects. A rejection without defects is not a
  verdict anyone can act on, so the prompt demands them and the caller substitutes an actionable
  fallback if they come back missing anyway.

## What the dispatch never carries

The dispatcher's transcript, the implementer's report, its diff narration, its self-assessment, or
any summary of how the work went.

**A judge that has read the implementer's account grades the account.** Told "this satisfies
criterion 3", it goes looking for confirmation, and a criterion that was quietly missed reads as met
— the failure this whole stage exists to catch is exactly the one the implementer could not see in
its own work. Withholding the account is not distrust of the implementer; it is the only thing that
makes the second opinion second.

Work that never landed is the one exception worth naming explicitly: tell the judge which slices are
absent and that they are **out of scope**. Otherwise a partially-blocked run fails its own review for
missing functionality nobody claimed to have built, and remediation starts implementing whole slices
out-of-band.

## Inline it — paths do not resolve

A fresh sub-agent cannot resolve this file's path, or any relative path from the skill that dispatched
it. So every caller **inlines** this mandate into the prompt rather than pointing at it. A prompt that
cites a path gives the judge nothing.
