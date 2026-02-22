/**
 * User Command - User-Infos anzeigen
 *
 * Subcommands:
 * - /user info - Stats und Wolpertinger anzeigen
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('User-Informationen')
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Zeige Stats und Wolpertinger eines Users')
        .addStringOption(option =>
          option
            .setName('username')
            .setDescription('Twitch/YouTube Username')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'info') {
      await handleInfo(interaction, client);
    }
  },

  async autocomplete(interaction, client) {
    const focusedValue = interaction.options.getFocused();

    // Discord-Username als Standard-Vorschlag
    const suggestions = [interaction.user.username];

    // Versuche User aus users.json zu laden
    try {
      const fs = require('fs');
      const config = client.userService.config;

      if (fs.existsSync(config.paths.usersJson)) {
        const usersData = JSON.parse(fs.readFileSync(config.paths.usersJson, 'utf8'));
        const usernames = Object.keys(usersData);

        // Filter basierend auf Eingabe
        const filtered = usernames
          .filter(name => name.toLowerCase().includes(focusedValue.toLowerCase()))
          .slice(0, 24);

        for (const username of filtered) {
          if (!suggestions.includes(username)) {
            suggestions.push(username);
          }
        }
      }
    } catch (err) {
      console.error('[User] Autocomplete-Fehler:', err);
    }

    const results = suggestions.slice(0, 25).map(name => ({
      name: name,
      value: name
    }));

    await interaction.respond(results);
  }
};

/**
 * /user info
 */
async function handleInfo(interaction, client) {
  const username = interaction.options.getString('username');

  await interaction.deferReply({ ephemeral: true });

  try {
    console.log(`[User] Lade User-Daten für ${username}...`);
    const userData = await client.userService.getUser(username);

    // Punkte formatieren (mit Tausender-Trennzeichen)
    const formatNumber = (num) => num.toLocaleString('de-DE');

    // Stats formatieren
    let info = `**User: ${username}**\n\n`;
    info += `**Stats:**\n`;
    info += `• Punkte: ${formatNumber(userData.stats.points || 0)}\n`;
    info += `• Donations: ${(userData.stats.totalDonated || 0).toFixed(2)}€\n`;
    info += `• Messages: ${formatNumber(userData.stats.messageCount || 0)}\n`;
    info += `• Level: ${userData.stats.level || 1}\n`;
    info += `• Monate Sub: ${userData.stats.monthsSub || 0}\n`;

    // Charakter-Bild generieren
    let characterImage = null;
    try {
      const imageGenerator = client.userService.getImageGenerator();
      const assetManager = client.userService.getAssetManager();

      console.log(`[User] Generiere Charakter-Bild für ${username}...`);
      characterImage = await imageGenerator.generateCharacter(userData.character, assetManager);
    } catch (err) {
      console.error('[User] Charakter-Bild-Generierung fehlgeschlagen:', err);
    }

    const replyOptions = {
      content: info,
      files: []
    };

    if (characterImage) {
      replyOptions.files.push({
        attachment: characterImage,
        name: `${username}-wolpertinger.png`
      });
    }

    await interaction.editReply(replyOptions);

    console.log(`[User] ✅ User-Info angezeigt: ${username}`);

  } catch (err) {
    console.error('[User] Info-Fehler:', err);
    await interaction.editReply({
      content: `❌ Fehler: ${err.message}`
    });
  }
}
