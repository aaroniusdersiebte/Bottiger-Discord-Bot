# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projektübersicht

Discord Bot für Stream Visualizer - ermöglicht Wolpertinger-Customization (TTS-Charakter-Anpassung), Stats-Abfragen und Verifizierung direkt aus Discord.

**Wichtiger Kontext:** Diese Codebase läuft in WSL, aber die Projekte werden nach Windows kopiert und dort gebuildet. Debugging findet in Windows statt, nicht in WSL.

## Entwicklungsumgebung

### Commands

```bash
# Dependencies installieren
npm install

# Bot starten
npm start

# Dev-Modus mit Auto-Reload
npm run dev

# Discord Commands registrieren (nach Änderungen an Commands)
npm run deploy
```

### Command-Registrierung

- Mit `DISCORD_GUILD_ID`: Commands sind sofort verfügbar (für Testing)
- Ohne `DISCORD_GUILD_ID`: Commands sind global, aber bis zu 1 Stunde Wartezeit

## Architektur

### Dual-Mode System

Der Bot unterstützt zwei Betriebsmodi:

1. **API-Mode**: Wenn Stream Visualizer läuft → Nutzt API-Endpoints (`/api/assets`, `/api/user/:username`, `/api/verify`)
2. **Standalone-Mode**: Wenn Visualizer aus ist → Direkter File-Access auf `users.json` und `pending-verifications.json`

**Automatische Modus-Erkennung:**
- `ModeDetector` (src/services/ModeDetector.js): Health-Check via API alle 60 Sekunden
- `UserService` (src/services/UserService.js): Wrapper der automatisch zwischen API und File-Access wechselt

### Service-Layer

**UserService** (src/services/UserService.js)
- Zentrale Service-Schicht für alle User- und Asset-Operationen
- Methoden: `getAssets()`, `getUser(username)`, `createVerificationCode(username, customization)`, `canCustomizeCharacter(username)`
- Automatisches Routing zwischen API-Mode und Standalone-Mode

**ApiClient** (src/services/ApiClient.js)
- Axios-Wrapper für Stream Visualizer API
- Endpoints: `/api/assets`, `/api/user/:username`, `/api/verify`, `/health`
- Auth: `X-API-Key` Header

**AssetManager** (src/services/AssetManager.js)
- Lädt Assets direkt aus dem Filesystem (für Standalone-Mode)
- Kategorien: `hintergrund`, `koerper`, `kopf`, `augen`, `hut`, `rahmen`, `mund`
- Caching: 5 Minuten

**ModeDetector** (src/services/ModeDetector.js)
- Erkennt ob Visualizer läuft via API-Health-Check
- Re-Check alle 60 Sekunden

### Command-System

**Command-Struktur:** Alle Commands in `src/commands/`
- Müssen exportieren: `data` (SlashCommandBuilder) und `execute(interaction, client)` Funktion
- Automatisches Laden beim Bot-Start

**Wolpertinger-Command** (src/commands/wolpertinger.js):
- `/wolpertinger customize`: 6-stufiger Auswahl-Prozess mit Select-Menus und Button-Bestätigung
- `/wolpertinger show`: Zeigt aktuellen Charakter und Stats
- Verwendet Message Component Collectors (5 Min Timeout)
- Cooldown: 24 Stunden pro User

### Konfiguration

**config.js** (src/config.js):
- Lädt `.env` via dotenv
- Strukturiert: `discord`, `api`, `paths`, `bot`

**Wichtige Umgebungsvariablen:**
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (optional)
- `API_URL`, `API_KEY` (muss mit Stream Visualizer übereinstimmen)
- `VISUALIZER_PATH`, `USERS_JSON_PATH`, `ASSETS_PATH`, `PENDING_VERIFICATIONS_PATH` (für Standalone-Mode)

### Client-Erweiterungen

Discord.js Client wird erweitert mit:
- `client.commands` (Collection): Alle geladenen Commands
- `client.apiClient` (ApiClient): Stream Visualizer API-Wrapper
- `client.userService` (UserService): Dual-Mode User-Verwaltung

## Wichtige Datenstrukturen

### User-Objekt (users.json)

```json
{
  "username": {
    "character": {
      "hintergrund": "asset.png",
      "koerper": "asset.png",
      "kopf": "asset.png",
      "augen": "asset.png",
      "hut": "asset.png",
      "rahmen": "asset.png",
      "mundFrames": ["frame1.png", "frame2.png"]
    },
    "stats": {
      "ttsCount": 0,
      "donationCount": 0,
      "totalDonated": 0,
      "subCount": 0,
      "points": 0,
      "lastCharacterCustomization": 0
    }
  }
}
```

### Pending Verification (pending-verifications.json)

```json
{
  "CODE123": {
    "code": "CODE123",
    "username": "username",
    "customizationData": { "hintergrund": "asset.png", ... },
    "createdAt": 1234567890,
    "expiresAt": 1234567890,
    "createdBy": "discord-bot"
  }
}
```

## Neue Commands hinzufügen

1. Erstelle `src/commands/deincommand.js`
2. Exportiere `data` (SlashCommandBuilder) und `execute(interaction, client)`
3. Nutze `client.userService` für User-Operationen
4. Nutze `client.apiClient` nur wenn du direkt API-Zugriff brauchst
5. Commands neu registrieren: `npm run deploy`
6. Bot neu starten: `npm start`

## Wolpertinger Customization Flow

1. User führt `/wolpertinger customize username:foo` aus
2. Cooldown-Check via `UserService.canCustomizeCharacter()`
3. Assets laden via `UserService.getAssets()` (API oder File)
4. 6 Schritte: Select-Menus für jede Kategorie (hintergrund, koerper, kopf, augen, hut, rahmen)
   - Option "Zufällig" für jede Kategorie
   - Message Component Collectors mit 5 Min Timeout
5. Bestätigungs-Buttons (✅ Bestätigen / ❌ Abbrechen)
6. Code-Generierung via `UserService.createVerificationCode()`
   - API-Mode: POST `/api/verify`
   - Standalone-Mode: Schreibt in `pending-verifications.json`
7. User erhält 6-stelligen Code mit 5 Min Ablaufzeit
8. User schreibt `!verify CODE` im Twitch/YouTube Chat
9. Stream Visualizer liest Code aus `pending-verifications.json` und wendet Customization an

## Discord.js Patterns

**Interaction Types:**
- `interaction.isChatInputCommand()`: Slash-Commands
- `interaction.isStringSelectMenu()`: Select-Menus
- `interaction.isButton()`: Buttons

**Deferring:**
- `interaction.deferReply({ ephemeral: true })`: Bei länger dauernden Operationen
- `interaction.editReply()`: Nach defer

**Message Component Collectors:**
```javascript
const collector = interaction.channel.createMessageComponentCollector({
  filter: i => i.user.id === userId && i.customId === 'my_id',
  time: 300000, // 5 Min
  max: 1
});
```

**Custom IDs:** Immer mit User-ID suffixen um Cross-User-Konflikte zu vermeiden
- Beispiel: `select_hintergrund_${userId}`, `confirm_${userId}`


<!-- ÜBERTRAG-IGNORE-PATTERNS -->
## Übertrag Sync - Ignorierte Dateien

Diese Dateien/Ordner werden vom Übertrag-Sync ignoriert:

**Immer ignoriert:**
- `[too-windows]`
- `docs`

<!-- /ÜBERTRAG-IGNORE-PATTERNS -->