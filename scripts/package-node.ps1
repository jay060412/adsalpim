# Build a source ZIP for installation on the destination Node.js server.
# Run from any directory; private env files, test tools and generated dependencies are excluded.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$outputDir = Join-Path $projectRoot 'artifacts'
[void][System.IO.Directory]::CreateDirectory($outputDir)
$zipPath = Join-Path $outputDir 'adsalpim-node21-ready.zip'

$rootFiles = @(
    'package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts',
    'tsconfig.json', 'components.json',
    '.env.example', '.gitignore', '.npmrc', 'index.js', 'AGENTS.md', 'README.md', 'DEPLOY.md',
    'docs/nodejs-deployment.md', 'docs/cloudflare-pages-deployment.md', 'docs/verification.md'
)
$files = @($rootFiles | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) })
foreach ($folder in @('src', 'scripts', 'public')) {
    $folderPath = Join-Path $projectRoot $folder
    if (Test-Path -LiteralPath $folderPath) {
        $files += @(Get-ChildItem -LiteralPath $folderPath -Recurse -File -Force | Where-Object {
            $_.FullName -notmatch '[\\/]__tests__[\\/]'
        })
    }
}

# Abort before writing if a private env file or the configured key entered the sources.
$configuredKey = $null
$envPath = Join-Path $projectRoot '.env.local'
if (Test-Path -LiteralPath $envPath) {
    $keyLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^GEMINI_API_KEY=' } | Select-Object -First 1
    if ($keyLine) {
        $configuredKey = ($keyLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
        if ($configuredKey -eq 'YOUR_GEMINI_API_KEY') { $configuredKey = $null }
    }
}
foreach ($file in $files) {
    if ($file.Name -like '.env*' -and $file.Name -ne '.env.example') {
        throw 'Private environment file found in package inputs.'
    }
    if ($configuredKey -and [System.IO.File]::ReadAllText($file.FullName).Contains($configuredKey)) {
        throw 'Configured API key found in package inputs.'
    }
}

# Keep current development tools in the working project. The server ZIP only
# needs build tools; it must not install unsupported/obsolete test runners on Node 21.
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ('adsalpim-node21-package-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($stagingDir)
foreach ($file in $files) {
    $relative = $file.FullName.Substring($projectRoot.Length + 1)
    $destination = Join-Path $stagingDir $relative
    [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $destination))
    Copy-Item -LiteralPath $file.FullName -Destination $destination
}
$manifestPath = Join-Path $stagingDir 'package.json'
$manifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
foreach ($name in @('eslint', 'eslint-config-next', 'vitest', 'vite')) {
    $manifest.devDependencies.PSObject.Properties.Remove($name)
}
foreach ($name in @('lint', 'test')) {
    $manifest.scripts.PSObject.Properties.Remove($name)
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 20) + [Environment]::NewLine, $utf8)
Push-Location -LiteralPath $stagingDir
try {
    & npm install --package-lock-only --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate the server package lockfile.' }
} finally {
    Pop-Location
}
$files = @(Get-ChildItem -LiteralPath $stagingDir -Recurse -File -Force)

$stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($file in ($files | Sort-Object FullName)) {
            $relative = $file.FullName.Substring($stagingDir.Length + 1).Replace('\', '/')
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal)
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $stream.Dispose()
}

$result = Get-Item -LiteralPath $zipPath
Write-Output ('Package: {0}' -f $result.FullName)
Write-Output ('Files: {0}; Size: {1:N0} bytes' -f $files.Count, $result.Length)
