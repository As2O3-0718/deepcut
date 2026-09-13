$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $projectDirectory '.env.local'
$secret = Read-Host 'Paste your DeepSeek API key (input is hidden)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer).Trim()
    if ($token -notmatch '^[A-Za-z0-9_-]{16,}$') { throw 'Invalid key format. Nothing was saved.' }
    $content = 'DEEPSEEK_API_KEY=' + $token + "`nDEEPSEEK_MODEL=deepseek-flash`n"
    [IO.File]::WriteAllText($destination, $content, [Text.UTF8Encoding]::new($false))
    Write-Host 'Saved locally. Your key was not printed. Tell Codex that setup is complete.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $token = $null
    $content = $null
    $secret.Dispose()
}
