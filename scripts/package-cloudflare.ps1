param([string]$OutputPath)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$uploadRoot = Join-Path $projectRoot 'deployment/cloudflare-pages/upload'
if (-not $OutputPath) {
  $OutputPath = Join-Path $projectRoot 'artifacts/adsalpim-cloudflare-connect.zip'
}
$outputFullPath = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $outputFullPath) -Force | Out-Null

# Only these three public deployment files enter the archive. No server source,
# dependency tree, local configuration, API key, or .env file is included.
$files = @('_worker.js', '_routes.json', 'index.html') | ForEach-Object { Join-Path $uploadRoot $_ }
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing deployment file: $file" }
}
Compress-Archive -LiteralPath $files -DestinationPath $outputFullPath -Force
Get-Item -LiteralPath $outputFullPath | Select-Object FullName, Length
