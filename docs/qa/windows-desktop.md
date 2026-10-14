# Windows desktop export

The Windows export is an unsigned portable Electron client. Extract and retain the **entire `AMLIG-win32-x64` folder**, then start `AMLIG.exe` inside it. Copying only the executable will not work. It requires Windows x64 and access to the clinic's writable HTTPS EDGE server; the server and PostgreSQL are separate deployments.

## Build and export

From the repository root, with Node 24.13.x and pnpm 10.30.1 installed:

```powershell
pnpm install --frozen-lockfile
pnpm --filter app package:windows
```

The command builds Electron main, sandboxed preload and renderer bundles, then uses pinned `@electron/packager` with the pinned Electron version. It creates a fresh timestamped directory under `app/dist/windows/`, containing:

- `AMLIG-win32-x64/AMLIG.exe` and the required Electron runtime files.
- `AMLIG-win32-x64.zip`, containing the entire portable folder.
- `AMLIG-win32-x64.zip.sha256`, recording the ZIP's SHA-256.

The package stages only compiled `out/`, minimal application metadata, build provenance and dependency/UIARC notices. It excludes source/tests, `.env`, credentials, `.private`, the server and databases. Electron's `LICENSE` and `LICENSES.chromium.html` remain in the portable folder. `resources/app/build-info.json` records the source commit/tree/status, lockfile hash, Electron version and compiled-file hashes; a nonempty source status means the export includes uncommitted changes.

Before sharing an export, use a clean reviewed checkout, run the repository checks and inspect build provenance. The script checks required main/preload/renderer files and print-header assets, disallows unbundled runtime imports and unexpected staged files, and preserves dependency license notices. The output is unsigned; Windows may display an unsigned-application warning. Signing and an installer are outside this export.

Verify the ZIP before extraction:

```powershell
Get-FileHash .\AMLIG-win32-x64.zip -Algorithm SHA256
Get-Content .\AMLIG-win32-x64.zip.sha256
Expand-Archive -LiteralPath .\AMLIG-win32-x64.zip -DestinationPath .\AMLIG
```

Compare the displayed hash with the checksum file. Existing destination folders should be moved aside before extracting a new version.

## Start against the clinic server

Set the process environment before starting the executable from PowerShell:

```powershell
# Replace with the actual writable clinic EDGE origin and trusted certificate.
$env:HEALTH_IER_SERVER_URL = 'https://clinic-edge.example.org:3000'
Start-Process -FilePath .\AMLIG\AMLIG-win32-x64\AMLIG.exe
```

The origin must have no path, query, username or password. The server certificate must already be trusted by Windows/Electron. A packaged app does **not** load a nearby `.env` file. No password/token belongs in the launch command or exported folder. Staff sign in using their assigned server accounts.

The packaged client requires HTTPS even if `HEALTH_IER_ALLOW_SYNTHETIC_HTTP=true` is present. That flag allows loopback HTTP only in an unpackaged synthetic development session. Do not disable certificate verification, trust an unverified CA or change trust automatically. Authorized clinic CA installation requires verifying its fingerprint through a trusted channel; follow the clinic LAN/TLS deployment guide. A CLOUD mirror is read-only and does not substitute for a writable EDGE server.

The Electron shell retains context isolation, sandboxing, disabled renderer Node integration and named preload methods. Account permissions and validation remain enforced by the server. Internet outages are supported while the LAN/server remain available; workstation operation during LAN/server failure is outside scope.

## QA boundaries

Follow [clinic-workflow.md](clinic-workflow.md) for staff flows. Confirm the shared desktop is available before graphical QA, use a dedicated Electron window and identify its exact process/window. Use synthetic patient records and keep credentials out of screenshots. Enumerating printers is safe; submitting a print job requires explicit authorization.

The current local QA environment has a dedicated loopback HTTP EDGE instance. This supports actual **unpackaged** Electron end-to-end tests with the explicit synthetic flag. Packaged shell startup and HTTPS enforcement can be checked locally, but packaged live staff sign-in remains pending a reachable writable EDGE origin with a trusted HTTPS certificate. No packaged live-success claim should be inferred from an unpackaged run.
