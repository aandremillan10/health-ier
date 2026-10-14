param([string]$RuntimeDirectory = "$env:LOCALAPPDATA/HealthierSyntheticPostgres", [int]$DatabasePort = 55432, [string]$DatabaseName = 'healthier_demo_core')
$ErrorActionPreference = 'Stop'
if ($DatabaseName -notmatch '^healthier_demo_[a-z0-9_]+$' -or $DatabasePort -lt 1024 -or $DatabasePort -gt 65535) { throw 'Dedicated synthetic database/port required.' }
$serverDirectory = Split-Path -Parent $PSScriptRoot
$runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
$privateDirectory = Join-Path (Split-Path -Parent $serverDirectory) '.private'
if (Test-Path -LiteralPath (Join-Path $serverDirectory '.env')) { throw 'Existing server/.env preserved. Use its known dedicated database, or move it aside after review.' }
New-Item -ItemType Directory -Force -Path $runtime,$privateDirectory | Out-Null
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $privateDirectory '/inheritance:r' '/grant:r' "${currentUser}:(OI)(CI)F" | Out-Null
$bin = Join-Path $runtime 'pgsql/bin'
if (-not (Test-Path -LiteralPath (Join-Path $bin 'initdb.exe'))) {
  $archive = Join-Path $runtime 'postgresql.zip'
  & curl.exe --fail --silent --show-error --location --output $archive 'https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64-binaries.zip'
  if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne 'C510B3058C161479BFBE0AEAC878CA682B344FD9385C58A359690147A4CA1A6C') { throw 'PostgreSQL download/checksum failed.' }
  Expand-Archive -LiteralPath $archive -DestinationPath $runtime
}
$passwordFile = Join-Path $runtime 'admin-password.private'
$data = Join-Path $runtime 'data'
if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
  $passwordBytes = New-Object byte[] 32
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  $random.GetBytes($passwordBytes)
  $random.Dispose()
  [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($passwordBytes))
  & icacls.exe $passwordFile '/inheritance:r' '/grant:r' "${currentUser}:F" | Out-Null
  & (Join-Path $bin 'initdb.exe') -D $data -U demo_admin --auth=scram-sha-256 "--pwfile=$passwordFile" --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Dedicated cluster initialization failed.' }
}
& (Join-Path $bin 'pg_ctl.exe') -D $data status | Out-Null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $bin 'pg_ctl.exe') -D $data -l (Join-Path $runtime 'postgresql.log') -o "-h 127.0.0.1 -p $DatabasePort" start
  if ($LASTEXITCODE -ne 0) { throw 'Dedicated PostgreSQL startup failed.' }
}
$adminPassword = [IO.File]::ReadAllText($passwordFile)
$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $adminPassword
  $exists = & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $DatabasePort -U demo_admin -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'"
  if ($LASTEXITCODE -ne 0) { throw 'Dedicated PostgreSQL connection failed.' }
  if ($exists -ne '1') {
    & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p $DatabasePort -U demo_admin $DatabaseName
    if ($LASTEXITCODE -ne 0) { throw 'Dedicated synthetic database creation failed.' }
  }
} finally { $env:PGPASSWORD = $previousPgPassword }
$databaseUrl = "postgresql://demo_admin:$([Uri]::EscapeDataString($adminPassword))@127.0.0.1:$DatabasePort/$DatabaseName"
[IO.File]::WriteAllLines((Join-Path $serverDirectory '.env'), @("DATABASE_URL=$databaseUrl",'SERVER_MODE=EDGE','CLINIC_ID=synthetic-clinic','PORT=3000','MIRROR_ENABLED=false'))
& icacls.exe (Join-Path $serverDirectory '.env') '/inheritance:r' '/grant:r' "${currentUser}:F" | Out-Null
Push-Location $serverDirectory
try {
  & pnpm.cmd prisma:migrate
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
  & pnpm.cmd demo:seed
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic seed failed.' }
} finally { Pop-Location }
Write-Output "Dedicated EDGE setup complete. Credentials: $(Join-Path $privateDirectory 'demo-credentials.json'). Start with pnpm --filter server start:prod."
