/**
 * Deploy Commands - Registriert Slash-Commands bei Discord
 *
 * Verwendung:
 * npm run deploy
 *
 * Registriert Commands entweder:
 * - Global (alle Server, dauert bis zu 1 Stunde)
 * - Guild-only (ein Server, sofort aktiv - für Testing)
 */

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Commands sammeln
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('[Deploy] Sammle Commands...');

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('data' in command) {
    commands.push(command.data.toJSON());
    console.log(`[Deploy] ✅ Command gefunden: /${command.data.name}`);
  } else {
    console.warn(`[Deploy] ⚠️ Command ${file} fehlt 'data' Property`);
  }
}

console.log(`[Deploy] ${commands.length} Commands gesammelt\n`);

// REST-Client erstellen
const rest = new REST({ version: '10' }).setToken(config.discord.token);

// Deployment-Funktion
(async () => {
  try {
    console.log('[Deploy] Starte Deployment...\n');

    // Guild-only oder Global?
    if (config.discord.guildId) {
      // Guild-only (schnell, für Testing)
      console.log(`[Deploy] Registriere Commands für Guild: ${config.discord.guildId}`);
      console.log('[Deploy] (Guild-Commands sind sofort verfügbar)\n');

      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );

      console.log(`[Deploy] ✅ ${commands.length} Guild-Commands erfolgreich registriert!`);
    } else {
      // Global (langsam, bis zu 1 Stunde)
      console.log('[Deploy] Registriere Commands global (alle Server)');
      console.log('[Deploy] ⚠️ Kann bis zu 1 Stunde dauern!\n');

      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );

      console.log(`[Deploy] ✅ ${commands.length} globale Commands erfolgreich registriert!`);
      console.log('[Deploy] ⚠️ Commands sind in bis zu 1 Stunde verfügbar.');
    }

    console.log('\n[Deploy] 🚀 Deployment abgeschlossen!\n');

  } catch (error) {
    console.error('[Deploy] ❌ Fehler beim Registrieren der Commands:', error);

    if (error.code === 50001) {
      console.error('[Deploy] ❌ Missing Access: Bot hat keine Berechtigung für diesen Server!');
    } else if (error.code === 10004) {
      console.error('[Deploy] ❌ Unknown Guild: Guild-ID ist ungültig!');
    } else if (error.rawError?.message?.includes('token')) {
      console.error('[Deploy] ❌ Ungültiger Token! Prüfe DISCORD_TOKEN in .env');
    }

    process.exit(1);
  }
})();
