# Streamerbot Integration

## ✅ Verwendung von Native Events (AKTUELL)

**Seit Version 1.0.0** nutzt Stream Visualizer die **nativen Streamerbot-Events** direkt über WebSocket.

**Das bedeutet:**
- ❌ **KEINE C# Actions mehr nötig!**
- ✅ Streamerbot sendet Events automatisch (ChatMessage, Follow, Sub, etc.)
- ✅ Stream Visualizer empfängt sie direkt
- ✅ Einfacher, schneller, weniger fehleranfällig

## 📋 Setup

### 1. WebSocket Server in Streamerbot aktivieren

1. Öffne **Streamerbot**
2. Gehe zu **Settings** → **Servers** → **WebSocket Server**
3. Aktiviere:
   - **Auto Start**: ✅
   - **Host**: `127.0.0.1`
   - **Port**: `8080` (oder wie in Stream Visualizer konfiguriert)
4. Klicke auf **Start Server**

### 2. Stream Visualizer starten

Stream Visualizer verbindet sich automatisch und subscribed für:
- **Twitch**: ChatMessage, Follow, Sub, ReSub, GiftSub, Raid
- **YouTube**: Message, SuperChat, Subscription, MemberMilestone

**Fertig!** Keine weiteren Schritte nötig! 🎉

## 🔍 Unterstützte Events

### Aktuell implementiert:
- ✅ `Twitch.ChatMessage` → Chat-Nachrichten im Overlay
- ✅ `YouTube.Message` → YouTube-Chat

### Geplant (einfach zu erweitern):
- 🔜 `Twitch.Follow` → Follow-Alerts
- 🔜 `Twitch.Sub` / `ReSub` / `GiftSub` → Sub-Alerts
- 🔜 `Twitch.Raid` → Raid-Visualisierung

## 📝 Neue Events hinzufügen

Wenn du neue Streamerbot-Events nutzen möchtest:

### 1. Subscribe in `StreamerbotClient.js` erweitern:

```javascript
events: {
  'Twitch': ['ChatMessage', 'Follow', 'Sub', 'YourNewEvent'],
  ...
}
```

### 2. Event-Mapping in `convertEvent()` hinzufügen:

```javascript
if (source === 'Twitch' && type === 'Follow') {
  return {
    type: 'follow',
    user: { ... },
    data: { ... }
  };
}
```

### 3. Im Modul verarbeiten:

```javascript
onEvent(event) {
  if (event.type === 'follow') {
    this._handleFollow(event);
  }
}
```

**Fertig!** Keine C# Actions nötig! 🚀

## ❌ Alte C# Actions (DEPRECATED)

Die C# Actions (`ChatMessageAction.cs`, `DeathCommandAction.cs`, etc.) wurden entfernt, da sie **nicht mehr benötigt werden**.

**Warum?**
- Native Events sind einfacher und zuverlässiger
- Kein doppeltes Event-Handling mehr
- Keine Probleme mit JSON-Serialisierung
- Direkter Zugriff auf alle Streamerbot-Daten

**Falls du alte C# Actions in Streamerbot hast:**
→ Deaktiviere oder lösche sie. Sie werden nicht mehr benötigt!

## 🐛 Troubleshooting

### Problem: Keine Events kommen an

**Prüfe:**
1. ✅ Streamerbot WebSocket Server läuft (`Settings → Servers → WebSocket Server`)
2. ✅ Port stimmt überein (Standard: 8080)
3. ✅ Stream Visualizer zeigt "Verbunden" im Control Panel
4. ✅ Firewall blockiert nicht Port 8080

### Problem: Control Panel zeigt "Getrennt"

**Lösung:**
1. Prüfe `config/app-settings.json`:
   ```json
   {
     "streamerbot": {
       "host": "127.0.0.1",
       "port": 8080,
       "autoConnect": true
     }
   }
   ```
2. Starte Stream Visualizer neu

### Problem: Alte C# Actions senden noch Daten

**Lösung:**
→ Deaktiviere oder lösche die alten C# Actions in Streamerbot!

## 📚 Weitere Infos

- **Streamerbot Docs**: https://docs.streamer.bot/
- **Event Schema**: Siehe `docs/EVENT_SCHEMA.md`
- **Projekt-Dokumentation**: Siehe `CLAUDE.md`
