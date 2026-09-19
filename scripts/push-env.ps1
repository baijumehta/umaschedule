# Copies the three secrets from .env.local into the Vercel project's Production
# environment, then reminds you to redeploy.
#
#   powershell -ExecutionPolicy Bypass -File scripts\push-env.ps1
#
# Values are piped straight into the Vercel CLI and never printed. .env.local is
# gitignored and stays on this machine.

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.local'

if (-not (Test-Path $envFile)) {
    Write-Host "No .env.local found at $envFile" -ForegroundColor Red
    Write-Host "Copy .env.example to .env.local and fill it in first."
    exit 1
}

# Split on the FIRST '=' only: a Neon connection string contains its own
# '=' in ?sslmode=require.
$values = @{}
foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $i = $trimmed.IndexOf('=')
    if ($i -lt 1) { continue }
    $name  = $trimmed.Substring(0, $i).Trim()
    $value = $trimmed.Substring($i + 1).Trim().Trim('"')
    if ($value) { $values[$name] = $value }
}

$needed  = @('DATABASE_URL', 'HOUSEHOLD_KEY', 'FEED_TOKEN')
$missing = $needed | Where-Object { -not $values.ContainsKey($_) }
if ($missing) {
    Write-Host "These are missing or empty in .env.local: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

# Link the folder to the Vercel project if it has not been linked. This one
# step is interactive: pick the existing umaschedule project when asked.
if (-not (Test-Path (Join-Path $root '.vercel\project.json'))) {
    Write-Host "Linking this folder to your Vercel project..." -ForegroundColor Cyan
    Write-Host "When asked, choose 'Link to existing project' and pick umaschedule." -ForegroundColor DarkGray
    Push-Location $root
    npx vercel link
    $linked = $LASTEXITCODE
    Pop-Location
    if ($linked -ne 0) {
        Write-Host "Linking failed. Run 'npx vercel login' first, then try again." -ForegroundColor Red
        exit 1
    }
}

Push-Location $root
try {
    foreach ($name in $needed) {
        Write-Host ""
        Write-Host "Setting $name ..." -ForegroundColor Cyan

        # Clear any existing value so 'add' cannot collide. A "not found"
        # message here is expected the first time and is safe to ignore.
        npx vercel env rm $name production --yes | Out-Null

        $values[$name] | npx vercel env add $name production
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Could not set $name." -ForegroundColor Red
            exit 1
        }
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "All three are set for Production." -ForegroundColor Green
Write-Host "Environment variables only apply to a NEW build, so redeploy now:"
Write-Host "  npx vercel --prod" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then check:  https://umaschedule.vercel.app/api/health"
