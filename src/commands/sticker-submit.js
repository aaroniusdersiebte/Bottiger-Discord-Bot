/**
 * /sticker-submit - Community reicht ein Bild als Gesichts-Sticker ein (Zappify-Modul
 * "Gesichts-Sticker": Zuschauer setzen dem Streamer per !sticker etwas aufs Gesicht).
 *
 * Laeuft immer ueber die App-seitige Freigabe (Kontrollzentrum -> Discord-Bot ->
 * Bild-Freigaben), unabhaengig vom imageReview.mode-Umschalter. Nach Freigabe landet
 * das Bild in der Sticker-Bibliothek (FaceStickerModule.addSticker). Felder an die API:
 * command = Sticker-Name, category = Slot (head|eyes|nose|mouth).
 */
const { SlashCommandBuilder } = require('discord.js');
const { validateImage } = require('../utils/ImageValidator');
const downloadImage = require('../utils/downloadImage');

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticker-submit')
    .setDescription('Reiche ein Bild als Gesichts-Sticker fuer den Stream ein')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name des Stickers (wird zum !sticker-Befehlswort)')
        .setRequired(true)
        .setMaxLength(40)
    )
    .addStringOption((option) =>
      option
        .setName('platz')
        .setDescription('Wo sitzt der Sticker im Gesicht?')
        .setRequired(true)
        .addChoices(
          { name: 'Kopf (Hut, Krone ...)', value: 'head' },
          { name: 'Augen (Brille ...)', value: 'eyes' },
          { name: 'Nase', value: 'nose' },
          { name: 'Mund (Bart, Zunge ...)', value: 'mouth' },
        )
    )
    .addAttachmentOption((option) =>
      option
        .setName('bild')
        .setDescription('Freigestelltes Bild, am besten PNG mit Transparenz (max 5MB)')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const restrictChannel = client.config.stickerSubmit?.channelId;
    if (restrictChannel && interaction.channelId !== restrictChannel) {
      await interaction.reply({
        content: `❌ Bitte \`/sticker-submit\` im dafür vorgesehenen Channel <#${restrictChannel}> nutzen.`,
        ephemeral: true,
      });
      return;
    }

    const name = interaction.options.getString('name');
    const slot = interaction.options.getString('platz');
    const attachment = interaction.options.getAttachment('bild');

    if (attachment.size > MAX_SIZE) {
      await interaction.reply({
        content: `❌ Datei zu groß (${(attachment.size / 1024 / 1024).toFixed(1)}MB, max ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB).`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let buffer;
    try {
      buffer = await downloadImage(attachment.url);
    } catch (err) {
      console.error('[StickerSubmit] Download-Fehler:', err);
      await interaction.editReply({ content: '❌ Konnte das Bild nicht herunterladen. Bitte erneut versuchen.' });
      return;
    }

    const validation = validateImage(buffer, MAX_SIZE);
    if (!validation.valid) {
      await interaction.editReply({ content: `❌ Ungültiges Bild: ${validation.error}` });
      return;
    }

    try {
      await client.apiClient.submitPendingImage({
        type: 'face-sticker',
        imageUrl: attachment.url,
        discordUserId: interaction.user.id,
        discordTag: interaction.user.tag,
        command: name,
        category: slot,
      });
    } catch (err) {
      await interaction.editReply({ content: `❌ ${err.message}` });
      return;
    }

    await interaction.editReply({
      content: `✅ Sticker **${name}** eingereicht! Ein Mod prüft ihn im Kontrollzentrum, du bekommst eine DM sobald entschieden wurde.`,
    });
    console.log(`[StickerSubmit] Einreichung von ${interaction.user.tag}: ${name} (${slot})`);
  },
};
