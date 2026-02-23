/**
 * /ssp — Schere-Stein-Papier Herausforderung starten
 *
 * Flow:
 * 1. User führt /ssp aus
 * 2. Ephemeral UI: Waffenwahl + (wenn verifiziert) Punkte-Einsatz
 * 3. Bestätigen → offene Challenge im Battle-Channel
 * 4. Jemand nimmt an → wählt Waffe ephemeral → sofortiges Ergebnis
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ssp')
    .setDescription('Starte eine Schere-Stein-Papier Herausforderung'),

  async execute(interaction, client) {
    const gm = client.sspGameManager;
    const als = client.accountLinkService;
    const userId = interaction.user.id;

    if (gm.hasActiveGame(userId)) {
      return interaction.reply({ content: '❌ Du hast bereits ein aktives Spiel!', ephemeral: true });
    }

    const isLinked = als.isLinked(userId);
    const game = gm.createGame(userId, interaction.user.displayName, isLinked);
    const reply = gm.buildConfigMessage(game.id, isLinked);

    await interaction.reply({ ...reply, ephemeral: true });
  }
};
