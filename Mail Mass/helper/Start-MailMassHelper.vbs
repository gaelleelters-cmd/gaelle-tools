' Mail Mass Helper - silent Outlook bridge
' Starts the local helper on http://127.0.0.1:19527 and registers mailmass:// so the website can wake it.
' Always refreshes the script from the toolkit folder when present, then restarts the helper.

Option Explicit

Dim sh, fso
Dim installDir, ps1Path, starterPath, cmd, startup, linkPath
Dim sc, sourcePs1

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

installDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\MailMassHelper"
ps1Path = installDir & "\MailMassHelper.ps1"
starterPath = installDir & "\Start-MailMassHelper.vbs"

If Not fso.FolderExists(installDir) Then fso.CreateFolder installDir

sourcePs1 = FindToolkitPs1()
If sourcePs1 <> "" Then
  fso.CopyFile sourcePs1, ps1Path, True
ElseIf Not fso.FileExists(ps1Path) Then
  If Not DownloadBinary("https://gaelleelters.com/Mail%20Mass/helper/MailMassHelper.ps1", ps1Path) Then
    If Not WScript.Arguments.Named.Exists("silent") Then
      MsgBox "Could not install Mail Mass Helper.", vbCritical, "Mail Mass"
    End If
    WScript.Quit 1
  End If
End If

If LCase(WScript.ScriptFullName) <> LCase(starterPath) Then
  fso.CopyFile WScript.ScriptFullName, starterPath, True
End If

On Error Resume Next
Dim protocolTarget
protocolTarget = starterPath
If InStr(1, LCase(WScript.ScriptFullName), "\mail mass\helper\", vbTextCompare) > 0 Then
  protocolTarget = WScript.ScriptFullName
End If
sh.RegWrite "HKCU\Software\Classes\mailmass\", "URL:Mail Mass Protocol", "REG_SZ"
sh.RegWrite "HKCU\Software\Classes\mailmass\URL Protocol", "", "REG_SZ"
sh.RegWrite "HKCU\Software\Classes\mailmass\shell\open\command\", _
  "wscript.exe """ & protocolTarget & """ /silent", "REG_SZ"
On Error GoTo 0

startup = sh.SpecialFolders("Startup")
linkPath = startup & "\Mail Mass Helper.lnk"
Set sc = sh.CreateShortcut(linkPath)
sc.TargetPath = "wscript.exe"
sc.Arguments = """" & starterPath & """ /silent"
sc.WorkingDirectory = installDir
sc.WindowStyle = 7
sc.Save

KillHelper
WScript.Sleep 900
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1Path & """"
sh.Run cmd, 0, False
WScript.Sleep 2000

If Not WScript.Arguments.Named.Exists("silent") Then
  If HelperIsUp() Then
    MsgBox "Outlook is ready." & vbCrLf & vbCrLf & _
           "Go back to Mail Mass — status should show Connected." & vbCrLf & _
           "Then click Send.", _
           vbInformation, "Mail Mass"
  Else
    MsgBox "Helper started but is not responding yet." & vbCrLf & _
           "Open Outlook, wait a few seconds, then click Connect / Update Outlook again.", vbExclamation, "Mail Mass"
  End If
End If

Function FindToolkitPs1()
  Dim paths, i, p, best, bestDate, d
  FindToolkitPs1 = ""
  bestDate = 0
  paths = Array( _
    fso.GetParentFolderName(WScript.ScriptFullName) & "\MailMassHelper.ps1", _
    sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\OneDrive - UNHCR\Desktop\gaelleelters\Mail Mass\helper\MailMassHelper.ps1", _
    sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\Desktop\gaelleelters\Mail Mass\helper\MailMassHelper.ps1", _
    "C:\Users\ELTERS\OneDrive - UNHCR\Desktop\gaelleelters\Mail Mass\helper\MailMassHelper.ps1" _
  )
  For i = 0 To UBound(paths)
    p = paths(i)
    If fso.FileExists(p) Then
      d = fso.GetFile(p).DateLastModified
      If d >= bestDate Then
        bestDate = d
        best = p
      End If
    End If
  Next
  If best <> "" Then FindToolkitPs1 = best
End Function

Function HelperIsUp()
  On Error Resume Next
  Dim xhr, status
  HelperIsUp = False
  Set xhr = CreateObject("MSXML2.XMLHTTP.6.0")
  If xhr Is Nothing Then Set xhr = CreateObject("Microsoft.XMLHTTP")
  xhr.Open "GET", "http://127.0.0.1:19527/health", False
  xhr.Send
  status = xhr.Status
  If Err.Number = 0 And status = 200 Then HelperIsUp = True
  Err.Clear
  On Error GoTo 0
End Function

Function KillHelper()
  On Error Resume Next
  sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*MailMassHelper.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-NetTCPConnection -LocalPort 19527 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True
  Err.Clear
  On Error GoTo 0
End Function

Function DownloadBinary(url, destPath)
  On Error Resume Next
  Dim xhr, stm, status
  DownloadBinary = False
  Set xhr = CreateObject("MSXML2.XMLHTTP.6.0")
  If xhr Is Nothing Then Set xhr = CreateObject("Microsoft.XMLHTTP")
  xhr.Open "GET", url, False
  xhr.Send
  status = xhr.Status
  If Err.Number <> 0 Or status <> 200 Then
    Err.Clear
    Exit Function
  End If
  Set stm = CreateObject("ADODB.Stream")
  stm.Type = 1
  stm.Open
  stm.Write xhr.responseBody
  If fso.FileExists(destPath) Then fso.DeleteFile destPath, True
  stm.SaveToFile destPath, 2
  stm.Close
  If Err.Number = 0 And fso.FileExists(destPath) Then DownloadBinary = True
  On Error GoTo 0
End Function
