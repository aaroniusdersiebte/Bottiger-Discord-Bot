/**
 * Link Command - Discord↔Twitch/YouTube Account-Verknüpfung
 *
 * /link
 *
 * Flow:
 * 1. Generiert 6-stelligen Code
 * 2. User tippt !linkdiscord CODE im Twitch- oder YouTube-Chat
 * 3. Visualizer schreibt discord-links.json (discordId → chatUsername)
 * 4. Bot pollt und sendet DM-Bestätigung
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Verknüpfe deinen Discord mit deinem Twitch- oder YouTube-Account'),

  async execute(interaction, client) {
    const discordId = interaction.user.id;
    const als       = client.accountLinkService;

    // Bereits verknüpft?
    const currentLink = als.getTwitchUsername(discordId);
    if (currentLink) {
      return interaction.reply({
        content: `ℹ️ Dein Account ist bereits mit **${currentLink}** verknüpft.\nUm den Account zu ändern, nutze zuerst \`/unlink\`.`,
        ephemeral: true
      });
    }

    const { code, expiresAt } = als.createPendingLink(discordId);
    const expiresMin = Math.round((expiresAt - Date.now()) / 60000);

    await interaction.reply({
      content:
        `🔗 **Account-Verknüpfung**\n\n` +
        `Tippe folgenden Befehl im **Twitch- oder YouTube-Chat**:\n` +
        `\`\`\`!linkdiscord ${code}\`\`\`\n` +
        `Der Code läuft in **${expiresMin} Minuten** ab.`,
      ephemeral: true
    });

    console.log(`[Link] Pending Link erstellt: Discord ${discordId} (Code: ${code})`);

    // Hintergrund-Polling für DM-Bestätigung
    _pollForConfirmation(interaction.user, discordId, als);
  }
};

/**
 * Pollt discord-links.json alle 30s auf Bestätigung (max 10 Min)
 */
async function _pollForConfirmation(user, discordId, als) {
  let attempts = 0;
  const maxAttempts = 20;

  const check = async () => {
    attempts++;
    const linked = als.getTwitchUsername(discordId);

    if (linked) {
      try {
        await user.send(
          `✅ Dein Discord-Account wurde erfolgreich mit **${linked}** verknüpft!\n` +
          `Du kannst jetzt Punkte in SSP-Spielen einsetzen.`
        );
      } catch { /* DMs gesperrt */ }
      return;
    }

    if (attempts >= maxAttempts) {
      try {
        await user.send(
          `⏰ Link-Verifikation ist abgelaufen.\n` +
          `Führe \`/link\` erneut aus und tippe den Code im Chat.`
        );
      } catch { /* DMs gesperrt */ }
      return;
    }

    setTimeout(check, 30000);
  };

  setTimeout(check, 30000);
}
