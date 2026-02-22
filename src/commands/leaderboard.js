/**
 * Leaderboard Command - Manuelles Leaderboard-Management
 *
 * Nur für Administratoren
 * Ermöglicht manuelles Aktualisieren der Leaderboards
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Leaderboard verwalten (Admin-Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('refresh')
        .setDescription('Leaderboards manuell aktualisieren')
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    try {
      await client.leaderboardService.updateLeaderboards();
      await interaction.editReply('✅ Leaderboards aktualisiert!');
    } catch (err) {
      await interaction.editReply(`❌ Fehler: ${err.message}`);
    }
  }
};
