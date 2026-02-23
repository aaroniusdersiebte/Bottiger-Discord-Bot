/**
 * SSPGameManager - Schere-Stein-Papier Battle-System
 *
 * States pro Game:
 *   configuring → posted → accepted → done
 *
 * Interaction-IDs:
 *   ssp_wc_${gameId}      StringSelect: Waffenwahl Challenger
 *   ssp_pts_${gameId}     StringSelect: Punkte-Einsatz Challenger
 *   ssp_confirm_${gameId} Button: Challenge öffentlich posten
 *   ssp_accept_${gameId}  Button: Offene Challenge annehmen
 *   ssp_wd_${gameId}      StringSelect: Waffenwahl Akzeptierender
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');

const WEAPONS = {
  scissors: { emoji: '✂️', label: 'Schere', beats: 'paper' },
  rock:     { emoji: '🪨', label: 'Stein',  beats: 'scissors' },
  paper:    { emoji: '📄', label: 'Papier', beats: 'rock' }
};

function resolveRound(p1, p2) {
  if (p1 === p2) return 'tie';
  if (WEAPONS[p1].beats === p2) return 'p1';
  return 'p2';
}

class SSPGameManager {
  constructor(client, config, accountLinkService) {
    this.client = client;
    this.config = config;
    this.als = accountLinkService;
    this.games = new Map();      // gameId -> game
    this.userGames = new Map();  // userId -> gameId
    this._counter = 0;
  }

  hasActiveGame(userId) {
    return this.userGames.has(userId);
  }

  createGame(challengerId, challengerName, isLinked) {
    const gameId = `${Date.now()}_${++this._counter}`;
    const game = {
      id: gameId,
      challengerId,
      challengerName,
      isLinked,
      points: 0,
      channelId: null,
      challengeMessage: null,
      state: 'configuring',
      p1Choice: null,
      challengedId: null,
      challengedName: null,
      p2Choice: null,
      timeout: null,
      createdAt: Date.now()
    };
    this.games.set(gameId, game);
    this.userGames.set(challengerId, gameId);

    // 10 min Konfigurierungs-Timeout
    game.timeout = setTimeout(() => this._cleanupGame(gameId), 10 * 60 * 1000);

    return game;
  }

  // ========== UI BUILDER ==========

  buildConfigMessage(gameId, isLinked) {
    const rows = [];

    // Waffenwahl
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ssp_wc_${gameId}`)
        .setPlaceholder('Wähle deine Waffe...')
        .addOptions([
          { label: '✂️ Schere', value: 'scissors' },
          { label: '🪨 Stein',  value: 'rock' },
          { label: '📄 Papier', value: 'paper' }
        ])
    ));

    // Punkte-Einsatz: nur für verifizierte User
    if (isLinked) {
      const pointsOptions = [];
      for (let i = 0; i <= 100; i += 10) {
        pointsOptions.push({
          label: i === 0 ? '0 – Kostenlos' : `${i} Punkte`,
          value: String(i),
          default: i === 0
        });
      }
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ssp_pts_${gameId}`)
          .setPlaceholder('Punkte-Einsatz...')
          .addOptions(pointsOptions)
      ));
    }

    // Confirm
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ssp_confirm_${gameId}`)
        .setLabel('Herausforderung senden')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚔️')
    ));

    const content = isLinked
      ? '**⚔️ Kampf konfigurieren**\nWähle deine Waffe und optional deinen Punkte-Einsatz.'
      : '**⚔️ Kampf konfigurieren**\nWähle deine Waffe.\n*Punkte-Kämpfe erfordern einen verknüpften Account → `/link`*';

    return { content, components: rows };
  }

  // ========== INTERACTION HANDLERS ==========

  async handleChallengerWeapon(interaction, gameId, choice) {
    const game = this.games.get(gameId);
    if (!game || game.state !== 'configuring') return;
    if (interaction.user.id !== game.challengerId) {
      return interaction.reply({ content: '❌ Das ist nicht deine Challenge!', ephemeral: true });
    }

    game.p1Choice = choice;
    await interaction.deferUpdate();
  }

  async handlePointsSelect(interaction, gameId, value) {
    const game = this.games.get(gameId);
    if (!game || game.state !== 'configuring') return;
    if (interaction.user.id !== game.challengerId) {
      return interaction.reply({ content: '❌ Das ist nicht deine Challenge!', ephemeral: true });
    }

    game.points = parseInt(value);
    await interaction.deferUpdate();
  }

  async handleConfirm(interaction, gameId) {
    const game = this.games.get(gameId);
    if (!game || game.state !== 'configuring') return;
    if (interaction.user.id !== game.challengerId) return;

    if (!game.p1Choice) {
      return interaction.reply({ content: '❌ Wähle erst eine Waffe!', ephemeral: true });
    }

    // Punkte-Check
    if (game.points > 0) {
      if (!this.als.hasEnoughPoints(game.challengerId, game.points)) {
        const pts = this.als.getPoints(game.challengerId);
        return interaction.reply({
          content: `❌ Nicht genug Punkte! Du hast **${pts}**, Einsatz: **${game.points}**.`,
          ephemeral: true
        });
      }
    }

    clearTimeout(game.timeout);
    game.state = 'posted';

    // Battle Channel ermitteln
    const battleChannelId = this.config.ssp?.battleChannelId;
    let channel;
    if (battleChannelId) {
      channel = await this.client.channels.fetch(battleChannelId).catch(() => null);
    }
    if (!channel) channel = interaction.channel;
    game.channelId = channel.id;

    const pointsText = game.points > 0
      ? `💰 **Einsatz: ${game.points} Punkte**`
      : '🆓 Kostenlose Runde';

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Kampfherausforderung!')
      .setDescription(
        `**${interaction.user.displayName}** sucht einen Gegner!\n\n${pointsText}\n\nWer nimmt die Herausforderung an?`
      )
      .setColor(game.points > 0 ? 0xffd700 : 0xff375f)
      .setFooter({ text: 'Läuft ab in 1 Stunde' });

    const msg = await channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ssp_accept_${gameId}`)
          .setLabel('⚔️ Annehmen')
          .setStyle(ButtonStyle.Success)
      )]
    });

    game.challengeMessage = msg;

    // 1h Timeout für offene Challenge
    game.timeout = setTimeout(() => this._handleTimeout(gameId), 60 * 60 * 1000);

    await interaction.update({
      content: `✅ Herausforderung gesendet! Deine Waffe: ${WEAPONS[game.p1Choice].emoji}\n*Warte auf einen Gegner...*`,
      components: []
    });
  }

  async handleAccept(interaction, gameId) {
    const game = this.games.get(gameId);
    if (!game || game.state !== 'posted') {
      return interaction.reply({ content: '❌ Diese Challenge ist nicht mehr aktiv.', ephemeral: true });
    }

    const userId = interaction.user.id;

    // Eigene Challenge ablehnen
    if (userId === game.challengerId) {
      return interaction.reply({ content: '❌ Du kannst nicht deine eigene Herausforderung annehmen.', ephemeral: true });
    }

    // Bereits im Spiel?
    if (this.userGames.has(userId)) {
      return interaction.reply({ content: '❌ Du bist bereits in einem aktiven Spiel.', ephemeral: true });
    }

    // Punkte-Checks
    if (game.points > 0) {
      if (!this.als.isLinked(userId)) {
        return interaction.reply({
          content: '❌ Nur verifizierte User können Punkte-Kämpfe mitmachen.\nNutze `/link` um deinen Account zu verknüpfen.',
          ephemeral: true
        });
      }
      if (!this.als.hasEnoughPoints(userId, game.points)) {
        const pts = this.als.getPoints(userId);
        return interaction.reply({
          content: `❌ Nicht genug Punkte! Du hast **${pts}**, Einsatz: **${game.points}**.`,
          ephemeral: true
        });
      }
    }

    // Challenge claimen
    clearTimeout(game.timeout);
    game.state = 'accepted';
    game.challengedId = userId;
    game.challengedName = interaction.user.displayName;
    this.userGames.set(userId, gameId);

    // Accept-Button deaktivieren
    await game.challengeMessage.edit({
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ssp_accept_${gameId}`)
          .setLabel('⚔️ Wird ausgefochten...')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )]
    }).catch(() => {});

    const pointsText = game.points > 0 ? ` um **${game.points} Punkte**` : '';

    await interaction.reply({
      content: `⚔️ Du kämpfst gegen **${game.challengerName}**${pointsText}!\nWähle deine Waffe:`,
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ssp_wd_${gameId}`)
          .setPlaceholder('Wähle deine Waffe...')
          .addOptions([
            { label: '✂️ Schere', value: 'scissors' },
            { label: '🪨 Stein',  value: 'rock' },
            { label: '📄 Papier', value: 'paper' }
          ])
      )],
      ephemeral: true
    });

    // 5 min Timeout für Waffenwahl
    game.timeout = setTimeout(() => this._handleTimeout(gameId), 5 * 60 * 1000);
  }

  async handleChallengedWeapon(interaction, gameId, choice) {
    const game = this.games.get(gameId);
    if (!game || game.state !== 'accepted') return;
    if (interaction.user.id !== game.challengedId) return;

    clearTimeout(game.timeout);
    game.p2Choice = choice;
    game.state = 'done';

    const result = resolveRound(game.p1Choice, game.p2Choice);
    const w1 = WEAPONS[game.p1Choice];
    const w2 = WEAPONS[game.p2Choice];

    let resultLine, color;
    let winnerId = null, loserId = null;
    let transferResult = null;

    if (result === 'tie') {
      resultLine = `🤝 **Unentschieden!** Beide wählten ${w1.emoji} ${w1.label}.`;
      color = 0xffa500;
    } else if (result === 'p1') {
      winnerId = game.challengerId;
      loserId = game.challengedId;
      resultLine = `🏆 **${game.challengerName}** gewinnt! ${w1.emoji} schlägt ${w2.emoji}`;
      color = 0xff375f;
    } else {
      winnerId = game.challengedId;
      loserId = game.challengerId;
      resultLine = `🏆 **${game.challengedName}** gewinnt! ${w2.emoji} schlägt ${w1.emoji}`;
      color = 0xff375f;
    }

    if (game.points > 0 && winnerId) {
      transferResult = this.als.transferPoints(winnerId, loserId, game.points);
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Schere-Stein-Papier — Ergebnis')
      .setDescription(
        `**${game.challengerName}** ${w1.emoji} **vs** ${w2.emoji} **${game.challengedName}**\n\n${resultLine}`
      )
      .setColor(color);

    if (transferResult && winnerId) {
      const winnerName = winnerId === game.challengerId ? game.challengerName : game.challengedName;
      embed.addFields({ name: '💰 Punkte', value: `**${winnerName}** erhält **${transferResult.actualAmount} Punkte**!` });
    }

    // Challenge-Nachricht löschen, Ergebnis posten
    await game.challengeMessage.delete().catch(() => {});

    try {
      const channel = await this.client.channels.fetch(game.channelId);
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[SSP] Ergebnis-Post fehlgeschlagen:', err.message);
    }

    // Visualizer API (nicht kritisch)
    this._tryPostBattle(game, result, transferResult).catch(() => {});

    const personalResult = result === 'tie'
      ? '🤝 Unentschieden!'
      : result === 'p2'
        ? `🏆 Du hast gewonnen!${transferResult ? ` +${transferResult.actualAmount} Punkte` : ''}`
        : `😢 Du hast verloren.${game.points > 0 ? ` -${game.points} Punkte` : ''}`;

    await interaction.update({ content: personalResult, components: [] });

    this._cleanupGame(gameId);
    console.log(`[SSP] Spiel ${gameId} beendet: ${result}`);
  }

  // ========== TIMEOUT / CLEANUP ==========

  async _handleTimeout(gameId) {
    const game = this.games.get(gameId);
    if (!game) return;

    if (game.state === 'posted' && game.challengeMessage) {
      const embed = new EmbedBuilder()
        .setTitle('⏰ Challenge Abgelaufen')
        .setDescription('Keine Gegner gefunden (5 Minuten Timeout).')
        .setColor(0x666666);
      await game.challengeMessage.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    this._cleanupGame(gameId);
    console.log(`[SSP] Spiel ${gameId} durch Timeout beendet`);
  }

  _cleanupGame(gameId) {
    const game = this.games.get(gameId);
    if (!game) return;
    clearTimeout(game.timeout);
    this.userGames.delete(game.challengerId);
    if (game.challengedId) this.userGames.delete(game.challengedId);
    this.games.delete(gameId);
  }

  // ========== API POST ==========

  async _tryPostBattle(game, result, transferResult) {
    try {
      const mode = await this.client.userService?.modeDetector?.getCurrentMode?.();
      if (mode !== 'api') return;

      const twitchC = this.als.getTwitchUsername(game.challengerId) || game.challengerName;
      const twitchD = this.als.getTwitchUsername(game.challengedId) || game.challengedName;

      const payload = {
        player1: { discordUsername: game.challengerName, twitchUsername: twitchC, choice: game.p1Choice },
        player2: { discordUsername: game.challengedName, twitchUsername: twitchD, choice: game.p2Choice },
        result,
        pointsWon: transferResult?.actualAmount || 0,
        winner: result === 'p1' ? twitchC : result === 'p2' ? twitchD : null
      };

      await this.client.apiClient.post('/api/ssp/battle', payload);
    } catch { /* not critical */ }
  }
}

module.exports = SSPGameManager;
