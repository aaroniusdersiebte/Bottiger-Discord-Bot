/**
 * /docs Command
 *
 * Subcommands:
 * - sync: Synct alle Markdown-Docs zu Discord
 * - summary: Generiert Kurzfassung aller Commands für Stream-Beschreibung
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('docs')
    .setDescription('Dokumentations-Verwaltung')
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Synct alle Docs zu Discord')
        .addBooleanOption(option =>
          option
            .setName('force')
            .setDescription('Force-Repost: Löscht alte Threads und erstellt alles neu')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('summary')
        .setDescription('Generiert Kurzfassung aller Commands für Stream-Beschreibung')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'sync') {
      await handleSync(interaction, client);
    } else if (subcommand === 'summary') {
      await handleSummary(interaction, client);
    }
  }
};

/**
 * Synct alle Docs zu Discord
 */
async function handleSync(interaction, client) {
  const force = interaction.options.getBoolean('force') || false;

  await interaction.deferReply({ ephemeral: true });

  try {
    console.log(`[Docs] Sync gestartet von ${interaction.user.tag} (force: ${force})`);

    const result = await client.docsService.syncToChannel(client, force);

    // Ergebnis formatieren
    let response = `✅ **Docs-Sync abgeschlossen**\n\n`;
    response += `📊 **Statistik:**\n`;
    response += `• Erfolgreich: ${result.success}\n`;
    response += `• Fehlgeschlagen: ${result.failed}\n\n`;

    if (result.features && result.features.length > 0) {
      response += `📄 **Features:**\n`;
      for (const feature of result.features) {
        const status = feature.status === 'success' ? '✅' : '❌';
        response += `${status} ${feature.name} → ${feature.category}\n`;
      }
    }

    await interaction.editReply(response);

  } catch (err) {
    console.error('[Docs] Sync-Fehler:', err);
    await interaction.editReply(`❌ **Sync fehlgeschlagen**\n\n\`\`\`${err.message}\`\`\``);
  }
}

/**
 * Generiert Kurzfassung für Stream-Beschreibung
 */
async function handleSummary(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const summary = client.docsService.generateStreamSummary();

    if (!summary || summary === 'Keine Commands gefunden.') {
      await interaction.editReply('❌ Keine Commands mit `type: command` gefunden.\n\nStelle sicher, dass deine Markdown-Files im Frontmatter `type: command` haben.');
      return;
    }

    // Discord hat ein 2000 Zeichen Limit für Messages
    if (summary.length > 1900) {
      // In mehrere Messages aufteilen
      const chunks = splitIntoChunks(summary, 1900);

      await interaction.editReply(`📋 **Stream-Beschreibung** (${chunks.length} Teile)\n\nKopiere den Text aus den folgenden Code-Blöcken:`);

      for (let i = 0; i < chunks.length; i++) {
        await interaction.followUp({
          content: `**Teil ${i + 1}/${chunks.length}:**\n\`\`\`\n${chunks[i]}\n\`\`\``,
          ephemeral: true
        });
      }
    } else {
      await interaction.editReply(`📋 **Stream-Beschreibung**\n\nKopiere den Text aus dem Code-Block:\n\`\`\`\n${summary}\n\`\`\``);
    }

  } catch (err) {
    console.error('[Docs] Summary-Fehler:', err);
    await interaction.editReply(`❌ **Fehler beim Generieren**\n\n\`\`\`${err.message}\`\`\``);
  }
}

/**
 * Teilt Text in Chunks auf
 */
function splitIntoChunks(text, maxLength) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
