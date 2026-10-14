param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$CredentialsFile = '../.private/demo-credentials.json')
$ErrorActionPreference = 'Stop'
$accounts = (Get-Content -LiteralPath $CredentialsFile -Raw | ConvertFrom-Json).accounts
$tokens = @{}
$count = 0
function Assert-True($Condition, [string]$Name) { if (-not $Condition) { throw "Assertion failed: $Name" } }
function Call-Api([string]$Method, [string]$Path, [object]$Body, [string]$User, [int]$Status) {
  $temporary = [IO.Path]::GetTempFileName()
  $responseFile = [IO.Path]::GetTempFileName()
  try {
    $arguments = @('--silent','--show-error','--request',$Method,'--output',$responseFile,'--write-out','%{http_code}',"$BaseUrl$Path")
    if ($User) { $arguments += @('--header',"Authorization: Bearer $($tokens[$User])") }
    if ($null -ne $Body) {
      [IO.File]::WriteAllText($temporary, ($Body | ConvertTo-Json -Depth 20 -Compress), [Text.UTF8Encoding]::new($false))
      $arguments += @('--header','Content-Type: application/json','--data-binary',"@$temporary")
    }
    $actual = & curl.exe @arguments
    Assert-True ($LASTEXITCODE -eq 0 -and [int]$actual -eq $Status) "$Method $Path expected $Status received $actual"
    $script:count++
    $content = Get-Content -LiteralPath $responseFile -Raw
    if ($content) { $parsed = $content | ConvertFrom-Json; return $parsed }
  } finally { Remove-Item -LiteralPath $temporary,$responseFile -Force }
}
$health = Call-Api GET /health $null '' 200
Assert-True ($health.status -eq 'ok' -and $health.mode -eq 'EDGE') 'EDGE health'
Call-Api GET /auth/me $null '' 401 | Out-Null
Call-Api POST /auth/login @{username='demo.clerk';password='incorrect synthetic'} '' 401 | Out-Null
Call-Api POST /auth/login @{username='demo.clerk';password='wrong';role='doctor'} '' 400 | Out-Null
foreach ($account in $accounts) {
  $login = Call-Api POST /auth/login @{username=$account.username;password=$account.password} '' 200
  $tokens[$account.username] = $login.token
  Assert-True ($login.staff.role -eq $account.role -and $login.staff.isHead -eq $account.isHead) 'trusted principal'
  Assert-True (-not ($login.staff.PSObject.Properties.Name -contains 'passwordHash')) 'principal excludes hashes'
  Call-Api GET /auth/me $null $account.username 200 | Out-Null
}
$clerk = 'demo.clerk'; $attendant = 'demo.attendant'; $doctor = 'demo.doctor'; $head = 'demo.doctor.head'; $dentist = 'demo.dentist.one'; $medtech = 'demo.medtech.one'
Call-Api POST /patients @{fullName='Denied synthetic'} $doctor 403 | Out-Null
Call-Api POST /patients @{fullName='';role='doctor'} $clerk 400 | Out-Null
Call-Api POST /patients @{fullName='Synthetic category validation';patientCategory='invented'} $clerk 400 | Out-Null
$patient = Call-Api POST /patients @{fullName='Synthetic API Patient';sex='female';address='Synthetic Address';patientCategory='employee';employeeIdentifier='SYNTHETIC-API';dateOfBirth='1990-01-01'} $clerk 201
$syntheticPatientId = $patient.id
$patient = Call-Api PATCH "/patients/$syntheticPatientId" @{expectedRevision=1;address='Synthetic Updated Address'} $attendant 200
Assert-True ($patient.revision -eq 2) 'patient revision advanced'
Call-Api PATCH "/patients/$syntheticPatientId" @{expectedRevision=1;address='stale'} $clerk 409 | Out-Null
$found = @(Call-Api GET '/patients?search=Synthetic' $null $doctor 200)
Assert-True (($found | Where-Object id -eq $syntheticPatientId).address -eq 'Synthetic Updated Address') 'second client persisted identity'
$byId = Call-Api GET "/patients/$syntheticPatientId" $null $doctor 200
Assert-True ($byId.id -eq $syntheticPatientId) 'direct identity read'
$byNumber = @(Call-Api GET "/patients?search=$syntheticPatientId" $null $doctor 200)
Assert-True ($byNumber.Count -eq 1 -and $byNumber[0].id -eq $syntheticPatientId) 'exact UUID patient number lookup'
Call-Api GET "/patients/$syntheticPatientId" $null '' 401 | Out-Null
Call-Api GET '/patients/not-a-uuid' $null $doctor 400 | Out-Null
Call-Api GET '/patients/ffffffff-ffff-4fff-8fff-ffffffffffff' $null $doctor 404 | Out-Null
$singleMinimum = Call-Api GET "/patients/$syntheticPatientId" $null $medtech 200
Assert-True (-not ($singleMinimum.PSObject.Properties.Name -contains 'address')) 'medtech direct identity remains minimal'
$minimum = @(Call-Api GET '/patients?search=Synthetic' $null $medtech 200)
Assert-True (-not ($minimum[0].PSObject.Properties.Name -contains 'address')) 'medtech minimum identity'
Call-Api GET "/patients/$syntheticPatientId/charts/medical/entries" $null $clerk 403 | Out-Null
Call-Api GET "/patients/$syntheticPatientId/charts/medical/entries" $null $attendant 403 | Out-Null
Call-Api GET "/patients/$syntheticPatientId/vitals" $null $medtech 403 | Out-Null
Call-Api POST "/patients/$syntheticPatientId/vitals" @{systolic=120} $doctor 403 | Out-Null
Call-Api POST "/patients/$syntheticPatientId/vitals" @{oxygenSaturation=101} $attendant 400 | Out-Null
$vitals = Call-Api POST "/patients/$syntheticPatientId/vitals" @{recordedAt='2026-10-14T10:00:00Z';systolic=240;diastolic=100;temperature=38.5;pulse=90;respiratoryRate=20;oxygenSaturation=97;weight=$null} $attendant 201
Assert-True ($null -eq $vitals.weight -and $vitals.systolic -eq 240) 'null and abnormal measurements'
$entryBody = @{consultationDate='2026-10-14';ageAtConsultation=36;cs=$null;vitalsId=$vitals.id;reason='Synthetic symptoms';findings='Synthetic findings';clinicalImpression='Synthetic impression';plan='Synthetic plan'}
Call-Api POST "/patients/$syntheticPatientId/charts/medical/entries" $entryBody $doctor 400 | Out-Null
$vitals = Call-Api PATCH "/vitals/$($vitals.id)" @{expectedRevision=1;pulse=91} $attendant 200
Call-Api PATCH "/vitals/$($vitals.id)" @{expectedRevision=1;pulse=92} $attendant 409 | Out-Null
$vitals = Call-Api POST "/vitals/$($vitals.id)/finalize" @{expectedRevision=2} $attendant 201
Call-Api PATCH "/vitals/$($vitals.id)" @{expectedRevision=3;pulse=92} $attendant 409 | Out-Null
$vitalCorrection = Call-Api POST "/vitals/$($vitals.id)/corrections" @{expectedRevision=3;reason='Synthetic correction';correctedContent=@{pulse=92}} $attendant 201
Assert-True ($vitalCorrection.original.pulse -eq 91 -and $vitalCorrection.original.revision -eq 4 -and $vitalCorrection.correction.sourceRevision -eq 3) 'vitals preserved correction'
$listedVitals = @(Call-Api GET "/patients/$syntheticPatientId/vitals" $null $doctor 200)
Assert-True ($listedVitals[0].corrections.Count -eq 1) 'vitals correction history'
$second = Call-Api POST /patients @{fullName='Synthetic Other Patient'} $clerk 201
Call-Api POST "/patients/$($second.id)/charts/medical/entries" $entryBody $doctor 400 | Out-Null
$entry = Call-Api POST "/patients/$syntheticPatientId/charts/medical/entries" $entryBody $doctor 201
$eid = $entry.id
Call-Api PATCH "/entries/$eid" @{expectedRevision=1;findings='Head attempt'} $head 403 | Out-Null
Call-Api POST "/entries/$eid/finalize" @{expectedRevision=1} $head 403 | Out-Null
Call-Api PATCH "/entries/$eid" @{expectedRevision=1;findings='Dental attempt'} $dentist 404 | Out-Null
$entry = Call-Api PATCH "/entries/$eid" @{expectedRevision=1;findings='Synthetic final findings'} $doctor 200
Call-Api PATCH "/entries/$eid" @{expectedRevision=1;findings='Stale findings'} $doctor 409 | Out-Null
$entry = Call-Api POST "/entries/$eid/finalize" @{expectedRevision=2} $doctor 201
Call-Api POST "/entries/$eid/finalize" @{expectedRevision=3} $doctor 409 | Out-Null
Call-Api PATCH "/entries/$eid" @{expectedRevision=3;findings='Overwrite finalized'} $doctor 409 | Out-Null
Call-Api POST "/entries/$eid/corrections" @{expectedRevision=3;reason='Head correction';correctedContent=@{findings='Denied'}} $head 403 | Out-Null
$correction = Call-Api POST "/entries/$eid/corrections" @{expectedRevision=3;reason='Synthetic transcription correction';correctedContent=@{findings='Synthetic corrected finding'}} $doctor 201
Assert-True ($correction.original.findings -eq 'Synthetic final findings' -and $correction.original.revision -eq 4 -and $correction.correction.authorId -eq $entry.authorId) 'consultation preserved and attributed'
Call-Api POST "/entries/$eid/corrections" @{expectedRevision=3;reason='stale';correctedContent=@{findings='stale'}} $doctor 409 | Out-Null
$corrections = @(Call-Api GET "/entries/$eid/corrections" $null $head 200)
Assert-True ($corrections.Count -eq 1 -and $corrections[0].originalEntryId -eq $eid) 'append history linkage'
Call-Api GET "/entries/$eid/corrections" $null $medtech 404 | Out-Null
$nullEntry = Call-Api POST "/patients/$syntheticPatientId/charts/medical/entries" @{consultationDate='2026-10-14';vitalsId=$null} $head 201
Assert-True ($null -eq $nullEntry.vitalsId) 'head own-author null-vitals consultation'
$docBody = @{kind='prescription';consultationId=$eid;expectedRevision=4;issueDate='2026-10-14';body='Synthetic medication instructions';followUp='Synthetic follow-up'}
Call-Api POST /documents/preview $docBody $head 403 | Out-Null
Call-Api POST /documents $docBody $head 403 | Out-Null
$injected = $docBody.Clone(); $injected.issuerId = $nullEntry.authorId
Call-Api POST /documents $injected $doctor 400 | Out-Null
$draftDoc = $docBody.Clone(); $draftDoc.consultationId = $nullEntry.id; $draftDoc.expectedRevision = 1
Call-Api POST /documents $draftDoc $head 409 | Out-Null
$preview = Call-Api POST /documents/preview $docBody $doctor 201
Assert-True ($preview.issuerId -eq $entry.authorId -and $preview.snapshot.patient.fullName -eq 'Synthetic API Patient') 'trusted preview'
$document = Call-Api POST /documents $docBody $doctor 201
$history = @(Call-Api GET "/patients/$syntheticPatientId/documents" $null $doctor 200)
Assert-True ($history.Count -eq 1 -and $history[0].id -eq $document.id) 'persistent patient document history'
$headHistory = @(Call-Api GET "/patients/$syntheticPatientId/documents" $null $head 200)
Assert-True ($headHistory[0].snapshot.body -eq $document.snapshot.body) 'head read-only document history'
foreach ($denied in @($clerk,$attendant,$dentist,$medtech)) { Call-Api GET "/patients/$syntheticPatientId/documents" $null $denied 403 | Out-Null }
Call-Api GET "/patients/$syntheticPatientId/documents" $null '' 401 | Out-Null
Call-Api GET '/patients/not-a-uuid/documents' $null $doctor 400 | Out-Null
Call-Api GET '/patients/ffffffff-ffff-4fff-8fff-ffffffffffff/documents' $null $doctor 404 | Out-Null
Call-Api GET "/documents/$($document.id)" $null '' 401 | Out-Null
Call-Api GET "/documents/$($document.id)" $null $clerk 404 | Out-Null
Call-Api GET "/documents/$($document.id)" $null $medtech 404 | Out-Null
Call-Api GET "/documents/$($document.id)" $null $dentist 404 | Out-Null
$reprint = Call-Api GET "/documents/$($document.id)" $null $head 200
Assert-True ($reprint.id -eq $document.id -and ($reprint.snapshot | ConvertTo-Json -Depth 20 -Compress) -eq ($document.snapshot | ConvertTo-Json -Depth 20 -Compress)) 'immutable reprint snapshot'
$certificateBody = @{kind='medical_certificate';consultationId=$eid;expectedRevision=4;body='Synthetic certificate wording';purpose='Synthetic presentation';remarks='Synthetic remarks';restriction='Synthetic restriction'}
Call-Api POST /documents/preview $certificateBody $doctor 201 | Out-Null
$certificate = Call-Api POST /documents $certificateBody $doctor 201
Assert-True ($certificate.snapshot.purpose -eq 'Synthetic presentation') 'editable document-only purpose'
$fixture = '20000000-0000-4000-8000-000000000001'
foreach ($role in @('demo.medtech.one','demo.medtech.two',$head)) { Call-Api GET "/patients/$fixture/charts/laboratory/entries" $null $role 200 | Out-Null }
foreach ($role in @($doctor,$dentist,$clerk,$attendant)) { Call-Api GET "/patients/$fixture/charts/laboratory/entries" $null $role 403 | Out-Null }
foreach ($role in @('demo.dentist.one','demo.dentist.two',$head)) { Call-Api GET "/patients/$fixture/charts/dental/entries" $null $role 200 | Out-Null }
Call-Api PATCH /entries/30000000-0000-4000-8000-000000000001 @{expectedRevision=1;text='colleague attempt'} 'demo.dentist.two' 403 | Out-Null
Call-Api PATCH /entries/30000000-0000-4000-8000-000000000002 @{expectedRevision=1;text='colleague attempt'} 'demo.medtech.two' 403 | Out-Null
Call-Api GET "/patients/$syntheticPatientId/charts/medical/entries" $null $head 200 | Out-Null
Call-Api POST /auth/logout @{} $doctor 200 | Out-Null
Call-Api GET /auth/me $null $doctor 401 | Out-Null
Call-Api GET "/documents/$($document.id)" $null $doctor 401 | Out-Null
$evidence = @{requestAssertions=$count;patientId=$syntheticPatientId;vitalsId=$vitals.id;entryId=$eid;documentId=$document.id;certificateId=$certificate.id;expectedEntryRevision=4;generatedAt=[DateTime]::UtcNow.ToString('o')}
$privateDirectory = Split-Path -Parent $CredentialsFile
$evidence | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $privateDirectory 'api-evidence.json')
Write-Output "Live curl.exe assertions passed: $count. Evidence contains only synthetic IDs; tokens/passwords not logged."


