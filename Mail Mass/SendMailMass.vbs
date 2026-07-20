' Mail Mass — Outlook sender (Windows)
' Put this file in the same folder as MailMass_Ready.csv, then double-click.
' Uses Outlook's default signature (via Inspector) so compose formatting is preserved.

Option Explicit

Dim OutlookApp, OutlookMail, inspector
Dim fso, csvPath, cols
Dim firstName, emailAddr, attachPath, ccEmail, bccEmail, subjectText, messageText, greetingText
Dim displayOnly, emailBody, sentCount, skippedCount
Dim stream, csvText, allRows, ri

Set fso = CreateObject("Scripting.FileSystemObject")
csvPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\MailMass_Ready.csv"

If Not fso.FileExists(csvPath) Then
  MsgBox "Could not find MailMass_Ready.csv in:" & vbCrLf & fso.GetParentFolderName(WScript.ScriptFullName) & vbCrLf & vbCrLf & "Download it from Mail Mass first, and keep it next to this script.", vbExclamation, "Mail Mass"
  WScript.Quit 1
End If

On Error Resume Next
Set OutlookApp = GetObject(, "Outlook.Application")
If OutlookApp Is Nothing Then
  Set OutlookApp = CreateObject("Outlook.Application")
End If
On Error GoTo 0

If OutlookApp Is Nothing Then
  MsgBox "Could not start Outlook. Please open Outlook and try again.", vbCritical, "Mail Mass"
  WScript.Quit 1
End If

Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "UTF-8"
stream.Open
stream.LoadFromFile csvPath
csvText = stream.ReadText
stream.Close

If Left(csvText, 1) = ChrW(&HFEFF) Then csvText = Mid(csvText, 2)

Set allRows = ParseCsvRecords(csvText)

sentCount = 0
skippedCount = 0

For ri = 0 To allRows.Count - 1
  If ri = 0 Then
    ' header
  Else
    cols = allRows(ri)
    firstName = GetCol(cols, 0)
    emailAddr = GetCol(cols, 1)
    attachPath = GetCol(cols, 2)
    If Len(attachPath) >= 2 Then
      If Left(attachPath, 1) = """" And Right(attachPath, 1) = """" Then
        attachPath = Mid(attachPath, 2, Len(attachPath) - 2)
      End If
    End If
    ccEmail = GetCol(cols, 3)
    bccEmail = GetCol(cols, 4)
    subjectText = GetCol(cols, 5)
    messageText = GetCol(cols, 6)
    greetingText = GetCol(cols, 7)
    displayOnly = GetCol(cols, 8)

    If subjectText = "" Then subjectText = "Document Attached"

    If emailAddr = "" Then
      skippedCount = skippedCount + 1
    ElseIf attachPath <> "" And Not fso.FileExists(attachPath) Then
      skippedCount = skippedCount + 1
    Else
      Set OutlookMail = OutlookApp.CreateItem(0)
      OutlookMail.BodyFormat = 2 ' olFormatHTML

      ' Load Outlook's real new-mail signature (correct styles + images)
      Set inspector = OutlookMail.GetInspector
      WScript.Sleep 200
      emailBody = BuildMessageHtml(greetingText, firstName, messageText)
      OutlookMail.HTMLBody = InsertIntoBody(OutlookMail.HTMLBody, emailBody)

      OutlookMail.To = emailAddr
      If ccEmail <> "" Then OutlookMail.CC = ccEmail
      If bccEmail <> "" Then OutlookMail.BCC = bccEmail
      OutlookMail.Subject = subjectText
      If attachPath <> "" Then OutlookMail.Attachments.Add attachPath

      ' Inspector must be closed before Send, or Outlook raises an error
      On Error Resume Next
      inspector.Close 0 ' olSave
      On Error GoTo 0
      Set inspector = Nothing

      If displayOnly = "0" Then
        OutlookMail.Send
      Else
        OutlookMail.Display
      End If

      Set OutlookMail = Nothing
      sentCount = sentCount + 1
      WScript.Sleep 400
    End If
  End If
Next

MsgBox "Done." & vbCrLf & _
       "Processed: " & sentCount & vbCrLf & _
       "Skipped: " & skippedCount & vbCrLf & vbCrLf & _
       "Signature: Outlook default (compose format)", _
       vbInformation, "Mail Mass"

' ----------------- helpers -----------------

Function BuildMessageHtml(greetingText, firstName, messageText)
  Dim openLine, paras, i, html, p, t
  If Trim(greetingText & "") <> "" Then
    openLine = HtmlEsc(greetingText) & " " & HtmlEsc(firstName) & ","
  Else
    openLine = HtmlEsc(firstName) & ","
  End If

  html = "<div style='font-family:Calibri,sans-serif;font-size:11.0pt;font-weight:normal;font-style:normal;'>" & _
         "<p class=MsoNormal style='margin:0 0 8pt 0;font-weight:normal;'>" & openLine & "</p>"

  t = NormalizeNewlines(messageText)
  paras = Split(t, vbLf & vbLf)
  For i = 0 To UBound(paras)
    p = Trim(paras(i))
    If p <> "" Then
      p = Replace(HtmlEsc(p), vbLf, "<br>")
      html = html & "<p class=MsoNormal style='margin:0 0 8pt 0;font-weight:normal;'>" & p & "</p>"
    End If
  Next
  html = html & "</div>"
  BuildMessageHtml = html
End Function

Function InsertIntoBody(fullHtml, contentHtml)
  Dim lower, pos, gt
  If Trim(fullHtml & "") = "" Then
    InsertIntoBody = contentHtml
    Exit Function
  End If
  lower = LCase(fullHtml)
  pos = InStr(1, lower, "<body")
  If pos > 0 Then
    gt = InStr(pos, fullHtml, ">")
    If gt > 0 Then
      InsertIntoBody = Left(fullHtml, gt) & contentHtml & Mid(fullHtml, gt + 1)
      Exit Function
    End If
  End If
  ' Already a fragment (or unusual shape) — put message first, keep signature HTML after
  InsertIntoBody = contentHtml & fullHtml
End Function

Function NormalizeNewlines(s)
  Dim t
  t = s & ""
  t = Replace(t, vbCrLf, vbLf)
  t = Replace(t, vbCr, vbLf)
  NormalizeNewlines = t
End Function

Function ParseCsvRecords(text)
  Dim rows, fields, i, ch, inQ, cur, allEmpty, fi
  Set rows = CreateObject("Scripting.Dictionary")
  Set fields = CreateObject("Scripting.Dictionary")
  cur = ""
  inQ = False
  text = Replace(text, vbCrLf, vbLf)
  text = Replace(text, vbCr, vbLf)

  For i = 1 To Len(text)
    ch = Mid(text, i, 1)
    If ch = """" Then
      If inQ And i < Len(text) And Mid(text, i + 1, 1) = """" Then
        cur = cur & """"
        i = i + 1
      Else
        inQ = Not inQ
      End If
    ElseIf ch = "," And Not inQ Then
      fields.Add fields.Count, cur
      cur = ""
    ElseIf ch = vbLf And Not inQ Then
      fields.Add fields.Count, cur
      allEmpty = True
      For fi = 0 To fields.Count - 1
        If Trim(fields(fi) & "") <> "" Then allEmpty = False
      Next
      If Not allEmpty Then
        rows.Add rows.Count, DictToArray(fields)
      End If
      Set fields = CreateObject("Scripting.Dictionary")
      cur = ""
    Else
      cur = cur & ch
    End If
  Next

  If cur <> "" Or fields.Count > 0 Then
    fields.Add fields.Count, cur
    allEmpty = True
    For fi = 0 To fields.Count - 1
      If Trim(fields(fi) & "") <> "" Then allEmpty = False
    Next
    If Not allEmpty Then
      rows.Add rows.Count, DictToArray(fields)
    End If
  End If

  Set ParseCsvRecords = rows
End Function

Function DictToArray(dict)
  Dim arr(), i
  If dict.Count = 0 Then
    ReDim arr(0)
    arr(0) = ""
    DictToArray = arr
    Exit Function
  End If
  ReDim arr(dict.Count - 1)
  For i = 0 To dict.Count - 1
    arr(i) = dict(i)
  Next
  DictToArray = arr
End Function

Function GetCol(arr, idx)
  If IsArray(arr) Then
    If UBound(arr) >= idx Then
      GetCol = Trim(arr(idx) & "")
      Exit Function
    End If
  End If
  GetCol = ""
End Function

Function HtmlEsc(s)
  Dim t
  t = s & ""
  t = Replace(t, "&", "&amp;")
  t = Replace(t, "<", "&lt;")
  t = Replace(t, ">", "&gt;")
  t = Replace(t, """", "&quot;")
  HtmlEsc = t
End Function
