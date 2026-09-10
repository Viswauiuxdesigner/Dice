Write-Output "=== TESTING FERRARI LISTING ==="
$p1 = Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless', '--dump-dom', '--virtual-time-budget=2000', 'file:///C:/Dice/docs/cars-co-za-ferrari-sample.html' -NoNewWindow -PassThru -RedirectStandardOutput 'ferrari-out.html'
$p1.WaitForExit(10000)
$ferrariRaw = Get-Content 'ferrari-out.html' -Raw
if ($ferrariRaw -match '<pre id="sample-json-out"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "Ferrari json not found in output"
}

Write-Output "`n=== TESTING MAZDA LISTING ==="
$p2 = Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless', '--dump-dom', '--virtual-time-budget=2000', 'file:///C:/Dice/docs/cars-co-za-sample.html' -NoNewWindow -PassThru -RedirectStandardOutput 'mazda-out.html'
$p2.WaitForExit(10000)
$mazdaRaw = Get-Content 'mazda-out.html' -Raw
if ($mazdaRaw -match '<pre id="sample-json-out"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "Mazda json not found in output"
}

Write-Output "`n=== TESTING SUZUKI CELERIO LISTING (3 CARDS) ==="
$p0 = Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless', '--dump-dom', '--virtual-time-budget=2000', 'file:///C:/Dice/docs/cars-co-za-suzuki-sample.html' -NoNewWindow -PassThru -RedirectStandardOutput 'suzuki-out.html'
$p0.WaitForExit(10000)
$suzukiRaw = Get-Content 'suzuki-out.html' -Raw
if ($suzukiRaw -match '<pre id="suzuki-out"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "Suzuki json not found in output"
}

Write-Output "`n=== TESTING BMW LISTING ==="
$p3 = Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless', '--dump-dom', '--virtual-time-budget=2000', 'file:///C:/Dice/docs/cars-co-za-bmw-sample.html' -NoNewWindow -PassThru -RedirectStandardOutput 'bmw-out.html'
$p3.WaitForExit(10000)
$bmwRaw = Get-Content 'bmw-out.html' -Raw
if ($bmwRaw -match '<pre id="bmw-out"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "BMW json not found in output"
}

Write-Output "`n=== TESTING SMART PASTE SUITE (ONE-PASTE, FORM FILL, EXCLUSIONS, STALE DATA) ==="
$p4 = Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless', '--dump-dom', '--allow-file-access-from-files', '--virtual-time-budget=4000', 'file:///C:/Dice/docs/test-smart-paste.html' -NoNewWindow -PassThru -RedirectStandardOutput 'smart-paste-out.html'
$p4.WaitForExit(10000)
$spRaw = Get-Content 'smart-paste-out.html' -Raw
if ($spRaw -match '<pre id="test-results"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "Smart Paste results not found in output"
}
