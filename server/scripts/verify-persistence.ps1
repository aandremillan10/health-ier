param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$CredentialsFile = '../.private/demo-credentials.json')
$ErrorActionPreference = 'Stop'
$evidence = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $CredentialsFile) 'api-evidence.json') -Raw | ConvertFrom-Json
$account = (Get-Content -LiteralPath $CredentialsFile -Raw | ConvertFrom-Json).accounts | Where-Object username -eq 'demo.doctor.head'
$bodyFile = [IO.Path]::GetTempFileName()
try {
  [IO.File]::WriteAllText($bodyFile, (@{username=$account.username;password=$account.password} | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
  $loginText = & curl.exe --fail --silent --show-error -H 'Content-Type: application/json' --data-binary "@$bodyFile" "$BaseUrl/auth/login"
  if ($LASTEXITCODE -ne 0) { throw 'Fresh post-restart login failed.' }
  $login = $loginText | ConvertFrom-Json
  foreach ($documentId in @($evidence.documentId,$evidence.certificateId)) {
    $text = & curl.exe --fail --silent --show-error -H "Authorization: Bearer $($login.token)" "$BaseUrl/documents/$documentId"
    if ($LASTEXITCODE -ne 0) { throw 'Post-restart document read failed.' }
    $document = $text | ConvertFrom-Json
    if ($document.id -ne $documentId -or $document.patientId -ne $evidence.patientId -or $document.consultationId -ne $evidence.entryId -or $document.snapshot.consultation.revision -ne 4) { throw 'Persistent document identity/source changed.' }
  }
  $text = & curl.exe --fail --silent --show-error -H "Authorization: Bearer $($login.token)" "$BaseUrl/patients/$($evidence.patientId)/charts/medical/entries"
  $entries = $text | ConvertFrom-Json
  $entry = $entries | Where-Object id -eq $evidence.entryId
  if ($entry.revision -ne 4 -or $entry.findings -ne 'Synthetic final findings' -or $entry.status -ne 'finalized') { throw 'Persistent finalized original changed.' }
  & curl.exe --fail --silent --show-error --request POST -H "Authorization: Bearer $($login.token)" "$BaseUrl/auth/logout" | Out-Null
  Write-Output 'Post-restart fresh-client proof passed: both issued IDs/snapshots and finalized source revision preserved.'
} finally { Remove-Item -LiteralPath $bodyFile -Force }
