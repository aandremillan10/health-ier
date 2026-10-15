$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$migrationRoot = Join-Path $repositoryRoot 'server\prisma\migrations'
$targetMigration = '20261015220000_vitals_height_remove_hmo_data'
$migrationDirectories = @(
  Get-ChildItem -LiteralPath $migrationRoot -Directory |
    Where-Object { $_.Name -le $targetMigration } |
    Sort-Object Name
)
if (-not ($migrationDirectories.Name -contains $targetMigration)) {
  throw "Migration $targetMigration was not found under $migrationRoot."
}

$containerName = "health-ier-migration-check-$([guid]::NewGuid().ToString('N'))"
$containerStarted = $false
$seedFile = Join-Path $PSScriptRoot 'v1.3-hmo-migration-seed.sql'
$assertFile = Join-Path $PSScriptRoot 'v1.3-hmo-migration-assert.sql'

try {
  & docker run --detach --rm --name $containerName --network none --env 'POSTGRES_PASSWORD=local-only-verification' postgres:17-alpine | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable PostgreSQL 17 container.' }
  $containerStarted = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec $containerName pg_isready --username postgres --dbname postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'PostgreSQL did not become ready within 60 seconds.' }

  foreach ($migration in $migrationDirectories) {
    if ($migration.Name -eq $targetMigration) {
      & docker cp $seedFile "${containerName}:/tmp/v1.3-hmo-migration-seed.sql" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Could not copy synthetic seed SQL into the container.' }
      & docker exec $containerName psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres --file /tmp/v1.3-hmo-migration-seed.sql | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Could not seed synthetic membership, dependent, vitals, and audit rows.' }
    }

    $migrationFile = Join-Path $migration.FullName 'migration.sql'
    $containerFile = "/tmp/$($migration.Name).sql"
    & docker cp $migrationFile "${containerName}:$containerFile" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not copy migration $($migration.Name)." }
    & docker exec $containerName psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres --file $containerFile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Migration $($migration.Name) failed." }
    Write-Output "Applied $($migration.Name)"
  }

  & docker cp $assertFile "${containerName}:/tmp/v1.3-hmo-migration-assert.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy migration assertions into the container.' }
  & docker exec $containerName psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres --file /tmp/v1.3-hmo-migration-assert.sql
  if ($LASTEXITCODE -ne 0) { throw 'One or more post-migration assertions failed.' }

  Write-Output 'Migration verification passed in a disposable local PostgreSQL 17 container.'
}
finally {
  if ($containerStarted) {
    & docker stop $containerName | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning 'The disposable container did not stop cleanly.' }
  }
}
