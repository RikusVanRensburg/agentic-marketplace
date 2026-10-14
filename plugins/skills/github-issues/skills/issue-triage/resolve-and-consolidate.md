# Resolve and consolidate

Reached from [issue-triage](SKILL.md) step 4 with a survivor and a loser named.

The `issues` mod does the four actions and checks each one: it carries content over, cross-links
both issues, adds the `duplicate` label when the repo has one, and closes the loser as not
planned. This skill supplies the one part that takes judgment.

1. **Find what the loser adds.** Read the loser's body and comments
   (`gh issue view <loser> --comments`) and write down, as markdown, whatever the survivor does
   not already cover. Nothing new is a valid answer.
2. **Plan it.** Call `issue_consolidate` with the survivor, the loser and that carry-over text.
   It changes nothing on GitHub.
3. **Hand it to the user.** Tell them the plan and that `/issues consolidate` carries it out
   (the plan holds for an hour). End the turn: the mod refuses the command unless the user types
   it.

If the user reports a partial consolidation, the mod's message names which actions completed;
relay it as partial.

**Done when** the plan is made and the user has been told to run `/issues consolidate`.
