# Laptop EDGE setup: operator steps

The retained EDGE was updated to merged source `ef496bf3f9fd12aaa2147945c697f7b340930d6a` on 2026-10-15, including historical scans and local MinIO. Use **Resume this run** for ongoing QA; the former two-file command would select the old backend image and omit scan storage. The numbered **Fresh setup** sequence preserves the earlier baseline procedure for a different directory/project; it must not be pasted over the retained database. See [actual results and artifact diagnostics](laptop-edge-tls.md) for the baseline and later rollout records.

## Resume this run

On the laptop, keep Docker Desktop's Linux engine running. Open PowerShell as `windows\ajapa`:

```powershell
Set-Location 'C:\Users\ajapa\HealthierLanProof\20261015t1230d6a1\source'
$original = (Get-Location).Path
$release = 'C:\Users\ajapa\HealthierLanProof\releases\20261015-ef496bf'
$env:DOCKER_CONFIG = Join-Path (Get-Location) '.private/docker-client'
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$compose = @('--project-name', 'healthier-laptop-20261015t1230d6a1', '--project-directory', $original, '--env-file', "$release\.private\laptop-attachments.env", '-f', "$original\compose.prod.yaml", '-f', "$original\compose.laptop.yaml", '-f', "$release\source\compose.attachments.yaml", '-f', "$release\.private\rollout.yaml")
docker compose @compose up -d --no-build --pull never --wait
if ($LASTEXITCODE -ne 0) { throw 'Retained EDGE resume failed; preserve existing resources and inspect the failure' }
docker compose @compose ps
```

This resolves the existing PostgreSQL and Caddy volumes and original Caddyfile bind; the release override selects image `health-ier-laptop-edge:20261015-ef496bf` and the new initializer script. The new environment file privately retains the existing database values plus the storage credentials generated once. Keep the entire release and both historical MinIO volumes. `MIRROR_ENABLED=false` remains explicit. Do not run the seed again, recreate credentials, delete volumes or change root trust for ordinary use.

The new portable package has verified source/build hashes. The user manually opened that exact package after the automated launch was rejected; the desktop QA owner verified its process/window and completed actual HTTPS sign-in as Synthetic Clerk using official `set_value` input plus Tab/Return. The Clinic LAN badge and last connection check passed. Coordinate clicks still fail with `GetLastError87`; keyboard-controlled native workflow QA is in progress. On the workstation as `AJ-DESKTOP\ajapa`, the package launcher is:

```powershell
$env:HEALTH_IER_SERVER_URL = 'https://192.168.1.35'
$env:HEALTH_IER_ALLOW_SYNTHETIC_HTTP = 'false'
Start-Process -FilePath 'C:\Users\ajapa\.codex\worktrees\guided-onboarding\health-ier\app\dist\windows\2026-10-15T07-15-30-545Z\AMLIG-win32-x64\AMLIG.exe'
```

Retain its entire portable folder. The sibling ZIP has SHA-256 `06179737af6725c7aae15c7aa2fc68b74a2d1d187277f0b747b81669a2bb9f75`; application source `5631a43fa8dcfcd233762ae7bf063d3440da4f83`, tree `9612c223ffd8e2cb7059b4cc7ccba2da2f9efcba`, Electron `44.7.2`. [Package provenance](../verification/guided-onboarding-2026-10-15/packaged-provenance.json) identifies all nine compiled hashes. The former `current-b974375` package remains historical baseline evidence and does not verify these changes. Staff credentials stay private outside the portable folder; no database/storage/mirror values belong in the launcher. Respect the dedicated QA launch-policy boundary; do not use another mechanism to evade a rejected launch.

### Application rollback

The old source, original `.private/laptop.env` and image `health-ier-laptop-edge:20261015t1230d6a1` remain retained. A deliberate application-only rollback uses the original definitions and replaces only the server:

```powershell
Set-Location 'C:\Users\ajapa\HealthierLanProof\20261015t1230d6a1\source'
$env:DOCKER_CONFIG = Join-Path (Get-Location) '.private/docker-client'
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$rollback = @('--project-name', 'healthier-laptop-20261015t1230d6a1', '--env-file', '.private/laptop.env', '-f', 'compose.prod.yaml', '-f', 'compose.laptop.yaml')
docker compose @rollback up -d --no-build --pull never --no-deps --wait server
```

This removes scan API availability while preserving the additive table, stored objects, audit history and existing PostgreSQL/CA volumes. Do not run `down`, restore a database or delete storage as part of this application rollback. The verified pre-migration custom-format database backup is `C:\Users\ajapa\HealthierLanProof\releases\20261015-ef496bf\.private\before-historical-20261015-ef496bf.dump`; database restoration would require a separate recovery decision because it would discard subsequent writes. [Rollout evidence](../verification/guided-onboarding-postmerge-2026-10-15/server-readiness.md) records exact image/backup hashes and executed API checks.

## Fresh setup

Use two PowerShell terminals: one on the workstation and one on the laptop, either local laptop PowerShell or a fingerprint-verified SSH session. Each numbered block states its machine. Stop after a failed command; do not continue a later step to conceal a failure. Choose the **same new** `$run` on both machines; the retained run `20261015t1230d6a1` must not be reused.

### 1. Verify the SSH server and use the protected pin (workstation)

On the laptop first, display `whoami` and `ssh-keygen.exe -lf "$env:ProgramData\ssh\ssh_host_ed25519_key.pub" -E sha256`. Compare the complete fingerprint through the laptop's own trusted screen. The independently confirmed fingerprint for this laptop is `SHA256:Q5OdRrSAP5Mekp+7RGs8Ji9LjwfoWAnda9sCrucHUAg`. A changed fingerprint requires investigation; do not replace the pin automatically.

The current workstation already has this restricted pin and dedicated authorized key. Verify and use them:

```powershell
$pin = "$env:USERPROFILE\.ssh\health-ier-laptop-20261015-known_hosts"
$fingerprint = ssh-keygen.exe -lf $pin -E sha256
if ($LASTEXITCODE -ne 0 -or $fingerprint -notmatch 'SHA256:Q5OdRrSAP5Mekp\+7RGs8Ji9LjwfoWAnda9sCrucHUAg') { throw 'Unexpected SSH host identity' }
icacls.exe $pin
$transport = @('-i', "$env:USERPROFILE\.ssh\health-ier-demo", '-o', "UserKnownHostsFile=$pin", '-o', 'StrictHostKeyChecking=yes', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8')
ssh.exe @transport -l 'windows\ajapa' 192.168.1.35 whoami
```

The pin file permits only the workstation account and SYSTEM. Initial key installation and new-machine pin creation require the separately verified setup in [the SSH guide](../lan-tls-setup.md#7-optional-control-laptop-command-tests-through-windows-ssh); a Windows Hello PIN is not an SSH password. Transfer only public keys. Never expose private keys or account passwords.

### 2. Reserve a fresh laptop directory and inspect Docker (laptop)

```powershell
$run = 'REPLACE_WITH_NEW_LOWERCASE_RUN'
if ($run -notmatch '^[a-z0-9][a-z0-9_]{0,39}$') { throw 'Choose a new lowercase letters/digits/underscores run identifier' }
$runRoot = Join-Path $env:USERPROFILE "HealthierLanProof\$run"
if (Test-Path -LiteralPath $runRoot) { throw 'Run directory exists: preserve it and choose another run' }
Get-NetIPConfiguration
Get-NetConnectionProfile
docker version --format '{{.Server.Os}} {{.Server.Arch}}'
docker compose version
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker volume ls --format '{{.Name}}'
Get-NetTCPConnection -State Listen -LocalPort 443 -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$runRoot\source\.private\laptop-proof" | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe "$runRoot\source\.private" /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw 'Private directory ACL failed' }
icacls.exe "$runRoot\source\.private"
```

Require this laptop IP `192.168.1.35`, `Wi-Fi` Private, Linux amd64, Compose >= 2.24.4, free TCP 443 and no resources for the fresh project. If the engine is stopped, open Docker Desktop in the laptop's local Windows session and complete its legitimate setup prompts. Preserve existing unrelated containers and volumes. Address/interface changes require reviewing all later bindings, certificate identity and firewall values before proceeding.

### 3. Transfer the reviewed source (workstation)

Use the reviewed deployment checkout containing the three named files below. The archive starts from its tracked source and explicitly replaces only the reviewed deployment files, so it also works while those deployment changes await integration. It does not include local environments, credentials or databases.

```powershell
Set-Location 'C:\Users\ajapa\.codex\worktrees\clinic-laptop-edge-tls\health-ier'
$run = 'REPLACE_WITH_SAME_NEW_RUN'
if ($run -notmatch '^[a-z0-9][a-z0-9_]{0,39}$') { throw 'Invalid shared run identifier' }
$staging = Join-Path (Get-Location) ".private/bootstrap-$run"
if (Test-Path -LiteralPath $staging) { throw 'Staging directory exists' }
New-Item -ItemType Directory -Path $staging | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe $staging /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw 'Staging ACL failed' }
$archive = Join-Path $staging 'source.zip'
git archive --format=zip "--output=$archive" HEAD
if ($LASTEXITCODE -ne 0) { throw 'Source archive failed' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Update)
try {
  foreach ($file in @('server/Dockerfile', 'compose.laptop.yaml', 'deploy/laptop/Caddyfile')) {
    $oldEntry = $zip.GetEntry($file)
    if ($null -ne $oldEntry) { $oldEntry.Delete() }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path (Get-Location) $file), $file) | Out-Null
  }
} finally { $zip.Dispose() }
(Get-FileHash $archive -Algorithm SHA256).Hash | Set-Content "$archive.sha256" -Encoding ascii
scp.exe @transport -o 'User=windows\ajapa' $archive "192.168.1.35:C:/Users/ajapa/HealthierLanProof/$run/source.zip"
if ($LASTEXITCODE -ne 0) { throw 'Source transfer failed' }
scp.exe @transport -o 'User=windows\ajapa' "$archive.sha256" "192.168.1.35:C:/Users/ajapa/HealthierLanProof/$run/source.zip.sha256"
if ($LASTEXITCODE -ne 0) { throw 'Source checksum transfer failed' }
```

`$transport` comes from step 1 in the same workstation terminal. If using a new terminal, repeat step 1 first. The laptop directory exists from step 2; SCP must not create a different directory implicitly.

### 4. Extract, generate private settings and validate (laptop)

Continue the laptop terminal from step 2:

```powershell
$archive = Join-Path $runRoot 'source.zip'
$expected = (Get-Content "$archive.sha256" -Raw).Trim()
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Transferred source hash mismatch' }
Expand-Archive -LiteralPath $archive -DestinationPath "$runRoot\source"
Set-Location "$runRoot\source"
if (Test-Path -LiteralPath '.private/laptop.env') { throw 'Existing private environment must be preserved' }
$random = New-Object byte[] 32
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($random) } finally { $generator.Dispose() }
$password = -join ($random | ForEach-Object { $_.ToString('x2') })
$lines = @("DEPLOY_RUN=$run", 'LAPTOP_IP=192.168.1.35', 'CLINIC_ID=synthetic-clinic-laptop', "POSTGRES_DB=healthier_demo_laptop_$run", 'POSTGRES_USER=healthier_laptop', "POSTGRES_PASSWORD=$password", "DATABASE_URL=postgresql://healthier_laptop:$password@postgres:5432/healthier_demo_laptop_$run")
[IO.File]::WriteAllLines((Join-Path (Get-Location) '.private/laptop.env'), $lines, (New-Object Text.UTF8Encoding($false)))
$password = $null
$lines = $null
$dockerClient = Join-Path (Get-Location) '.private/docker-client'
if (Test-Path -LiteralPath $dockerClient) { throw 'Dedicated Docker config already exists' }
New-Item -ItemType Directory -Path $dockerClient | Out-Null
[IO.File]::WriteAllText((Join-Path $dockerClient 'config.json'), '{"auths":{"https://index.docker.io/v1/":{}}}', (New-Object Text.UTF8Encoding($false)))
$env:DOCKER_CONFIG = $dockerClient
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$project = "healthier-laptop-$run"
if (@(docker ps -aq --filter "label=com.docker.compose.project=$project").Count -gt 0) { throw 'Project containers already exist' }
if (@(docker volume ls -q --filter "label=com.docker.compose.project=$project").Count -gt 0) { throw 'Project volumes already exist' }
$compose = @('--project-name', $project, '--env-file', '.private/laptop.env', '-f', 'compose.prod.yaml', '-f', 'compose.laptop.yaml')
docker compose @compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration failed' }
```

The password is fresh random hexadecimal; no secret is printed. The dedicated anonymous-public-registry config avoids the Windows credential-helper SSH logon-session failure and preserves the user's existing Docker login. Every later laptop terminal must restore these process-only Docker variables and the same `$compose` values.

### 5. Build, migrate and seed (laptop)

```powershell
docker compose @compose build server
if ($LASTEXITCODE -ne 0) { throw 'Build failed: investigate before continuing' }
docker compose @compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration failed' }
docker compose @compose up -d --no-build --wait postgres server
if ($LASTEXITCODE -ne 0) { throw 'Database/API did not become healthy' }
docker compose @compose --profile seed run --rm seed
if ($LASTEXITCODE -ne 0) { throw 'Private synthetic seed failed' }
docker compose @compose up -d --no-build --wait caddy
if ($LASTEXITCODE -ne 0) { throw 'Caddy did not start' }
docker compose @compose exec -T server node node_modules/prisma/build/index.js migrate status --config prisma7.config.ts
docker compose @compose ps
```

This run's normal build stalled downloading the official Prisma engine from the laptop container. The verified artifact fallback below is the executed alternative; use it **instead of** repeating a stalled full build. Preserve the loopback-only seed guard and private account file. The server applies migrations using the installed CLI without a runtime pnpm download; the seed joins PostgreSQL's network namespace without exposing its port.

### 6. Add only the reviewed HTTPS rule and export only the public CA (laptop, elevated)

```powershell
$rule = "Healthier-Laptop-HTTPS-$run"
if (Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue) { throw 'Rule exists: inspect rather than overwrite' }
if ((Get-NetConnectionProfile -InterfaceAlias 'Wi-Fi').NetworkCategory -ne 'Private') { throw 'Wi-Fi is not the approved Private network' }
New-NetFirewallRule -Name $rule -DisplayName "Healthier laptop HTTPS $run" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -LocalAddress 192.168.1.35 -RemoteAddress 192.168.1.95 -InterfaceAlias 'Wi-Fi' -Profile Private
docker compose @compose cp caddy:/data/caddy/pki/authorities/local/root.crt .private/laptop-proof/root.crt
if ($LASTEXITCODE -ne 0) { throw 'Public root export failed' }
Get-FileHash .private/laptop-proof/root.crt -Algorithm SHA256
Get-PfxCertificate -FilePath .private/laptop-proof/root.crt | Select-Object Subject,Issuer,Thumbprint,NotBefore,NotAfter,HasPrivateKey
```

Preserve existing firewall rules. Keep the firewall enabled; no router/public access change is required. Only `root.crt` crosses machines; all CA private keys remain in laptop Docker storage. Record these public identity values before the next step. A new project creates a new CA, so the retained run's certificate hash must not be reused for it.

### 7. Transfer, verify and deliberately trust that exact public CA (workstation)

```powershell
$transfer = Join-Path $staging 'laptop-transfer'
if (Test-Path -LiteralPath $transfer) { throw 'Transfer directory exists' }
New-Item -ItemType Directory -Path $transfer | Out-Null
icacls.exe $transfer /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw 'Transfer ACL failed' }
scp.exe @transport -o 'User=windows\ajapa' "192.168.1.35:C:/Users/ajapa/HealthierLanProof/$run/source/.private/laptop-proof/root.crt" "$transfer/root.crt"
if ($LASTEXITCODE -ne 0) { throw 'Public CA transfer failed' }
$expectedHash = Read-Host 'Full public root SHA256 displayed on the verified laptop'
if ((Get-FileHash "$transfer/root.crt" -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Public CA hash mismatch' }
$root = Get-PfxCertificate -FilePath "$transfer/root.crt"
$root | Select-Object Subject,Issuer,Thumbprint,NotBefore,NotAfter,HasPrivateKey
if ($root.HasPrivateKey) { throw 'Expected a public certificate only' }
C:\Windows\System32\curl.exe --fail --silent --show-error --max-time 10 https://192.168.1.35/health
```

Before trust, record the expected untrusted-root failure, and test the real packaged app's unavailable state. Stop the assigned client before changing trust. Review the displayed exact certificate and obtain any required approval for **this** root; the prior approval applied only to retained-run thumbprint `6CF95CEF5B4E065507BE3203B86F0ACEE2C4A91A`. Then run this block as the intended workstation account, never another administrator's account:

```powershell
$rootPath = "Cert:\CurrentUser\Root\$($root.Thumbprint)"
$preexisting = Test-Path $rootPath
if (-not $preexisting) { Import-Certificate -FilePath "$transfer/root.crt" -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null }
Get-ChildItem 'Cert:\CurrentUser\Root' | Where-Object Thumbprint -eq $root.Thumbprint | Select-Object Thumbprint,Subject,HasPrivateKey
scp.exe @transport -o 'User=windows\ajapa' "192.168.1.35:C:/Users/ajapa/HealthierLanProof/$run/source/.private/laptop-proof/credentials.json" "$transfer/laptop-credentials.json"
if ($LASTEXITCODE -ne 0) { throw 'Private synthetic account transfer failed' }
icacls.exe "$transfer/laptop-credentials.json"
```

Do not print the account file. This adds a public CA only to `CurrentUser\Root`; retain its exact thumbprint and preexisting status. Default Schannel curl may report `CRYPT_E_NO_REVOCATION_CHECK` for this internal CA. Do not bypass revocation or certificate checks to obtain a pass; use the fresh actual Electron health/sign-in path as the application's authoritative check and record the curl limitation.

### 8. Launch the package, run the cases and retain the working server (workstation)

Use the exact package command under **Resume this run**, with the fresh project's separately verified CA if repeating setup. Verify real Electron HTTPS health, staff sign-in and the cases in [clinic workflow QA](clinic-workflow.md), recording passed/failed/not-run subcases. Check TCP 443 is reachable and TCP 3000/5432/2019/80 are unreachable from the workstation. Keep context isolation, normal TLS validation and server authorization active. Do not submit a printer job or disconnect shared WAN without its separate authorization.

Leave this project's server healthy for ongoing QA. Its database, private account file and CA volumes belong together; use the result record's exact scoped stop/removal commands only when requested.

## Executed build fallback: verified public Prisma artifact

Use this only for the pinned Prisma `7.10.0` Linux amd64/OpenSSL 3 build recorded here. On the workstation in the reviewed checkout, download and verify the exact official artifact with normal TLS:

```powershell
$engineDirectory = Join-Path $staging 'prisma-engine'
New-Item -ItemType Directory -Path $engineDirectory | Out-Null
$base = 'https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/debian-openssl-3.0.x/'
C:\Windows\System32\curl.exe --fail --silent --show-error --max-time 45 --output "$staging/schema-engine.gz" "${base}schema-engine.gz"
if ($LASTEXITCODE -ne 0) { throw 'Official engine download failed' }
if ((Get-FileHash "$staging/schema-engine.gz" -Algorithm SHA256).Hash -ne 'B7210B525A6E592C0D5DB7E7D48EDBC0F334E14E212AF7AF11C0D4A8DE755A31') { throw 'Published compressed checksum mismatch' }
$inputStream = [IO.File]::OpenRead("$staging/schema-engine.gz")
$outputStream = [IO.File]::Create("$engineDirectory/schema-engine")
$gzip = New-Object IO.Compression.GZipStream($inputStream, [IO.Compression.CompressionMode]::Decompress)
try { $gzip.CopyTo($outputStream) } finally { $gzip.Dispose(); $outputStream.Dispose(); $inputStream.Dispose() }
if ((Get-FileHash "$engineDirectory/schema-engine" -Algorithm SHA256).Hash -ne '29557C21D47DA6F1695EC1A747CB6C607DADE5E44E8B3E4FA687BD4DC226956D') { throw 'Published decompressed checksum mismatch' }
$derived = [IO.File]::ReadAllText((Join-Path (Get-Location) 'server/Dockerfile'))
$insertion = "COPY --from=prisma-engine /schema-engine /usr/local/bin/prisma-schema-engine`nRUN chmod 0755 /usr/local/bin/prisma-schema-engine`nENV PRISMA_SCHEMA_ENGINE_BINARY=/usr/local/bin/prisma-schema-engine`nRUN pnpm --filter server prisma:generate"
$derived = $derived.Replace('RUN pnpm --filter server prisma:generate', $insertion)
[IO.File]::WriteAllText("$staging/Dockerfile.laptop-cache", $derived, (New-Object Text.UTF8Encoding($false)))
scp.exe @transport -o 'User=windows\ajapa' -r $engineDirectory "192.168.1.35:C:/Users/ajapa/HealthierLanProof/$run/source/.private/"
if ($LASTEXITCODE -ne 0) { throw 'Public engine transfer failed' }
scp.exe @transport -o 'User=windows\ajapa' "$staging/Dockerfile.laptop-cache" "192.168.1.35:C:/Users/ajapa/HealthierLanProof/$run/source/.private/Dockerfile.laptop-cache"
if ($LASTEXITCODE -ne 0) { throw 'Derived Dockerfile transfer failed' }
```

The result record links the publisher's independent compressed/raw checksum URLs. Verify them again if rebuilding; a changed artifact/hash requires investigation. In laptop PowerShell, with step 4's environment restored, confirm the named context contains only `schema-engine`, recheck its raw hash, then build:

```powershell
if ((Get-FileHash '.private/prisma-engine/schema-engine' -Algorithm SHA256).Hash -ne '29557C21D47DA6F1695EC1A747CB6C607DADE5E44E8B3E4FA687BD4DC226956D') { throw 'Transferred engine hash mismatch' }
if (@(Get-ChildItem '.private/prisma-engine' -Force).Count -ne 1) { throw 'Unexpected named context files' }
docker build --build-context prisma-engine=.private/prisma-engine --load -t "health-ier-laptop-edge:$run" -f .private/Dockerfile.laptop-cache .
if ($LASTEXITCODE -ne 0) { throw 'Verified-cache build failed' }
docker image inspect "health-ier-laptop-edge:$run" --format '{{.Id}} {{.Architecture}}'
```

Resume step 5 at Caddy validation, then migrations/seed/startup. This passes only the public engine into its named build context; `.private/laptop.env`, staff credentials and CA keys remain excluded. The generated executable mode supports runtime user `node`; the installed CLI uses this same engine for migrations.
