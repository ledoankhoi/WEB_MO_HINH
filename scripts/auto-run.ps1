# Chạy tự động các việc trong docs/ke-hoach/backlog-quan-tri-kho.md, mỗi việc một phiên Claude Code mới
# (ngữ cảnh sạch, không bị đầy giữa chừng). Dừng khi hết việc, khi không còn ở nhánh auto/quan-tri-kho,
# hoặc khi hai lần liền không có commit mới. Nhật ký từng lần ở data/auto-logs/ (không vào git).
# Chạy: npm run auto     (hoặc: powershell -ExecutionPolicy Bypass -File scripts/auto-run.ps1 -MaxRuns 10)
param([int]$MaxRuns = 40, [string]$Model = "opus")

$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false

$backlog = "docs/ke-hoach/backlog-quan-tri-kho.md"
$branch = "auto/quan-tri-kho"
$logDir = "data/auto-logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
# Lời nhắc chỉ gồm ký tự ASCII để Windows PowerShell 5.1 truyền nguyên vẹn; nội dung thật nằm trong file.
$prompt = "Read docs/ke-hoach/auto-prompt.md and follow it exactly."
$stalls = 0

for ($i = 1; $i -le $MaxRuns; $i++) {
  if ((git branch --show-current) -ne $branch) { Write-Host "Không ở nhánh $branch, dừng."; break }
  $left = @(Select-String -Path $backlog -Pattern '^- \[ \] ' -Encoding UTF8).Count
  if ($left -eq 0) { Write-Host "Hết việc. Xem mục Báo cáo cuối trong $backlog."; break }

  $head = git rev-parse HEAD
  $log = Join-Path $logDir ("{0:yyyyMMdd-HHmmss}-lan{1}.log" -f (Get-Date), $i)
  Write-Host ("[{0:HH:mm}] Lần {1}: còn {2} việc. Nhật ký: {3}" -f (Get-Date), $i, $left, $log)
  claude -p $prompt --permission-mode auto --model $Model 2>&1 | Tee-Object -FilePath $log

  if ((git rev-parse HEAD) -eq $head) { $stalls++ } else { $stalls = 0 }
  if ($stalls -ge 2) { Write-Host "Hai lần liền không có commit mới, dừng để bạn xem nhật ký trong $logDir."; break }
}
git log --oneline -15
