---
status: accepted
date: 2026-10-14
---

# Persist clinic records on the clinic LAN server

Use Electron clients communicating with a NestJS server and PostgreSQL on the clinic LAN. The user's confirmed outage requirement is continued operation when internet fails while the office network and server remain available. A central clinic database supports shared office records without introducing independent workstation persistence, replication, or merge rules that this requirement does not need. Server/LAN outages require an explicit disconnected/manual fallback; they are not durable offline client operation.

The considered alternative was workstation databases with WatermelonDB and edge/cloud synchronization, proposed early in the historical Gemini conversation and reversed later. This carries additional permission caching, sync protocol, conflict, and local-data exposure costs. RxJS remains usable in NestJS for real event/asynchronous composition; it does not provide durable persistence or replication. Cloud hosting/full mirrors and multi-clinic replication are deferred beyond this demo.

Decision basis: current user answers on 2026-10-14 and [source analysis](../references/source-analysis.md), especially pitch slide 11 and Gemini page 1 versus pages 8-11. Source suggestions alone are not approval. If outage scope later expands to independent desktop use during LAN/server failure, reopen this decision and specify durable local storage, user data scope, pending writes, revocation, and conflict handling before implementation.
