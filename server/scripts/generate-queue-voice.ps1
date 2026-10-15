#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($PSVersionTable.PSEdition -ne 'Desktop') {
  throw 'Run this script with Windows powershell.exe (Windows PowerShell 5.1), not pwsh.'
}
Add-Type -AssemblyName System.Speech

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$outputDirectory = Join-Path $repositoryRoot 'server/src/queue-display/public/audio/en'
$manifestPath = Join-Path $repositoryRoot 'server/src/queue-display/voice-manifest.json'
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

# Fixed public vocabulary only: no patient input and no runtime speech service.
$clips = [ordered]@{
  'now-serving.wav' = 'Now serving.'
  'letter-m.wav' = 'M'
  'letter-d.wav' = 'D'
  'letter-l.wav' = 'L'
  'digit-0.wav' = 'zero'
  'digit-1.wav' = 'one'
  'digit-2.wav' = 'two'
  'digit-3.wav' = 'three'
  'digit-4.wav' = 'four'
  'digit-5.wav' = 'five'
  'digit-6.wav' = 'six'
  'digit-7.wav' = 'seven'
  'digit-8.wav' = 'eight'
  'digit-9.wav' = 'nine'
  'medical.wav' = 'Please proceed to Medical.'
  'dental.wav' = 'Please proceed to Dental.'
  'laboratory.wav' = 'Please proceed to Laboratory.'
}
$voiceName = 'Microsoft Zira Desktop'
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
try {
  $voice = @($synthesizer.GetInstalledVoices() | Where-Object {
    $_.Enabled -and $_.VoiceInfo.Name -eq $voiceName -and $_.VoiceInfo.Culture.Name -eq 'en-US'
  })
  if ($voice.Count -ne 1) { throw "The offline English voice '$voiceName' (en-US) must be installed." }
  $synthesizer.SelectVoice($voiceName)
  $synthesizer.Rate = 0
  $synthesizer.Volume = 100
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    16000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
  )
  $files = @()
  foreach ($clip in $clips.GetEnumerator()) {
    $path = Join-Path $outputDirectory $clip.Key
    # Always target a file before speaking; never use the computer speakers.
    $synthesizer.SetOutputToWaveFile($path, $format)
    $synthesizer.Speak($clip.Value)
    $synthesizer.SetOutputToNull()
    $files += [ordered]@{
      filename = $clip.Key
      text = $clip.Value
      bytes = (Get-Item -LiteralPath $path).Length
      sha256 = [BitConverter]::ToString($hashAlgorithm.ComputeHash([IO.File]::ReadAllBytes($path))).Replace('-', '').ToLowerInvariant()
    }
  }
  $manifest = [ordered]@{
    generator = 'server/scripts/generate-queue-voice.ps1'
    engine = [System.Speech.Synthesis.SpeechSynthesizer].Assembly.FullName
    voice = $voiceName
    culture = $voice[0].VoiceInfo.Culture.Name
    rate = $synthesizer.Rate
    volume = $synthesizer.Volume
    format = [ordered]@{ encoding = 'PCM'; sampleRate = 16000; bitsPerSample = 16; channels = 1 }
    clips = $files
  }
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5) + "`n", (New-Object Text.UTF8Encoding($false)))
  Write-Output "Generated $($clips.Count) offline English WAV clips with $voiceName; no speaker playback."
  Write-Output "Output: $outputDirectory"
  Write-Output "Manifest: $manifestPath"
} finally {
  $synthesizer.Dispose()
  $hashAlgorithm.Dispose()
}
