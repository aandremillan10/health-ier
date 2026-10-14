param(
  [string]$CloudUrl = 'https://clinic-cloud-production-21ec.up.railway.app',
  [string]$MachineTokenFile = 'C:/Users/ajapa/.codex/secrets/health-ier-demo/.env.mirror',
  [string]$EdgeUrl = 'http://127.0.0.1:3000',
  [string]$EdgeCredentialsFile = ''
)
$ErrorActionPreference = 'Stop'
$mirrorUri = [Uri]$CloudUrl
if ($mirrorUri.Scheme -ne 'https' -or $mirrorUri.UserInfo -or $mirrorUri.Query -or $mirrorUri.Fragment) { throw 'Verified HTTPS CLOUD base URL required' }
$mirrorToken = ((Get-Content -LiteralPath $MachineTokenFile | Where-Object { $_ -like 'MIRROR_MACHINE_TOKEN=*' }) -split '=', 2)[1]
if (-not $mirrorToken) { throw 'Private machine credential unavailable' }
$mirrorTempDir = Join-Path $env:TEMP "healthier-mirror-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Path $mirrorTempDir | Out-Null
$mirrorChecks = 0
function Invoke-MirrorCheck([string]$Method, [string]$Path, [int]$ExpectedStatus, [object]$Body, [string]$Token, [string]$BaseUrl = $CloudUrl) {
  $requestPath = Join-Path $mirrorTempDir 'request.json'
  $responsePath = Join-Path $mirrorTempDir 'response.json'
  $arguments = @('--silent','--show-error','--max-time','20','--request',$Method,'--output',$responsePath,'--write-out','%{http_code}')
  if ($Token) { $arguments += @('--header',"Authorization: Bearer $Token") }
  if ($null -ne $Body) { [IO.File]::WriteAllText($requestPath, ($Body | ConvertTo-Json -Depth 12 -Compress), [Text.UTF8Encoding]::new($false)); $arguments += @('--header','Content-Type: application/json','--data-binary',"@$requestPath") }
  $arguments += "$BaseUrl$Path"
  $status = & curl.exe @arguments
  if ($LASTEXITCODE -ne 0 -or [int]$status -ne $ExpectedStatus) { throw "Mirror request $Method $Path failed expected status $ExpectedStatus" }
  $script:mirrorChecks++
  return Get-Content -LiteralPath $responsePath -Raw | ConvertFrom-Json
}
try {
  $health = Invoke-MirrorCheck 'GET' '/health' 200 $null ''
  if ($health.mode -ne 'CLOUD') { throw 'Wrong deployment mode' }
  $eventId = [Guid]::NewGuid().ToString(); $patientId = [Guid]::NewGuid().ToString()
  $event = @{ eventId=$eventId; clinicId='synthetic-clinic'; schemaVersion=1; entityType='patient'; entityId=$patientId; revision=1; operation='upsert'; payload=@{id=$patientId;revision=1;fullName='Synthetic Cloud Verification';sex=$null;address=$null;patientCategory=$null;employeeIdentifier=$null;dateOfBirth=$null;createdAt='2026-10-14T00:00:00.000Z';updatedAt='2026-10-14T00:00:00.000Z'} }
  $envelope = @{clinicId='synthetic-clinic';events=@($event)}
  for ($replay=0; $replay -lt 2; $replay++) { $result = Invoke-MirrorCheck 'POST' '/internal/mirror/events' 200 $envelope $mirrorToken; if ($result.acknowledged.Count -ne 1 -or $result.acknowledged[0].eventId -ne $eventId -or $result.acknowledged[0].revision -ne 1) { throw 'Exact committed ACK missing' } }
  $null = Invoke-MirrorCheck 'POST' '/internal/mirror/events' 401 $envelope 'synthetic-staff-token'
  $envelope.clinicId='wrong-clinic'; $null = Invoke-MirrorCheck 'POST' '/internal/mirror/events' 403 $envelope $mirrorToken; $envelope.clinicId='synthetic-clinic'
  $event.schemaVersion=2; $null = Invoke-MirrorCheck 'POST' '/internal/mirror/events' 400 $envelope $mirrorToken; $event.schemaVersion=1
  $event.payload.passwordHash='forbidden-field'; $null = Invoke-MirrorCheck 'POST' '/internal/mirror/events' 400 $envelope $mirrorToken; $event.payload.Remove('passwordHash')
  $event.payload.fullName='Synthetic Event Conflict'; $result = Invoke-MirrorCheck 'POST' '/internal/mirror/events' 200 $envelope $mirrorToken
  if ($result.acknowledged.Count -ne 0 -or $result.rejected[0].code -ne 'EVENT_CONFLICT') { throw 'Conflicting replay accepted' }
  $null = Invoke-MirrorCheck 'POST' '/internal/mirror/bootstrap' 403 $null $mirrorToken
  $null = Invoke-MirrorCheck 'GET' '/internal/mirror/status' 401 $null ''
  $realStaffBoundary = 'not exercised'
  if ($EdgeCredentialsFile) {
    $account = (Get-Content -LiteralPath $EdgeCredentialsFile -Raw | ConvertFrom-Json).accounts | Where-Object username -eq 'demo.clerk'
    if (-not $account) { throw 'Private EDGE clerk account unavailable' }
    $login = Invoke-MirrorCheck 'POST' '/auth/login' 200 @{username=$account.username;password=$account.password} '' $EdgeUrl
    if (-not $login.token) { throw 'Valid EDGE session unavailable' }
    try {
      $null = Invoke-MirrorCheck 'POST' '/patients' 403 @{fullName='Synthetic denied CLOUD mutation'} $login.token
      $event.payload.fullName='Synthetic Cloud Verification'
      $null = Invoke-MirrorCheck 'POST' '/internal/mirror/events' 401 $envelope $login.token
      $realStaffBoundary = 'passed'
    } finally { $null = Invoke-MirrorCheck 'POST' '/auth/logout' 200 $null $login.token $EdgeUrl }
  }
  Write-Output (@{checks=$mirrorChecks;endpoint=$CloudUrl;exactEventId=$eventId;revision=1;replay='passed';machineBoundary='passed';schemaClinicSecrets='passed';realEdgeSessionBoundary=$realStaffBoundary} | ConvertTo-Json -Compress)
} finally {
  Remove-Item -LiteralPath (Join-Path $mirrorTempDir 'request.json') -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $mirrorTempDir 'response.json') -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $mirrorTempDir
}
