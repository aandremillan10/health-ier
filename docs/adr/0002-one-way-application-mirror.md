---
status: accepted
date: 2026-10-14
---

# Keep edge authoritative and mirror allowed records outbound

The user requires one-way edge-to-cloud mirroring for October 16, edge writes and cloud read-only. Use one NestJS codebase in EDGE/CLOUD modes, separate PostgreSQL databases and outbound authenticated HTTPS application events. Edge atomically persists domain data plus immutable versioned outbox events; cloud atomically persists allowed versions plus idempotency receipts. Select exact unacknowledged committed events, protect revisions/references, bootstrap consistently and acknowledge exact IDs/versions only after cloud commit. Staff cloud writes stay denied; credentials/sessions/secrets are not mirrored.

Native PostgreSQL logical replication was considered, but office NAT/firewall reachability and publication/schema/auth scope make application-whitelisted outbound delivery the smaller fit. The protocol adds durable retry/idempotency/bootstrap work and must prove reordered commits, in-flight edits and stale/reference conflicts. Cloud success never gates local clinic work; a secondary copy is not production backup/retention proof. Bidirectional editing and independent workstation databases remain separate scope.

See [clinic-demo-v1.1](../specs/mirror-amendment.md) for invariants and direct-user authority. This supersedes only ADR-0001's cloud-deferral sentence, retaining LAN-primary/no-workstation-database choices. Reviewed PostgreSQL primary references: [transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html), [logical replication](https://www.postgresql.org/docs/17/logical-replication.html), [subscriptions](https://www.postgresql.org/docs/17/logical-replication-subscription.html), [restrictions](https://www.postgresql.org/docs/17/logical-replication-restrictions.html), [ON CONFLICT](https://www.postgresql.org/docs/17/sql-insert.html).
