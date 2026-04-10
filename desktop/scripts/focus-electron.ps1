Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class Win32Focus {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@

# Get all electron PIDs
$electronPids = (Get-Process -Name electron -ErrorAction SilentlyContinue).Id
Write-Host "Electron PIDs: $($electronPids -join ', ')"

$found = $false
[Win32Focus]::EnumWindows({
    param($hWnd, $lParam)
    $pid = [uint32]0
    [Win32Focus]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
    
    if ($electronPids -contains $pid) {
        $title = New-Object System.Text.StringBuilder 256
        [Win32Focus]::GetWindowText($hWnd, $title, 256) | Out-Null
        $titleStr = $title.ToString()
        $visible = [Win32Focus]::IsWindowVisible($hWnd)
        Write-Host "  Found window: PID=$pid, Title='$titleStr', Visible=$visible, Handle=$hWnd"
        
        if ($titleStr -and $titleStr.Length -gt 0) {
            Write-Host "  -> Restoring and focusing: '$titleStr'"
            [Win32Focus]::ShowWindow($hWnd, 9) | Out-Null  # SW_RESTORE
            [Win32Focus]::BringWindowToTop($hWnd) | Out-Null
            [Win32Focus]::SetForegroundWindow($hWnd) | Out-Null
            $script:found = $true
        }
    }
    return $true
}, [IntPtr]::Zero) | Out-Null

if (-not $found) {
    Write-Host "No titled Electron windows found. The window may not have been created."
}
