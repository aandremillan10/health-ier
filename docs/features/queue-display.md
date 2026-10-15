# Clinic TV queue display

## Authorization and scope

On 2026-10-15 (Asia/Manila), the user explicitly requested an edge-server home page for a TV on the same Wi-Fi and confirmed: “Number each appointment per department for the day; show that number to staff and on TV.” This authorizes the queue-number persistence, staff display, and public numbers-only TV page described here. It does not add patient information to public routes or make authenticated staff APIs public.

The user subsequently requested local prerecorded queue announcements and accepted offline English speech for the first version. Announcements contain only queue tickets and destination departments; no patient names or cloud speech service are involved.

## Numbering and staff behavior

Scheduling allocates a positive integer per configured clinic, discipline, and **scheduled Manila calendar day**. The displayed ticket is `M001`, `D001`, or `L001` for medical, dental, or laboratory; values above 999 remain complete, for example `M1001`. Allocation follows scheduling creation order, independently of appointment-time sorting. Scheduled appointments already receive their number, so the TV may show gaps when some patients have not arrived.

Numbers are stored on appointments. Status transitions and corrections preserve them. Day/discipline/clinic are not editable through the appointment API. There is no appointment deletion route. A PostgreSQL transaction advisory lock serializes allocation in each clinic/day/discipline; a unique index and positive-number/day-match constraints protect persisted identities. An uncommitted allocation rolls back with its appointment and audit record.

Existing appointments receive deterministic numbers during migration, partitioned by clinic, discipline, and the stored UTC scheduled timestamp converted to Manila (+08:00), ordered by `createdAt` then `id`. Deploy the migration during a planned server update because it locks/backfills the appointment table. Backfilled numbers are assigned once; they are not recalculated on reads.

Authenticated appointment create/list/transition/correction responses now include `queueNumber: number`. The internal `queueDay` is omitted. Existing authentication, permissions, audit/history, revisions, and draft guards remain in force. The desktop IPC guard requires a positive PostgreSQL-sized integer; it does not accept a missing field or silently invent a number. The explicit synthetic demo adapter follows the same numbering rules in memory.

## Public contract

These read-only routes exist only on `SERVER_MODE=EDGE`. CLOUD responds 404 before queue or database access. Static files use fixed paths relative to the compiled server, without a wildcard file server. Responses use `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, frame denial, and a same-origin content security policy including `media-src 'self'`. Assets require no external service, font, script, stylesheet, or staff session.

| Route                                 | Response                           |
| ------------------------------------- | ---------------------------------- |
| `GET /`                               | TV HTML home page                  |
| `GET /queue-display/display.css`      | Same-origin stylesheet             |
| `GET /queue-display/display.js`       | Same-origin polling script         |
| `GET /queue-display/data`             | Numbers-only JSON                  |
| `GET /queue-display/announcements.js` | Same-origin announcement module    |
| `GET /queue-display/audio/en/:clip`   | One fixed prerecorded PCM WAV clip |

The data route accepts **no query parameters**. The server selects the configured clinic and current Manila day, with an `updatedAt` timestamp generated for that fetch. It reads only discipline, status, and persisted number, without joining patient or staff tables. It never returns patient IDs/names, dates of birth, appointment IDs, history, clinical details, or staff information.

```json
{
  "date": "2026-10-15",
  "updatedAt": "2026-10-15T01:00:00.000Z",
  "departments": [
    { "discipline": "medical", "serving": ["M001"], "waiting": ["M002"] },
    { "discipline": "dental", "serving": [], "waiting": [] },
    {
      "discipline": "laboratory",
      "serving": ["L001", "M003"],
      "waiting": ["L002"]
    }
  ]
}
```

Medical/dental “serving” includes every appointment in `with_provider`, allowing simultaneous providers. Laboratory “serving” includes every appointment in `lab`, preserving its original department prefix even for medical/dental handoffs. Waiting lists contain `arrived` and `waiting` appointments in their original discipline, ordered by queue number. Serving lists also follow number order, with a discipline tie-breaker for lab handoffs. Scheduled, completed, and no-show appointments, other clinic sites, and prior/future Manila days are excluded. At Manila midnight, the next fetch switches days; an empty queue stays empty rather than showing yesterday's tickets. Database faults use the existing safe 503 error body.

## Use on the clinic LAN

For a direct local development server, run the migrated EDGE server on its normal port (default 3000). Replace `192.168.1.50` below with the server's actual LAN address; `localhost` on a TV refers to the TV itself. On Windows PowerShell use `curl.exe` if `curl` is an alias:

```sh
curl -i http://192.168.1.50:3000/
curl -i http://192.168.1.50:3000/queue-display/display.css
curl -i http://192.168.1.50:3000/queue-display/display.js
curl -i http://192.168.1.50:3000/queue-display/data
curl -i http://192.168.1.50:3000/queue-display/announcements.js
curl -D - -o now-serving.wav http://192.168.1.50:3000/queue-display/audio/en/now-serving.wav
```

Open `http://192.168.1.50:3000/` in the TV browser, then use the browser's fullscreen mode if available. The TV and server need network reachability; Wi-Fi client isolation can prevent same-network devices from connecting. This change does not alter host firewall rules, router settings, or deployment configuration.

For the existing laptop HTTPS/Caddy deployment, open the configured clinic HTTPS origin without `:3000`; its same-origin routes are proxied to the EDGE server. The TV must trust that origin's certificate authority and the certificate must match the address/hostname used. Some TV browsers cannot install a private CA; verify trust on the actual TV before adopting that HTTPS address. Do not bypass certificate validation in the polling client. Use the deployment's configured LAN/TLS setup rather than exposing the clinic server to the internet.

Example authenticated staff usage (replace IDs/date and provide an existing staff token using your normal secure workflow):

```sh
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"patientId":"20000000-0000-4000-8000-000000000001","discipline":"medical","scheduledAt":"2026-10-15T08:00:00+08:00"}' \
  http://192.168.1.50:3000/appointments
curl -H "Authorization: Bearer $TOKEN" \
  'http://192.168.1.50:3000/appointments?date=2026-10-15'
```

## Rollout and verification

Apply the new Prisma migration **before starting the updated server**, then deploy the matching updated desktop build so staff can read and display `queueNumber`. This is a coordinated desktop/edge rollout: older desktop response guards reject the new field, and the updated desktop rejects responses without it. No backward-compatibility promise is made. The Nest build copies the static page, stylesheet, scripts, and audio library into `dist/queue-display/public`; the existing Docker build runs that same server build. Windows speech support is needed only when deliberately regenerating the shipped clips, not on the deployed server or TV.

Backend acceptance covers persisted per-day/department numbers, stable status/correction identity, concurrent allocation, deterministic migration, privacy projection, current-day/site filtering, CLOUD denial, safe errors, authentication preservation, and source/production static serving. Frontend acceptance covers the same ticket next to the staff appointment and readable medical/dental/laboratory TV queues, with stale/disconnected and empty states. Integration checks must verify a scheduled ticket remains identical after staff arrival/waiting/provider/lab transitions and appears only in the corresponding public queue.

Automated HTTP tests exercise the Nest routes with a scoped in-memory database double. `QUEUE_TEST_DATABASE_URL` enables real PostgreSQL allocation/constraint tests, limited to an explicitly supplied disposable loopback `healthier_queue_test_*` database with migrations already applied. No clinic database or staff credentials are used by those tests. Actual TV rendering, Wi-Fi reachability, and certificate trust remain deployment/device checks.

## Offline English announcements

On the TV, select **Enable announcements** once to allow browser audio under the TV browser's autoplay policy. The audio plays on the TV through its browser, using only the local files served by the clinic EDGE server. Installing a Node speaker package such as `say` would speak on the server computer; it is not needed for this browser playback design. There is no runtime TTS endpoint or arbitrary text input.

An announcement is triggered by a newly serving ticket in the current data, not by a newly booked appointment or the highest queue number. The initial load establishes a baseline without speaking. Reconnection and a change of clinic day also establish a fresh baseline, so stale tickets are not read aloud. The visual queue remains available when announcements are disabled or audio cannot start.

Ticket digits are read individually, including leading zeroes. `M001` entering Medical is composed from `now-serving.wav`, `letter-m.wav`, `digit-0.wav`, `digit-0.wav`, `digit-1.wav`, and `medical.wav`: “Now serving M zero zero one. Please proceed to Medical.” The same medical ticket entering the laboratory keeps the letter M and uses `laboratory.wav` for its destination. Numbers above 999 retain all their digits.

The exact allowlist consists of 17 files: `now-serving.wav`; `letter-m.wav`, `letter-d.wav`, `letter-l.wav`; `digit-0.wav` through `digit-9.wav`; and `medical.wav`, `dental.wav`, `laboratory.wav`. Requests for other filenames or paths receive a safe 404 JSON response without filesystem enumeration. All clips can be fetched without a staff session on EDGE and are unavailable on CLOUD.

The shipped library was synthesized offline with the installed **Microsoft Zira Desktop**, **en-US**, at normal rate (`0`) and volume `100`. The format is uncompressed mono PCM, 16 kHz, 16-bit. The fixed vocabulary, voice/engine provenance, byte counts, and SHA-256 hashes are in `server/src/queue-display/voice-manifest.json`; that manifest is not exposed as a public route. Format/hash and non-silence checks validate the generated data; they do not establish human pronunciation review or suitability on a particular TV speaker. Hiligaynon speech is not supplied or claimed; it would require a separately provided and approved voice library.

To regenerate on Windows with that installed English SAPI voice, run from the repository root:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\server\scripts\generate-queue-voice.ps1
```

Use Windows PowerShell 5.1 (`powershell.exe`), not PowerShell 7 (`pwsh`). The script resolves its fixed output paths from its own location, overwrites only the fixed clips and provenance manifest, and directs synthesis to WAV files without speaker playback. It accepts no patient data or text arguments. Review generated assets/provenance and rerun the audio/HTTP checks before shipping a regenerated library:

```sh
pnpm --filter server exec vitest run --config vitest.config.mts src/queue-display/queue-voice.spec.ts
pnpm --filter server exec vitest run --config vitest.e2e.config.mts test/queue-display.e2e-spec.ts
pnpm --filter server build
```
