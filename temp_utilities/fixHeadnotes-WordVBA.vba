Sub fixHeadNotes()
' takes headnote text from Word Doc and replaces it with headnote as found in Excel lookup table
    Dim myData As Variant
    Dim useCount As Long
    Dim rng As Range
    myData = TransferExcelDataToWord()
    dataMin = LBound(myData, 2)
    dataMax = UBound(myData, 2)
    Set rng = ActiveDocument.Range(Start:=Selection.Start, End:=Selection.End)
    Application.ScreenUpdating = False
    Application.DisplayStatusBar = False
    Application.Options.CheckSpellingAsYouType = False
    Application.Options.CheckGrammarAsYouType = False
    Debug.Print ("data lbound & ubound are: " & Str(dataMin) & " " & Str(dataMax))
    With rng.Find
        .ClearFormatting
        .Replacement.Font.Bold = True
        .MatchWildcards = True
        .Wrap = wdFindContinue
    End With
    For i = dataMax To dataMin Step -1
        headText = myData(2, i)
        headNo = myData(1, i)
        Debug.Print ("Beginning: " + headNo)
        If (Len(headText) > 3) And Len(headNo) - InStr(headNo, ".") > 1 Then
        searchText = "(^13)" + Left(headNo, InStr(headNo, ".")) + "( " + headText + ")"
        Debug.Print (searchText)
            With rng.Find
                .Text = searchText
                .Replacement.Text = "\1" + headNo + "\2"
                .Execute Replace:=wdReplaceAll, Format:=True
            End With
            Debug.Print ("replaced " + headText)
        Else
            Debug.Print ("skipped " + headText)
        End If
    Next i
    Application.ScreenUpdating = True
    Application.DisplayStatusBar = True
    Application.Options.CheckSpellingAsYouType = True
    Application.Options.CheckGrammarAsYouType = True
End Sub

    Function TransferExcelDataToWord() As Variant

        Dim xlApp As Object
        Dim xlWorkbook As Object
        Dim myData As Variant
        Const ExcelFilePath As String = "C:\Users\bobby\Documents\Programming\LUBA\Headnote Lookup.xlsx"

        ' Create or get Excel application object
        On Error Resume Next
        Set xlApp = GetObject(, "Excel.Application")
        If xlApp Is Nothing Then
            Set xlApp = CreateObject("Excel.Application")
        End If
        On Error GoTo 0

        xlApp.Visible = False
        Set xlWorkbook = xlApp.Workbooks.Open(ExcelFilePath)
        myData = xlWorkbook.Sheets(1).Range("e2:f418")
        TransferExcelDataToWord = TransposeArray(myData)
        xlWorkbook.Close False
        xlApp.Quit
        Set xlWorkbook = Nothing
        Set xlApp = Nothing
    End Function

Function TransposeArray(inputArray As Variant) As Variant
    Dim rows As Long, cols As Long
    Dim i As Long, j As Long
    Dim outputArray As Variant

    rows = UBound(inputArray, 1) - LBound(inputArray, 1) + 1
    cols = UBound(inputArray, 2) - LBound(inputArray, 2) + 1

    ReDim outputArray(1 To cols, 1 To rows)

    For i = 1 To rows
        For j = 1 To cols
            outputArray(j, i) = inputArray(LBound(inputArray, 1) + i - 1, LBound(inputArray, 2) + j - 1)
        Next j
    Next i

    TransposeArray = outputArray
End Function