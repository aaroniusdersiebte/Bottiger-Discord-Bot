/**
 * User Command - User-Infos anzeigen
 *
 * Subcommands:
 * - /user info - Stats und Wolpertinger anzeigen
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildUsernameSuggestions } = require('../utils/usernameSuggestions');

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
    const suggestions = await buildUsernameSuggestions(interaction, client, focusedValue);
    await interaction.respond(suggestions.slice(0, 25).map((name) => ({ name, value: name })));
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

    const stats = userData.stats || {};

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle(`👤 ${username}`)
      // Datenschutz: keine Spendenbeträge/Geld-Daten im Discord (auch nicht ephemeral)
      .addFields(
        { name: '💰 Punkte', value: formatNumber(stats.points || 0), inline: true },
        { name: '⭐ Level', value: `${stats.level || 1}`, inline: true },
        { name: '🧬 Total XP', value: formatNumber(stats.totalXP || 0), inline: true },
        { name: '💬 Messages', value: formatNumber(stats.messageCount || 0), inline: true },
        { name: '🎗️ Monate Sub', value: `${stats.monthsSub || 0}`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Angefragt von ${interaction.user.username}` });

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

    const replyOptions = { embeds: [embed], files: [] };

    if (characterImage) {
      const fileName = `${username}-wolpertinger.png`;
      replyOptions.files.push({ attachment: characterImage, name: fileName });
      embed.setImage(`attachment://${fileName}`);
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
