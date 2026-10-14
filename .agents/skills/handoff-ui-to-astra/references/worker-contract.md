# UI worker contract

Extend the lead's JSON contract with explicit design inputs. Fill the example with actual task values; use empty arrays for genuinely absent inputs. Dispatch parameters select the model; repeating a model name inside the task message does not select it.

```json
{
  "task_id": "ui_surface",
  "target_agent": "ui_implementer",
  "objective": "Implement the requested UI in the assigned frontend surface.",
  "context": {
    "original_request": "The user's UI request and subsequent corrections, preserved accurately.",
    "workspace_root": "Absolute path of the assigned checkout.",
    "branch": "Actual current branch, if applicable.",
    "parent_branch": "Actual branch the worktree forked from, if applicable.",
    "target_surfaces": ["Actual route, screen, or component."],
    "existing_contracts": ["Relevant frontend interfaces and behavior to preserve."],
    "handoff_skill": "C:/Users/ajapa/.codex/skills/handoff-ui-to-astra/SKILL.md",
    "required_skills": [
      {"name": "design-taste-frontend", "path": "C:/Users/ajapa/.agents/skills/design-taste-frontend/SKILL.md"},
      {"name": "impeccable", "path": "C:/Users/ajapa/.agents/skills/impeccable/SKILL.md"},
      {"name": "emil-design-eng", "path": "C:/Users/ajapa/.agents/skills/emil-design-eng/SKILL.md"}
    ],
    "visual_references": [
      {
        "id": "reference_1",
        "source": "Actual absolute image path or accessible reference URL.",
        "role": "visual target",
        "user_instructions": "What the user wants preserved from this reference.",
        "priority": "Only a user-specified priority, otherwise unspecified."
      }
    ],
    "verification_commands": ["Actual project checks relevant to this change."],
    "interactive_qa": {
      "resource_confirmed": false,
      "resource_id": null,
      "authorized_scope": null
    }
  },
  "constraints": [
    "Read the handoff skill, all three design skills, and applicable repository context before editing. Load relevant supporting references.",
    "View every relevant image with an image-capable tool; do not substitute the parent summary or presume inherited attachments.",
    "Send the lead a readiness report before the first edit. If a required input is inaccessible, report the specific gap and stop dependent implementation.",
    "Edit only the assigned frontend files; report missing backend interfaces to the lead.",
    "Anchor visual choices to the user's brief and references; apply the skills within their stated scopes.",
    "Carry the complete reference manifest into revisions and report changed input access.",
    "Return evidence and any worktree integration decision to the lead; do not choose integration."
  ],
  "acceptance_criteria": [
    "Readiness report identifies the skills and supporting references read, images viewed, and the intended reference-based design direction.",
    "The changed UI matches the requested visual characteristics while preserving required product behavior.",
    "Relevant responsive layouts, interaction states, focus/keyboard behavior, and reduced motion work.",
    "Relevant checks pass or existing failures are distinguished with evidence.",
    "Return changed paths, visual evidence when available, correspondence to reference IDs, deviations, and outstanding verification gaps."
  ]
}
```

With the current collaboration tool, send the serialized filled contract as `message`:

```json
{
  "task_name": "ui_surface",
  "model": "gpt-6-astra",
  "reasoning_effort": "high",
  "fork_turns": "none",
  "message": "The complete filled worker contract as JSON text."
}
```

Check the live catalog before using this mapping. Do not dispatch while required input access is known to be unresolved. If access fails only inside the worker, resolve the gap before resuming affected implementation. An empty `visual_references` array is valid when the user supplied none.
