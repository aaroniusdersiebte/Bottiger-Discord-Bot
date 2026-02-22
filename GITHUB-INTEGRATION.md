# GitHub Integration

## Übersicht

Die Doku-System-App bietet eine integrierte GitHub-Integration für Sync-Paare. Du kannst Änderungen direkt aus der App zu GitHub pushen.

## Setup

### 1. Git-Repository initialisieren

Für jedes Sync-Paar (Linux/Windows) musst du ein Git-Repository initialisieren:

```bash
# Im Linux-Verzeichnis
cd /root/dein-projekt
git init
git remote add origin https://github.com/username/repo.git

# Oder im Windows-Verzeichnis
cd /mnt/c/Users/username/projekt
git init
git remote add origin https://github.com/username/repo.git
```

### 2. Erste Commits

```bash
git add .
git commit -m "Initial commit"
git push -u origin main
```

### 3. Authentifizierung

#### Option A: HTTPS mit Personal Access Token (empfohlen)

1. Erstelle ein Personal Access Token auf GitHub:
   - Gehe zu GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Klicke auf "Generate new token (classic)"
   - Wähle die Scopes: `repo` (Full control of private repositories)
   - Generiere und kopiere den Token

2. Konfiguriere Git Credential Helper:
   ```bash
   git config --global credential.helper store
   ```

3. Beim nächsten Push wird dein Username und Token abgefragt (Token als Passwort):
   ```bash
   git push
   # Username: dein-github-username
   # Password: ghp_deinPersonalAccessToken
   ```

#### Option B: SSH-Authentifizierung

1. Generiere SSH-Schlüssel (falls noch nicht vorhanden):
   ```bash
   ssh-keygen -t ed25519 -C "deine-email@example.com"
   ```

2. Füge den Public Key zu GitHub hinzu:
   - Kopiere den Inhalt von `~/.ssh/id_ed25519.pub`
   - Gehe zu GitHub → Settings → SSH and GPG keys → New SSH key
   - Füge den Key ein

3. Verwende SSH-Remote-URL:
   ```bash
   git remote set-url origin git@github.com:username/repo.git
   ```

## Verwendung der Git-Buttons

In jedem Sync-Paar findest du zwei Git-Buttons:

- **🔼 Git Linux**: Pusht Änderungen aus dem Linux-Verzeichnis zu GitHub
- **🔼 Git Windows**: Pusht Änderungen aus dem Windows-Verzeichnis zu GitHub

### Was passiert beim Klick:

1. **Status-Check**: Prüft, ob es ein Git-Repository ist
2. **Änderungs-Check**: Prüft, ob es ungespeicherte Änderungen gibt
3. **Auto-Commit**: Führt automatisch `git add .` und `git commit` aus
4. **Push**: Pusht die Änderungen zum Remote-Repository (main branch)

### Fehlermeldungen

**"Kein Git-Repository"**
- Initialisiere das Repository mit `git init`

**"Kein Remote-Repository konfiguriert"**
- Füge ein Remote-Repository hinzu: `git remote add origin <url>`

**"Push-Fehler: ..."**
- Prüfe deine Git-Konfiguration und Authentifizierung
- Stelle sicher, dass du Push-Rechte für das Repository hast

## Best Practices

1. **Separate Repositories**: Verwende separate GitHub-Repositories für Linux und Windows, wenn die Inhalte unterschiedlich sind
2. **Sync vor Push**: Synchronisiere zuerst mit dem Sync-Button, dann pushe zu GitHub
3. **Branches**: Die App pusht immer zum `main` Branch. Für Feature-Branches verwende Git manuell
4. **Konflikte**: Löse Git-Konflikte manuell im Terminal

## Manuelles Git-Management

Für erweiterte Git-Operationen öffne das Terminal:

```bash
# Aktuelle Änderungen anzeigen
git status

# Commit-Historie anzeigen
git log

# Branch wechseln
git checkout feature-branch

# Pull von GitHub
git pull

# Konflikte lösen
git merge --abort  # Abbrechen
# oder
git add <konflikt-datei>
git commit
```

## Troubleshooting

### "Permission denied (publickey)"
- Prüfe deine SSH-Konfiguration
- Oder wechsle zu HTTPS mit Personal Access Token

### "Authentication failed"
- HTTPS: Aktualisiere deinen Personal Access Token
- SSH: Prüfe, ob dein SSH-Key zu GitHub hinzugefügt wurde

### "Updates were rejected"
- Jemand anders hat zum Repository gepusht
- Führe `git pull` aus, bevor du pushst

### "Not a git repository"
- Initialisiere das Repository mit `git init`
- Stelle sicher, dass du im richtigen Verzeichnis bist
