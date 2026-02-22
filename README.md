# Stream Visualizer Discord Bot

Discord Bot für Stream Visualizer - ermöglicht Wolpertinger-Customization, Stats-Abfragen und mehr direkt aus Discord.

## Features

- **Wolpertinger Customization**: Passe deinen TTS-Charakter über Discord an
- **Stats & Punkte**: Zeige User-Statistiken und Punktestand
- **Verifizierung**: Sicheres Verifikationssystem via Live-Chat
- **Erweiterbar**: Modulare Architektur für zukünftige Features

## Voraussetzungen

- Node.js >= 18.0.0
- Stream Visualizer läuft mit aktivierter API
- Discord Bot erstellt (https://discord.com/developers/applications)

## Setup

### 1. Dependencies installieren

```bash
npm install
```

### 2. Discord Bot erstellen

1. Gehe zu https://discord.com/developers/applications
2. Klicke "New Application"
3. Gib einen Namen ein (z.B. "Stream Visualizer Bot")
4. Gehe zu "Bot" → "Add Bot"
5. Unter "Privileged Gateway Intents": Keine speziellen Intents nötig
6. Kopiere den **Token** (unter "TOKEN" → "Reset Token")
7. Kopiere die **Application ID** (unter "General Information" → "APPLICATION ID")

### 3. Bot zum Server einladen

1. Gehe zu "OAuth2" → "URL Generator"
2. Scopes: `bot`, `applications.commands`
3. Bot Permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`
4. Kopiere die generierte URL und öffne sie im Browser
5. Wähle deinen Server aus und autorisiere den Bot

### 4. Umgebungsvariablen konfigurieren

Erstelle `.env` Datei basierend auf `.env.example`:

```bash
cp .env.example .env
```

Fülle die Werte aus:

```env
# Discord Bot
DISCORD_TOKEN=dein-discord-bot-token
DISCORD_CLIENT_ID=deine-application-id
DISCORD_GUILD_ID=deine-server-id-optional

# Stream Visualizer API
API_URL=http://127.0.0.1:3000
API_KEY=45f8b6a0f46bcbcb15af0a7a227b181c0f1f9d05313dcb85738f2b38b61a7b09
```

**Hinweis:** Der `API_KEY` muss mit dem Key in `stream-visualizer/config/app-settings.json` übereinstimmen!

#### Guild-ID finden (optional, für Testing)

1. Discord: Einstellungen → Erweitert → Entwicklermodus aktivieren
2. Rechtsklick auf deinen Server → "Server-ID kopieren"
3. In `.env` einfügen als `DISCORD_GUILD_ID`

**Vorteile:**
- Guild-Commands sind sofort verfügbar (keine Wartezeit)
- Nur für Testing! Für Production sollten Commands global sein.

### 5. Commands registrieren

```bash
npm run deploy
```

**Guild-Commands** (mit DISCORD_GUILD_ID): Sofort verfügbar
**Globale Commands** (ohne DISCORD_GUILD_ID): Bis zu 1 Stunde Wartezeit

### 6. Bot starten

```bash
npm start
```

## Commands

### /wolpertinger customize

Passe deinen Wolpertinger-Charakter an.

**Parameter:**
- `username` (required): Dein Twitch/YouTube Username

**Ablauf:**
1. Wähle für jede Kategorie ein Asset aus (6 Schritte)
   - Hintergrund, Körper, Kopf, Augen, Hut, Rahmen
   - Option "Zufällig" für jede Kategorie
2. Bestätige deine Auswahl
3. Erhalte einen Verifizierungs-Code
4. Schreibe `!verify CODE` im Twitch/YouTube Chat
5. Charakter wird aktualisiert

**Cooldown:** 1x pro Tag

### /wolpertinger show

Zeige deinen aktuellen Wolpertinger und Stats.

**Parameter:**
- `username` (required): Twitch/YouTube Username

**Anzeigt:**
- Aktueller Charakter (alle Assets)
- TTS-Count
- Donations & Subs
- Punkte

## Entwicklung

### Dev-Modus (Auto-Reload)

```bash
npm run dev
```

### Neuen Command erstellen

1. Erstelle `src/commands/meincommand.js`:

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meincommand')
    .setDescription('Beschreibung'),

  async execute(interaction, client) {
    await interaction.reply('Hallo!');
  }
};
```

2. Commands neu registrieren:

```bash
npm run deploy
```

3. Bot neu starten:

```bash
npm start
```

### API-Client verwenden

Der API-Client ist verfügbar als `client.apiClient`:

```javascript
// In Command
const assets = await client.apiClient.getAssets();
const user = await client.apiClient.getUser('username');
const code = await client.apiClient.createVerificationCode('username', customization);
```

## Architektur

```
discord-bot/
├── src/
│   ├── index.js                    # Bot-Einstiegspunkt
│   ├── config.js                   # Zentrale Konfiguration
│   ├── deploy-commands.js          # Command-Registrierung
│   ├── commands/
│   │   └── wolpertinger.js         # Wolpertinger Command
│   ├── services/
│   │   └── ApiClient.js            # Stream Visualizer API-Wrapper
│   └── utils/                      # Hilfsfunktionen (zukünftig)
├── .env                            # Umgebungsvariablen (nicht in Git!)
├── .env.example                    # Template
├── package.json
└── README.md
```

## Troubleshooting

### Bot startet nicht

**Problem:** `DISCORD_TOKEN fehlt in .env`
- **Lösung:** Erstelle `.env` Datei mit Token

**Problem:** `Login fehlgeschlagen`
- **Lösung:** Token ist ungültig, regeneriere Token im Discord Developer Portal

### Commands nicht verfügbar

**Problem:** Commands erscheinen nicht in Discord
- **Lösung 1:** Warte bis zu 1 Stunde (globale Commands)
- **Lösung 2:** Nutze Guild-Commands für Testing (DISCORD_GUILD_ID setzen)
- **Lösung 3:** Bot vom Server kicken und neu einladen

### API-Fehler

**Problem:** `Stream Visualizer API nicht erreichbar`
- **Lösung:** Stream Visualizer läuft? API aktiviert in `app-settings.json`?
- **Lösung:** Port korrekt? (Standard: 3000)

**Problem:** `Ungültiger API-Key`
- **Lösung:** API_KEY in `.env` muss mit `config/app-settings.json` übereinstimmen

### Commands schlagen fehl

**Problem:** `Konnte Assets nicht abrufen`
- **Lösung:** Stream Visualizer läuft nicht oder API ist deaktiviert

**Problem:** `User nicht gefunden`
- **Lösung:** User muss erst einmal TTS verwenden, dann wird er erstellt

## Zukünftige Features

- [ ] ImageGenerator für Charakter-Preview (Canvas)
- [ ] `/points` Command - Punkte abfragen
- [ ] `/stats` Command - Detaillierte Statistiken
- [ ] `/leaderboard` Command - Top 10 User
- [ ] Admin-Commands (Punkte vergeben, etc.)
- [ ] Webhook-Notifications (Donations, Subs live in Discord)

## Lizenz

MIT
