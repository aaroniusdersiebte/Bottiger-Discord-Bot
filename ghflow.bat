@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  GHFLOW - GitHub Terminal Workflow Tool
:: ============================================================

:STARTUP
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [!] Kein git-Repo gefunden.
    set /p INIT="    git init hier durchfuehren? [j/n]: "
    if /i "!INIT!"=="j" (
        git init
        echo [OK] Repo initialisiert.
    ) else (
        echo Abbruch.
        goto END
    )
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [!] Kein remote 'origin' gesetzt.
    set /p RURL="    Remote-URL eingeben (leer = ueberspringen): "
    if not "!RURL!"=="" (
        git remote add origin "!RURL!"
        echo [OK] Remote gesetzt.
    )
)

:REFRESH
set BRANCH=unbekannt
set REMOTE=kein remote
set CHANGES=0
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set REMOTE=%%r
for /f %%c in ('git status --short 2^>nul ^| find /c /v ""') do set CHANGES=%%c

echo.
echo ============================================================
echo   GHFLOW - GitHub Workflow
echo ============================================================
echo   Branch  : !BRANCH!
echo   Remote  : !REMOTE!
echo   Offen   : !CHANGES! Datei(en) mit Aenderungen
echo ============================================================
echo.

:MENU
echo   1) Status anzeigen
echo   2) Commit + Push
echo   3) Pull
echo   4) Branch wechseln / neu
echo   5) Vollsync (alles stagen + pushen)
echo   6) Datei aus Tracking entfernen (untrack)
echo   7) Datei aus gesamter History loeschen
echo   8) .gitignore erstellen
echo   9) Beenden
echo.
set /p CHOICE="Auswahl: "

if "!CHOICE!"=="1" goto STATUS
if "!CHOICE!"=="2" goto COMMIT_PUSH
if "!CHOICE!"=="3" goto PULL
if "!CHOICE!"=="4" goto BRANCH
if "!CHOICE!"=="5" goto FULLSYNC
if "!CHOICE!"=="6" goto UNTRACK
if "!CHOICE!"=="7" goto PURGE_HISTORY
if "!CHOICE!"=="8" goto GITIGNORE
if "!CHOICE!"=="9" goto END

echo [!] Ungueltige Auswahl.
echo.
goto MENU

:: --------------------------------------------------------
:STATUS
echo.
echo ---- Git Status -------------------------------------------
set SB=unbekannt
set SR=kein remote
set SC=0
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set SB=%%b
for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set SR=%%r
for /f %%c in ('git status --short 2^>nul ^| find /c /v ""') do set SC=%%c
echo   Branch  : !SB!
echo   Remote  : !SR!
echo   Offen   : !SC! Datei(en)
echo.
git status --short
echo.
goto MENU

:: --------------------------------------------------------
:COMMIT_PUSH
echo.
echo ---- Commit + Push ----------------------------------------
git status --short
echo.

set CP_CHANGES=0
for /f %%c in ('git status --short 2^>nul ^| find /c /v ""') do set CP_CHANGES=%%c
if "!CP_CHANGES!"=="0" (
    echo [!] Keine uncommitted Aenderungen.
    set /p PUSHONLY="    Trotzdem pushen (z.B. neuer Branch)? [j/n]: "
    if /i "!PUSHONLY!"=="j" goto DO_PUSH
    goto MENU
)

set /p STAGE="Alle Aenderungen stagen? (git add -A) [j/n]: "
if /i "!STAGE!"=="j" (
    git add -A
    echo [OK] Alle Dateien gestaged.
) else (
    set /p CONT="Fortfahren mit bereits gestaged? [j/n]: "
    if /i not "!CONT!"=="j" goto MENU
)

set STAGED=0
for /f %%s in ('git diff --cached --name-only 2^>nul ^| find /c /v ""') do set STAGED=%%s
if "!STAGED!"=="0" (
    echo [!] Nichts gestaged - Abbruch.
    echo.
    goto MENU
)

set /p MSG="Commit-Nachricht (leer = 'update'): "
if "!MSG!"=="" set MSG=update

git commit -m "!MSG!"
if errorlevel 1 (
    echo [FEHLER] Commit fehlgeschlagen.
    echo.
    goto MENU
)
echo [OK] Commit erstellt.

:DO_PUSH
set PB=main
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set PB=%%b
echo [**] Push zu origin/!PB!...
git push --set-upstream origin "!PB!"
if errorlevel 1 (
    echo [!] Push abgelehnt - Remote hat neue Commits.
    set /p REBASE="    Automatisch pull + rebase + push? [j/n]: "
    if /i "!REBASE!"=="j" (
        git pull --rebase origin "!PB!"
        if errorlevel 1 (
            echo [FEHLER] Rebase fehlgeschlagen. Konflikte manuell loesen.
        ) else (
            git push --set-upstream origin "!PB!"
            if errorlevel 1 (
                echo [FEHLER] Push nach Rebase fehlgeschlagen.
            ) else (
                echo [OK] Push erfolgreich!
            )
        )
    )
) else (
    echo [OK] Push erfolgreich!
)
echo.
goto REFRESH

:: --------------------------------------------------------
:PULL
echo.
set PLB=main
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set PLB=%%b
echo [**] Pull von origin/!PLB!...
git pull origin "!PLB!"
if errorlevel 1 (
    echo [FEHLER] Pull fehlgeschlagen.
) else (
    echo [OK] Pull abgeschlossen.
)
echo.
goto REFRESH

:: --------------------------------------------------------
:BRANCH
echo.
echo ---- Branch / Remote --------------------------------------
git branch -a
echo.
set CURREMOTE=kein remote
for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set CURREMOTE=%%r
echo   Remote: !CURREMOTE!
echo.
echo   1) Branch wechseln
echo   2) Neuen Branch erstellen
echo   3) Remote-URL aendern (anderes Repo verbinden)
echo   4) Zurueck
echo.
set /p BACTION="Aktion: "

if "!BACTION!"=="1" (
    set /p BNAME="Branch-Name: "
    git checkout "!BNAME!"
    if errorlevel 1 (
        echo [FEHLER] Wechsel fehlgeschlagen.
    ) else (
        echo [OK] Gewechselt zu: !BNAME!
    )
)
if "!BACTION!"=="2" (
    set /p BNAME="Neuer Branch-Name: "
    git checkout -b "!BNAME!"
    if errorlevel 1 (
        echo [FEHLER] Erstellen fehlgeschlagen.
    ) else (
        echo [OK] Branch erstellt: !BNAME!
    )
)
if "!BACTION!"=="3" (
    echo.
    echo   Aktuelle URL: !CURREMOTE!
    set /p NEWURL="   Neue Remote-URL: "
    if "!NEWURL!"=="" (
        echo [!] Keine URL eingegeben - Abbruch.
    ) else (
        git remote get-url origin >nul 2>&1
        if errorlevel 1 (
            git remote add origin "!NEWURL!"
        ) else (
            git remote set-url origin "!NEWURL!"
        )
        if errorlevel 1 (
            echo [FEHLER] Remote konnte nicht gesetzt werden.
        ) else (
            echo [OK] Remote geaendert zu: !NEWURL!
        )
    )
)
echo.
goto REFRESH

:: --------------------------------------------------------
:FULLSYNC
echo.
echo ---- Vollsync (alles stagen + pushen) ---------------------
echo.
git add -A
echo [OK] Alle Dateien gestaged (.gitignore wird respektiert).
echo.
git status --short
echo.

set FS_STAGED=0
for /f %%s in ('git diff --cached --name-only 2^>nul ^| find /c /v ""') do set FS_STAGED=%%s
if "!FS_STAGED!"=="0" (
    echo [!] Nichts zu committen - alles bereits aktuell.
    set /p FPUSH="    Branch trotzdem pushen? [j/n]: "
    if /i "!FPUSH!"=="j" goto FS_PUSH
    goto MENU
)

set /p FMSG="Commit-Nachricht (leer = 'sync'): "
if "!FMSG!"=="" set FMSG=sync

git commit -m "!FMSG!"
if errorlevel 1 (
    echo [FEHLER] Commit fehlgeschlagen.
    echo.
    goto MENU
)
echo [OK] Commit erstellt.

:FS_PUSH
set FSB=main
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set FSB=%%b
echo [**] Push zu origin/!FSB!...
git push --set-upstream origin "!FSB!"
if errorlevel 1 (
    echo [!] Push abgelehnt - Remote hat neue Commits.
    set /p FSREBASE="    Automatisch pull + rebase + push? [j/n]: "
    if /i "!FSREBASE!"=="j" (
        git pull --rebase origin "!FSB!"
        if errorlevel 1 (
            echo [FEHLER] Rebase fehlgeschlagen. Konflikte manuell loesen.
        ) else (
            git push --set-upstream origin "!FSB!"
            if errorlevel 1 (
                echo [FEHLER] Push nach Rebase fehlgeschlagen.
            ) else (
                echo [OK] Vollsync abgeschlossen!
            )
        )
    )
) else (
    echo [OK] Vollsync abgeschlossen!
)
echo.
goto REFRESH

:: --------------------------------------------------------
:PURGE_HISTORY
echo.
echo ---- Datei aus gesamter History loeschen ------------------
echo.
echo   WARNUNG: Diese Aktion schreibt die komplette git-History
echo   neu und erfordert danach einen force-push. Nicht rueckgaengig!
echo   Wichtig: Token vorher in Discord Developer Portal invalidieren.
echo.
set /p PFILE="   Dateiname (z.B. .env): "
if "!PFILE!"=="" (
    echo [!] Kein Dateiname - Abbruch.
    echo.
    goto MENU
)
set /p PCONFIRM="   Sicher? History wird neu geschrieben. [ja/n]: "
if /i not "!PCONFIRM!"=="ja" (
    echo Abbruch.
    goto MENU
)
echo.
echo [**] Entferne !PFILE! aus der gesamten History...
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch !PFILE!" --prune-empty --tag-name-filter cat -- --all
if errorlevel 1 (
    echo [FEHLER] filter-branch fehlgeschlagen.
    echo.
    goto MENU
)
echo [OK] History bereinigt.
echo.
set /p PFPUSH="   Force-Push zu origin? [j/n]: "
if /i "!PFPUSH!"=="j" (
    set PHB=main
    for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set PHB=%%b
    git push origin "!PHB!" --force
    if errorlevel 1 (
        echo [FEHLER] Force-Push fehlgeschlagen.
    ) else (
        echo [OK] History auf GitHub aktualisiert. Datei ist entfernt.
    )
)
echo.
goto REFRESH

:: --------------------------------------------------------
:UNTRACK
echo.
echo ---- Datei aus Tracking entfernen -------------------------
echo.
echo   Tracked Dateien (Auswahl):
git ls-files --cached
echo.
echo   HINWEIS: Die Datei bleibt lokal erhalten, wird aber
echo   nicht mehr von git verfolgt. Danach committen + pushen.
echo.
set /p UFILE="   Dateiname (z.B. .env): "
if "!UFILE!"=="" (
    echo [!] Kein Dateiname - Abbruch.
    echo.
    goto MENU
)
git ls-files --cached "!UFILE!" | find /c /v "" > nul 2>&1
git rm --cached "!UFILE!" 2>nul
if errorlevel 1 (
    echo [FEHLER] Datei nicht im Tracking gefunden: !UFILE!
) else (
    echo [OK] !UFILE! wird nicht mehr getrackt.
    echo [!] Jetzt committen und pushen um die Aenderung zu speichern.
    set /p DOCOMMIT="    Direkt committen + pushen? [j/n]: "
    if /i "!DOCOMMIT!"=="j" (
        git commit -m "untrack !UFILE!"
        if errorlevel 1 (
            echo [FEHLER] Commit fehlgeschlagen.
        ) else (
            set UTB=main
            for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set UTB=%%b
            git push --set-upstream origin "!UTB!"
            if errorlevel 1 (
                echo [FEHLER] Push fehlgeschlagen.
            ) else (
                echo [OK] Fertig - !UFILE! ist nicht mehr im Repo.
            )
        )
    )
)
echo.
goto REFRESH

:: --------------------------------------------------------
:GITIGNORE
echo.
echo ---- .gitignore erstellen ---------------------------------

if exist .gitignore (
    echo [!] .gitignore existiert bereits.
    set /p OVERWRITE="    Ueberschreiben? [j/n]: "
    if /i not "!OVERWRITE!"=="j" goto MENU
)

(
echo # Build / Output
echo dist/
echo build/
echo out/
echo .output/
echo.
echo # Dependencies
echo node_modules/
echo .pnp
echo .yarn/
echo.
echo # Environment
echo .env
echo .env.local
echo .env.*.local
echo.
echo # Logs
echo *.log
echo npm-debug.log*
echo.
echo # OS
echo .DS_Store
echo Thumbs.db
echo desktop.ini
echo.
echo # IDE
echo .vscode/
echo .idea/
echo *.suo
echo *.user
echo.
echo # Tool-Dateien
echo ghflow.bat
echo PROJECT_MAP.md
echo CLAUDE.md
echo GEMINI.md
) > .gitignore

echo [OK] .gitignore erstellt.
echo.
goto MENU

:: --------------------------------------------------------
:END
echo Tschuess!
endlocal
pause
