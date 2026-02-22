/**
 * /sync-assets Command
 *
 * Synchronisiert Wolpertinger-Assets aus dem Filesystem
 * mit den entsprechenden Forum-Threads auf Discord.
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync-assets')
    .setDescription('Synchronisiert Wolpertinger-Assets mit dem Forum')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('kategorie')
        .setDescription('Nur eine bestimmte Kategorie syncen')
        .setRequired(false)
        .addChoices(
          { name: 'Hintergrund', value: 'hintergrund' },
          { name: 'Körper', value: 'koerper' },
          { name: 'Kopf', value: 'kopf' },
          { name: 'Augen', value: 'augen' },
          { name: 'Hut', value: 'hut' },
          { name: 'Rahmen', value: 'rahmen' },
        )
    ),

  async execute(interaction, client) {
    if (!client.assetSyncService) {
      return interaction.reply({
        content: '❌ AssetSync-Service nicht konfiguriert. Setze `ASSET_THREAD_*` in der .env.',
        ephemeral: true
      });
    }

    const kategorie = interaction.options.getString('kategorie');

    await interaction.deferReply({ ephemeral: true });

    try {
      const results = await client.assetSyncService.syncAll(kategorie);

      const embed = new EmbedBuilder()
        .setTitle('Asset-Sync Ergebnis')
        .setColor(0x00ff00)
        .setTimestamp();

      let totalAdded = 0;
      let totalRemoved = 0;
      let hasErrors = false;

      for (const [category, result] of Object.entries(results)) {
        if (result.error) {
          embed.addFields({ name: `❌ ${category}`, value: result.error, inline: false });
          hasErrors = true;
          continue;
        }

        const lines = [`Gesamt: **${result.total}** | Gepostet: **${result.posted}**`];

        if (result.added > 0) {
          lines.push(`✅ Neu: **${result.added}** (${result.newAssets.join(', ')})`);
        }
        if (result.removed > 0) {
          lines.push(`🗑️ Entfernt: **${result.removed}** (${result.removedAssets.join(', ')})`);
        }
        if (result.added === 0 && result.removed === 0) {
          lines.push('✅ Aktuell');
        }

        totalAdded += result.added;
        totalRemoved += result.removed;

        embed.addFields({ name: category, value: lines.join('\n'), inline: false });
      }

      if (Object.keys(results).length === 0) {
        embed.setDescription('Keine Kategorien konfiguriert. Setze `ASSET_THREAD_*` in der .env.');
        embed.setColor(0xffaa00);
      } else {
        embed.setDescription(`**+${totalAdded}** neu | **-${totalRemoved}** entfernt`);
        if (hasErrors) embed.setColor(0xffaa00);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[AssetSync] Sync fehlgeschlagen:', err);
      await interaction.editReply({ content: `❌ Sync fehlgeschlagen: ${err.message}` });
    }
  }
};
