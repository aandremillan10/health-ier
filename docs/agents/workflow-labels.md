# Workflow labels

Use these exact GitHub label strings. They are the user's workflow states, not a mapping to five triage roles.

| Label         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `todo`        | Approved work ready to be picked up after its dependencies are met. |
| `in progress` | An owner is actively implementing the issue.                        |
| `in review`   | Implementation and relevant checks are ready for review.            |
| `done`        | Acceptance criteria are met and the completed result is accepted.   |

Keep one current workflow label on an issue. Replace the previous workflow label when moving states. Issue closure, PR merge requirements, and reviewer identities remain pending team conventions; this file does not approve them.

The requested setup does not add `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, or wayfinder labels. Destination and clinic-demo-v1 publication are approved; ensure the four selected labels exist without deleting unrelated repository labels. New approved issues start with only `todo`.
