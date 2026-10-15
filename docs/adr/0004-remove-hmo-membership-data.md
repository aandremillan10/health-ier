---
status: accepted
---

# Remove HMO membership and dependent data

The proposed clinic-demo-v1.3 scope removes the membership and dependent-eligibility feature and deletes its membership, dependent-link, and revision tables through a forward migration. This is a deliberate destructive choice: keep the separately approved patient category and optional employee reference, and keep generic audit events, because neither is the HMO feature.
