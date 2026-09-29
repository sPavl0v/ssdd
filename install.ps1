# ssdd installer for Windows: irm https://raw.githubusercontent.com/<org>/ssdd/main/install.ps1 | iex
$ErrorActionPreference = "Stop"
$repo = if ($env:SSDD_REPO) { $env:SSDD_REPO } else { "<org>/ssdd" }
$version = if ($env:SSDD_VERSION) { "download/v$($env:SSDD_VERSION)" } else { "latest/download" }
$dest = if ($env:SSDD_INSTALL_DIR) { $env:SSDD_INSTALL_DIR } else { Join-Path $HOME ".local\bin" }
$file = "ssdd-windows-x64.exe"
$base = "https://github.com/$repo/releases/$version"
$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ([guid]::NewGuid()))
Invoke-WebRequest "$base/$file" -OutFile (Join-Path $tmp $file)
Invoke-WebRequest "$base/SHA256SUMS" -OutFile (Join-Path $tmp "SHA256SUMS")
$expected = (Get-Content (Join-Path $tmp "SHA256SUMS") | Where-Object { $_ -match " $file$" }).Split(" ")[0]
$actual = (Get-FileHash (Join-Path $tmp $file) -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) { throw "ssdd: checksum mismatch for $file" }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Move-Item -Force (Join-Path $tmp $file) (Join-Path $dest "ssdd.exe")
Remove-Item -Recurse $tmp
& (Join-Path $dest "ssdd.exe") --version
if (-not ($env:PATH -split ";" -contains $dest)) { Write-Host "add $dest to your PATH" }
