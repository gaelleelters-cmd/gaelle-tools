' Mail Mass Helper - for everyone using the public website
' Double-click this file once. It installs a small local bridge so the website
' can send through YOUR Outlook (each person uses their own Outlook).
'
' Requirements: Windows + Outlook desktop

Option Explicit

Dim sh, fso, http, stream
Dim installDir, ps1Path, starterPath, urlPs1, cmd, startup, linkPath
Dim baseUrls, i, downloaded, sc

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

installDir = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\MailMassHelper"
ps1Path = installDir & "\MailMassHelper.ps1"
starterPath = installDir & "\Start-MailMassHelper.vbs"

If Not fso.FolderExists(installDir) Then fso.CreateFolder installDir

' Prefer a copy next to this script (local/dev), otherwise download from the public site
downloaded = False
If fso.FileExists(fso.GetParentFolderName(WScript.ScriptFullName) & "\MailMassHelper.ps1") Then
  fso.CopyFile fso.GetParentFolderName(WScript.ScriptFullName) & "\MailMassHelper.ps1", ps1Path, True
  downloaded = True
Else
  baseUrls = Array( _
    "https://gaelleelters.com/Mail%20Mass/helper/MailMassHelper.ps1", _
    "https://www.gaelleelters.com/Mail%20Mass/helper/MailMassHelper.ps1" _
  )
  For i = 0 To UBound(baseUrls)
    If DownloadBinary(baseUrls(i), ps1Path) Then
      downloaded = True
      Exit For
    End If
  Next
End If

If Not downloaded Or Not fso.FileExists(ps1Path) Then
  MsgBox "Could not install the helper script." & vbCrLf & vbCrLf & _
         "Check your internet connection, then try again from:" & vbCrLf & _
         "https://gaelleelters.com", vbCritical, "Mail Mass Helper"
  WScript.Quit 1
End If

' Keep a starter copy in the install folder for Startup
fso.CopyFile WScript.ScriptFullName, starterPath, True

' Always keep a Startup shortcut so the helper comes back after reboot
startup = sh.SpecialFolders("Startup")
linkPath = startup & "\Mail Mass Helper.lnk"
Set sc = sh.CreateShortcut(linkPath)
sc.TargetPath = "wscript.exe"
sc.Arguments = """" & starterPath & """ /silent"
sc.WorkingDirectory = installDir
sc.WindowStyle = 7
sc.Save

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1Path & """"
If WScript.Arguments.Named.Exists("silent") Then
  sh.Run cmd, 7, False
Else
  sh.Run cmd, 1, False
  MsgBox "Helper is running on this PC." & vbCrLf & vbCrLf & _
         "Go back to Mail Mass in your browser and click Send with Outlook." & vbCrLf & _
         "Keep the helper window open while you send." & vbCrLf & vbCrLf & _
         "Anyone else using the site must run this helper on their own computer.", _
         vbInformation, "Mail Mass Helper"
End If

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
