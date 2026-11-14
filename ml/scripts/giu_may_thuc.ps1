# Giữ máy thức (không vào Modern Standby, không tắt màn hình) trong lúc tiến trình huấn luyện còn chạy.
# Trên máy Modern Standby, khi màn hình tắt Windows tạm dừng mọi chương trình desktop, nên huấn luyện đứng yên cả đêm.
# Không đổi cài đặt nguồn: chỉ giữ một yêu cầu "cần hệ thống và màn hình" (SetThreadExecutionState), tự hết khi script thoát.
# Gập màn hình (lid) vẫn làm máy ngủ theo cài đặt của Windows.
# Chạy: powershell -File ml/scripts/giu_may_thuc.ps1 -ProcessId <PID của python huấn luyện>
param([Parameter(Mandatory = $true)][int]$ProcessId)

Add-Type -Namespace Win32 -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES_CONTINUOUS = [uint32]2147483648; $ES_SYSTEM_REQUIRED = [uint32]1; $ES_DISPLAY_REQUIRED = [uint32]2
[Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_DISPLAY_REQUIRED) | Out-Null
Write-Host "Giữ máy thức trong lúc tiến trình $ProcessId còn chạy. Đóng cửa sổ này để thôi."
while (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 60 }
[Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
Write-Host "Tiến trình $ProcessId đã kết thúc, trả lại chế độ ngủ bình thường."
