# Take dashboard screenshots with headless Microsoft Edge.
# Needs: web/out built (cd web; npm run build) and Python with Pillow.
# Run from the repo root:  powershell -File scripts/screenshots.ps1
#
# Headless Edge will not make a window narrower than about 504 px, so the
# 375 px mobile shots load the page inside a 375 px wide iframe and crop.

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$shots = Join-Path $root 'docs\screenshots'
$tmp = Join-Path $env:TEMP 'runway-shots'
New-Item -ItemType Directory -Force $tmp | Out-Null
$profileDir = Join-Path $tmp 'edge-profile'

# Site on :8765, iframe wrappers on :8766
$site = Start-Process python -ArgumentList @('-m', 'http.server', '8765', '--directory', (Join-Path $root 'web\out')) -PassThru -WindowStyle Hidden
$wrap = Start-Process python -ArgumentList @('-m', 'http.server', '8766', '--directory', $tmp) -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

function Shot($file, $size, $url) {
    Start-Process -FilePath $edge -Wait -WindowStyle Hidden -ArgumentList @(
        '--headless=new', '--disable-gpu', '--hide-scrollbars', "--user-data-dir=$profileDir",
        '--virtual-time-budget=10000', "--window-size=$size", "--screenshot=$file", $url)
}

try {
    Shot "$shots\desktop-light.png" '1440,1900' 'http://localhost:8765/?theme=light'
    Shot "$shots\desktop-dark.png" '1440,1900' 'http://localhost:8765/?theme=dark'
    Shot "$shots\method-light.png" '1200,2800' 'http://localhost:8765/method/?theme=light'
    foreach ($t in 'light', 'dark') {
        "<html><body style='margin:0'><iframe src='http://localhost:8765/?theme=$t' style='border:0;width:375px;height:3900px;display:block'></iframe></body></html>" |
            Set-Content -Path "$tmp\m-$t.html" -Encoding utf8
        Shot "$tmp\m-$t.png" '504,3900' "http://localhost:8766/m-$t.html"
    }
    python -c "from PIL import Image; import sys; [Image.open(rf'$tmp\m-{t}.png').crop((0, 0, 375, 3900)).save(rf'$shots\mobile-{t}.png') for t in ('light', 'dark')]"
    Get-ChildItem $shots | Select-Object Name, Length
}
finally {
    Stop-Process -Id $site.Id, $wrap.Id -ErrorAction SilentlyContinue
}
