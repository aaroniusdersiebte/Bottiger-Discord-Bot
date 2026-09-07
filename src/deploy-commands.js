/**
 * Deploy Commands - Registriert Slash-Commands bei Discord.
 *
 * Aufruf:
 *   node src/deploy-commands.js       (direkt, npm run deploy)
 *   node src/index.js --deploy        (von Zappify getriggert)
 *
 * Guild-only wenn DISCORD_GUILD_ID gesetzt (sofort aktiv), sonst global.
 */

const { REST, Routes } = require('discord.js');
const config = require('./config');
const botProfile = require('./botProfile');
const commandRegistry = require('./commands/_registry');

// /docs + /sync-assets sind reine Aaronius-Produkt-Infra
const CUSTOMER_EXCLUDED = new Set(['docs.js', 'sync-assets.js']);

/**
 * Sammelt und registriert alle Commands.
 * @returns {Promise<number>} Anzahl registrierter Commands
 */
async function run() {
  const commands = [];
  console.log('[Deploy] Sammle Commands...');
  for (const { file, command } of commandRegistry) {
    if (botProfile.isCustomer && CUSTOMER_EXCLUDED.has(file)) continue;
    if ('data' in command) {
      commands.push(command.data.toJSON());
      console.log(`[Deploy] ✅ ${file} -> /${command.data.name}`);
    } else {
      console.warn(`[Deploy] ⚠️ ${file} fehlt 'data'`);
    }
  }
  console.log(`[Deploy] ${commands.length} Commands gesammelt\n`);

  if (!config.discord.token || !config.discord.clientId) {
    throw new Error('DISCORD_TOKEN / DISCORD_CLIENT_ID fehlen');
  }

  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  if (config.discord.guildId) {
    console.log(`[Deploy] Registriere Guild-Commands (${config.discord.guildId}) - sofort aktiv`);
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );
    console.log(`[Deploy] ✅ ${commands.length} Guild-Commands registriert`);
  } else {
    console.log('[Deploy] Registriere globale Commands (bis zu 1 Stunde bis sichtbar)');
    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands }
    );
    console.log(`[Deploy] ✅ ${commands.length} globale Commands registriert`);
  }

  return commands.length;
}

module.exports = { run };

// Direktaufruf (npm run deploy)
if (require.main === module) {
  run()
    .then(() => { console.log('\n[Deploy] 🚀 Fertig!\n'); process.exit(0); })
    .catch((error) => {
      console.error('[Deploy] ❌ Fehler:', error.message || error);
      if (error.code === 50001) console.error('[Deploy] Missing Access - Bot nicht auf dem Server?');
      else if (error.code === 10004) console.error('[Deploy] Unknown Guild - DISCORD_GUILD_ID ungültig');
      process.exit(1);
    });
}
