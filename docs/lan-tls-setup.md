# Later-run Windows laptop LAN and TLS proof

Later execution record, 2026-10-15: [laptop EDGE HTTPS and packaged workstation proof](qa/laptop-edge-tls.md) records the actual reversed topology: laptop `192.168.1.35` hosts Docker EDGE/PostgreSQL/Caddy and workstation `192.168.1.95` runs the client. Use that run's verified identities, configuration and results for the retained setup. The original desktop-server/laptop-client instructions below retain their historical provenance and are not an execution claim for the newer run.

Yes: a Windows laptop on the same home/clinic router can prove that a second machine uses the desktop's shared records over validated HTTPS. The desktop may be wired and the laptop on Wi-Fi. SSH is optional remote command access; it does not control the laptop's graphical Electron/browser session.

These are instructions to run later, **not an executed LAN/TLS test**. No OpenSSH feature, certificate, firewall rule, router setting or device was changed while writing this guide. Use synthetic records only. Desktop Ethernet was observed at **192.168.1.95**; recheck it before running anything. The laptop address and Windows account are still unknown.

## 1. Identify both machines and prepare the desktop backend

On each machine, open PowerShell and record the active adapter, IPv4 address, network profile and Windows account:

```powershell
Get-NetIPConfiguration
Get-NetConnectionProfile
whoami
```

Use the trusted router's normal Wi-Fi, rather than guest Wi-Fi with client isolation. Wired/Wi-Fi clients must be allowed to communicate. A router DHCP reservation for the desktop avoids later address changes; changing its IP requires updating the Caddy certificate/site and client configuration. Do not guess a subnet or change router settings during another person's work. Select a Private Windows network profile only for this trusted network.

Follow [development setup](development.md) on the desktop to install the pinned Node/pnpm dependencies, start the dedicated PostgreSQL database, migrate, seed synthetic accounts, and run NestJS. The documented Compose database publishes **127.0.0.1:5432**; the earlier portable demo uses **127.0.0.1:55432**. Neither port needs a LAN firewall opening. The public development database password is for this synthetic local database only; staff passwords are separately generated in an ignored private file.

This is the intended connection path:

```text
Laptop Electron/curl -- HTTPS TCP 443 --> Desktop Caddy
                                             |
                                   HTTP 127.0.0.1:3000
                                             |
                                       Desktop NestJS
                                             |
                                   loopback PostgreSQL
```

Confirm the existing desktop API before adding the proxy:

```powershell
curl.exe --fail --silent --show-error http://127.0.0.1:3000/health
```

Expect `{"status":"ok","mode":"EDGE"}`. The current [server entry point](../server/src/main.ts) calls `listen(PORT)` without a host: it is **not explicitly loopback-bound**. There is no implemented `HOST` environment option. Step 3 blocks remote plaintext access while retaining the proxy's loopback connection.

## 2. Prepare a local HTTPS proxy on the desktop

Download the Windows binary from [Caddy's official installation/download instructions](https://caddyserver.com/docs/install), verify the release asset as directed there, and put `caddy.exe` under `%LOCALAPPDATA%\HealthierLanTls`. This guide runs it in a foreground PowerShell window under your own Windows account; keep that window open during the proof. Service installation is unnecessary for this later synthetic test.

Create a plain UTF-8 file named `Caddyfile` in that directory. Replace **both** IP occurrences if the desktop address changed:

```caddyfile
{
    auto_https disable_redirects
    skip_install_trust
}

https://192.168.1.95 {
    bind 192.168.1.95
    tls internal
    reverse_proxy 127.0.0.1:3000
}
```

The IP is the certificate identity; `tls internal` uses Caddy's local CA. Explicit binding restricts this listener to that desktop address. Automatic plaintext redirects are disabled, so port 80 is unnecessary. Trust installation is deliberately handled in step 4. Keep Caddy's administration endpoint at its loopback default; do not open port 2019. See [local HTTPS](https://caddyserver.com/docs/automatic-https), [TLS internal](https://caddyserver.com/docs/caddyfile/directives/tls), [binding](https://caddyserver.com/docs/caddyfile/directives/bind), [proxying](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and [global options](https://caddyserver.com/docs/caddyfile/options).

In the desktop foreground PowerShell window:

```powershell
Set-Location "$env:LOCALAPPDATA\HealthierLanTls"
.\caddy.exe validate --config .\Caddyfile --adapter caddyfile
.\caddy.exe run --config .\Caddyfile --adapter caddyfile
```

Stop on a validation/startup failure. Do not bypass a conflicting existing port-443 service. Caddy must keep its private CA keys/data on the desktop. With this foreground account and no `XDG_DATA_HOME` override, its data directory is `%APPDATA%\Caddy`; a different service account uses a different location. See [Caddy file locations](https://caddyserver.com/docs/conventions).

## 3. Allow HTTPS and block remote plaintext on the desktop

Run this step later in **PowerShell as Administrator on the desktop**, after verifying the actual adapter and Private profile. The example interface name is `Ethernet`; replace it if necessary. Keep Windows Firewall enabled. Check for existing rules with these names before creating them; do not repeatedly add duplicates.

```powershell
$clinicInterface = 'Ethernet'
New-NetFirewallRule -Name 'Healthier-LAN-HTTPS' -DisplayName 'Healthier LAN HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -LocalAddress 192.168.1.95 -RemoteAddress LocalSubnet -InterfaceAlias $clinicInterface -Profile Private
New-NetFirewallRule -Name 'Healthier-Block-Plaintext-LAN' -DisplayName 'Healthier block remote plaintext API' -Direction Inbound -Action Block -Protocol TCP -LocalPort 3000 -InterfaceAlias $clinicInterface -Profile Any
```

The block applies to traffic arriving on that LAN adapter; Caddy still connects through loopback. Repeat the plaintext block for any other active LAN adapter if the desktop has more than one. Keep PostgreSQL loopback-only. Scope existing broad Node/Caddy firewall allowances appropriately, and confirm the negative checks in step 5: creating one scoped allow rule does not narrow another pre-existing broad allow. Do not configure router port forwarding or public inbound access. The rule parameters are documented in [Microsoft New-NetFirewallRule](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule).

## 4. Verify and trust only the public local CA certificate

On the desktop, in a second ordinary PowerShell window under the same account that runs Caddy:

```powershell
$clinicRoot = Join-Path $env:APPDATA 'Caddy\pki\authorities\local\root.crt'
certutil.exe -hashfile $clinicRoot SHA256
```

Transfer **only `root.crt`** to the laptop by a trusted local transfer, such as USB or fingerprint-verified SSH. Compare the complete SHA-256 file fingerprint with the desktop's displayed value through a separate trusted channel before trusting it. Never transfer `root.key`, intermediate/leaf private keys, Caddy's entire data directory, database configuration or machine-mirror credentials. Keep the CA data directory private and persistent.

Before importing the root on the laptop, step 5's HTTPS health request should fail certificate validation if this CA is not already trusted. On the laptop set the path to the transferred public file:

```powershell
$clinicRoot = "$env:USERPROFILE\Downloads\root.crt"
```

Then run these two commands on **both machines, as the Windows user who will run curl and Electron**. On the desktop keep `$clinicRoot` set to the original `%APPDATA%` path above:

```powershell
certutil.exe -hashfile $clinicRoot SHA256
certutil.exe -user -addstore Root $clinicRoot
```

This adds the verified public certificate to that user's Trusted Root Certification Authorities. Check it in `certmgr.msc` under that store and record its certificate thumbprint for eventual removal of this exact demo CA. Do not import into another administrator's user profile by mistake. Each Windows account running the app needs trust; an administrator-managed `LocalMachine\Root` deployment is an alternative for shared machines, not required here. Microsoft documents [certificate stores/import](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate) and [certutil addstore/hashfile](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil).

Use the Windows-provided Schannel curl build: check `C:\Windows\System32\curl.exe --version`, and ensure `Get-Command curl.exe` resolves to it before running the repository scripts. Schannel uses Windows certificate trust. A Git/OpenSSL curl build may use a different CA store; passing its TLS check alone does not establish Electron trust. Restart Electron after the import and test its own `net.fetch` path in step 6. Never use `curl -k`, certificate-error handlers or disabled verification. See [curl certificate verification](https://curl.se/docs/sslcerts.html).

## 5. Prove reachability, TLS validation and shared authenticated records

Run on the **laptop**; this is the actual second-device test. TCP success alone is insufficient:

```powershell
Test-NetConnection 192.168.1.95 -Port 443
curl.exe --fail --silent --show-error --max-time 10 https://192.168.1.95/health
```

Expect TCP success and verified HTTPS returning EDGE health. Record the untrusted-CA failure before step 4 and the success after trust. Verify a wrong server identity still fails; this reserved test name resolves directly to the same desktop without changing DNS:

```powershell
curl.exe --fail --silent --show-error --max-time 10 --resolve 'clinic-wrong.invalid:443:192.168.1.95' https://clinic-wrong.invalid/health
curl.exe --fail --silent --show-error --max-time 5 http://192.168.1.95:3000/health
Test-NetConnection 192.168.1.95 -Port 5432
Test-NetConnection 192.168.1.95 -Port 55432
```

Expect the wrong-identity HTTPS connection to fail before an HTTP success, plaintext port 3000 to be unreachable, and both PostgreSQL ports to be unreachable. A TLS handshake error is an expected wrong-identity outcome; it must not produce health success. If any private/plaintext service is reachable, fix binding/firewall exposure before authenticated testing.

Check out the same repository version on the laptop. On **each machine**, prepare a fresh ignored proof directory from its checkout root. Use the same newly chosen run identifier on both machines; the directory must not already exist. Keep original account/evidence files and the existing `.private` directory's ACL unchanged:

```powershell
$lanProofRun = Read-Host 'New shared run identifier (letters, numbers, dashes or underscores)'
if ($lanProofRun -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$') { throw 'Invalid proof run identifier.' }
$lanProofDirectory = Join-Path (Get-Location) ".private/lan-proof-$lanProofRun"
if (Test-Path -LiteralPath $lanProofDirectory) { throw 'Proof directory exists; choose a fresh run identifier.' }
New-Item -ItemType Directory -Path $lanProofDirectory | Out-Null
$clinicUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe $lanProofDirectory /inheritance:r /grant:r "*${clinicUserSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F'
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the new proof directory.' }
$lanProofCredentials = Join-Path $lanProofDirectory 'credentials.json'
$sourceCredentials = Read-Host 'Existing synthetic account file path (desktop original or trusted transferred copy)'
if (-not (Test-Path -LiteralPath $sourceCredentials -PathType Leaf)) { throw 'Source account file not found.' }
if (Test-Path -LiteralPath $lanProofCredentials) { throw 'Proof account target already exists.' }
Copy-Item -LiteralPath $sourceCredentials -Destination $lanProofCredentials
```

Use a **private copy of the existing synthetic accounts**, transferred by USB or verified SSH for the laptop; never reseed or overwrite the originals. The copy is needed only for this scripted proof. Never commit/upload it, paste its contents into chat or screenshot it. The normal Electron client has no need for a database or mirror environment file. Applying ACLs above touches only the newly created proof folder, not the existing `.private` root or source credentials.

From the laptop checkout root, run the existing Windows proof against the desktop HTTPS origin:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/verify-live.ps1 -BaseUrl https://192.168.1.95 -CredentialsFile $lanProofCredentials
```

The script obtains tokens in memory, exercises all eight synthetic accounts, creates records/documents, checks permissions and revisions, and writes only synthetic IDs into this run's `api-evidence.json` beside its copied credentials. It does not reset the database. Different databases/runs must use separate proof directories because the script uses that fixed evidence filename. Keep the same database/fixtures and avoid concurrent test mutations until this proof finishes.

To establish two physical clients, transfer the laptop's ID-only `api-evidence.json` into the **new desktop proof directory** beside its private account copy. Never copy it over an original evidence file. On the desktop, with the variables from its preparation block still available:

```powershell
$receivedEvidence = Read-Host 'Path to the laptop run ID-only api-evidence.json from trusted transfer'
$lanProofEvidence = Join-Path $lanProofDirectory 'api-evidence.json'
if (-not (Test-Path -LiteralPath $receivedEvidence -PathType Leaf)) { throw 'Transferred ID evidence not found.' }
if (Test-Path -LiteralPath $lanProofEvidence) { throw 'Proof evidence target already exists.' }
Copy-Item -LiteralPath $receivedEvidence -Destination $lanProofEvidence
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/verify-persistence.ps1 -BaseUrl https://192.168.1.95 -CredentialsFile $lanProofCredentials
```

That fresh desktop login must read the laptop-created issued IDs and finalized source. Stop/restart only this application's NestJS process after confirming nobody is using it, then repeat the persistence command from both machines with the credentials in **each machine's own new proof directory** and those same IDs. Do not reseed/reset or stop PostgreSQL. While NestJS is deliberately stopped, laptop HTTPS health must fail (the live proxy can return 502); no save is confirmed. Once restarted, health and fresh authorized reads must recover. [API examples](../server/API.md) and [backend verification](backend-verification.md) explain the assertions and safe failure semantics.

## 6. Configure and verify the laptop Electron client

Install the pinned Node/pnpm dependencies using [development setup](development.md). For this laptop client, no server migration, seed, PostgreSQL container or mirror worker is required. Copy `app/.env.example` to `app/.env` only if it does not already exist, then set these two values:

```dotenv
HEALTH_IER_SERVER_URL=https://192.168.1.95
HEALTH_IER_ALLOW_SYNTHETIC_HTTP=false
```

Use the exact trusted origin, with no extra API path. Existing shell environment values override the development file, so remove an old synthetic-loopback override in the launching shell if present. From checkout root run `pnpm install --frozen-lockfile`, then `pnpm dev:app`. The development loader supplies these two settings to Electron main, not as renderer credentials. Never put `DATABASE_URL`, `MIRROR_MACHINE_TOKEN`, staff passwords or session tokens in the client/renderer environment. Packaged clients also require a trusted HTTPS configuration; the loopback HTTP demo exception is unavailable there. See [privileged desktop configuration](backend-electron.md).

Later graphical verification requires confirmation that the laptop's exact Electron/browser session is available. After that confirmation, launch the configured app and use its development DevTools Console to evaluate **only** `await window.desktop.clinic.health()`: expect `{ok:true,data:{status:"ok",mode:"EDGE"}}`. This exercises Electron main's actual `net.fetch` and certificate validation; a curl pass alone cannot prove that stack. Do not type credentials into the DevTools console/history. Named login and clinical task UI checks await teammate renderer integration. Per AGENTS, any later graphical browser QA uses Chrome after resource confirmation and session identification.

## 7. Optional: control laptop command tests through Windows SSH

Skip this step if you will run laptop PowerShell yourself. To control the laptop from the desktop later, install **OpenSSH Server on the laptop** and **OpenSSH Client on the desktop**. In elevated PowerShell on the appropriate machine, inspect installed capabilities and add the missing one:

```powershell
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH*'
# Laptop only, if absent:
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
# Desktop only, if absent:
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

On the laptop in elevated PowerShell, narrow the automatic inbound rule before starting SSH. Replace the desktop IP if it changed; check for the named custom rule before creating it:

```powershell
Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Disable-NetFirewallRule
New-NetFirewallRule -Name 'Healthier-Laptop-SSH' -DisplayName 'Healthier laptop SSH from desktop' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 -RemoteAddress 192.168.1.95 -Profile Private
Start-Service sshd
Set-Service sshd -StartupType Manual
```

Use the actual laptop Windows username from `whoami`. Windows Hello PIN is **not an SSH account password**; do not share either in chat. Public-key authentication avoids password exchange. Microsoft's sources cover [feature/service setup](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse) and [PIN's local-device scope](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/faq).

On the desktop as your ordinary user, create a new dedicated key only if that filename is unused. Enter a passphrase when prompted, and keep the private file on the desktop:

```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.ssh" -Force | Out-Null
ssh-keygen.exe -t ed25519 -f "$env:USERPROFILE\.ssh\healthier_laptop" -C 'healthier-laptop-control'
```

The passphrase-encrypted key requires **the user's local unlock**: load it into a running Windows `ssh-agent` with `ssh-add.exe`, or enter its passphrase during an initial local interactive SSH login. Unattended commands cannot silently enter or recover that passphrase. Never place it in chat, scripts, environment files or evidence; automation may use only an already authorized/unlocked session or agent-loaded key.

Transfer only `healthier_laptop.pub` to the laptop, for example by USB into Downloads. On the laptop:

- For an administrator account, append the public key in **elevated PowerShell** to `C:\ProgramData\ssh\administrators_authorized_keys`; this shared administrator file applies to administrator logins. Preserve existing keys. Afterward its only ACL entries should be SYSTEM and Administrators. The SID avoids localized group-name differences:

  ```powershell
  $authorizedKeys = "$env:ProgramData\ssh\administrators_authorized_keys"
  Get-Content "$env:USERPROFILE\Downloads\healthier_laptop.pub" | Add-Content -LiteralPath $authorizedKeys -Encoding ascii
  icacls.exe $authorizedKeys /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F'
  icacls.exe $authorizedKeys
  ```

  If that inspection shows other explicit entries, remove only those unwanted entries before continuing; `/inheritance:r` removes inherited entries, not unrelated explicit grants.

- For a standard account, sign in as that intended account and append the public key to its own profile. Do not put it into an administrator's profile:

  ```powershell
  New-Item -ItemType Directory -Path "$env:USERPROFILE\.ssh" -Force | Out-Null
  $authorizedKeys = "$env:USERPROFILE\.ssh\authorized_keys"
  Get-Content "$env:USERPROFILE\Downloads\healthier_laptop.pub" | Add-Content -LiteralPath $authorizedKeys -Encoding ascii
  $sshUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  icacls.exe $authorizedKeys /inheritance:r /grant:r "*${sshUserSid}:F" '*S-1-5-18:F'
  icacls.exe $authorizedKeys
  ```

  Preserve existing keys and inspect/remove unwanted explicit grants as above; the intended user and SYSTEM retain access.

See [Microsoft key-based authentication](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement) and [authorized-key paths/ACL requirements](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration).

On the laptop in elevated PowerShell, display the server's **public host-key** fingerprint:

```powershell
ssh-keygen.exe -lf "$env:ProgramData\ssh\ssh_host_ed25519_key.pub" -E sha256
```

On the desktop, substitute the actual laptop IP/account. Compare the first-connection fingerprint with the laptop's locally displayed matching key fingerprint before accepting it. If SSH offers a different host-key algorithm, compare that matching public host-key file on the laptop. Do not suppress host-key checking or accept an unexplained changed key:

```powershell
ssh.exe -i "$env:USERPROFILE\.ssh\healthier_laptop" -l LAPTOP_USERNAME LAPTOP_IP
```

Windows SSH initially opens a command shell; enter `powershell -NoProfile` there, then run `whoami` and the laptop HTTPS checks above. Do not add `-L` port forwarding for this proof: requests must originate on the laptop and connect to the desktop's LAN HTTPS address. This provides shell/curl control, not GUI, printer or desktop control.

After key login works, use elevated local laptop access to set global `PasswordAuthentication no` in `C:\ProgramData\ssh\sshd_config` before any `Match` block, validate with `C:\Windows\System32\OpenSSH\sshd.exe -t`, then `Restart-Service sshd`. Retest key login while local access remains available. When finished, stop only this optional laptop service with `Stop-Service sshd` and disable `Healthier-Laptop-SSH`; retain keys or remove only the dedicated demo key after deciding whether SSH will be reused.

## 8. Record what was actually proved later

Keep an ID/status-only checklist: machine IPs/Windows users, repository version, verified CA/SSH public fingerprints, untrusted/wrong-identity failures, HTTPS EDGE health, blocked plaintext/database ports, authenticated laptop requests, desktop reads of the same IDs, restart recovery and truthful server-failure behavior. Never include passwords, tokens, private keys or clinical payloads in public evidence.

For a narrow mirror interruption, use [the existing application-scoped mirror outage procedure](backend-mirror.md); it leaves the router/internet connection intact. A **physical WAN-off proof** affects shared resources: get user confirmation first, keep Wi-Fi/Ethernet/LAN and the clinic server available, and repeat the authenticated HTTPS flow. Do not disable the LAN adapter to simulate WAN failure. Actual clinic desktops, teammate cache/account-switch flows, browser QA and physical printer paper/margins remain separate later checks. This guide establishes a synthetic test method, not production rollout, backup or privacy readiness.
