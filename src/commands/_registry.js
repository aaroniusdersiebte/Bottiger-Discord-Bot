/**
 * Statisches Command-Verzeichnis.
 *
 * esbuild kann `fs.readdirSync(commandsPath)` + dynamisches `require()` nicht
 * buendeln - deshalb werden alle Commands hier explizit aufgezaehlt. Neue
 * Commands hier eintragen (und in der Befehls-Uebersicht in visual).
 *
 * `file` bleibt fuer den Kunden-Filter (docs / sync-assets = Aaronius-Infra).
 */

module.exports = [
  { file: 'bingo.js', command: require('./bingo') },
  { file: 'docs.js', command: require('./docs') },
  { file: 'leaderboard.js', command: require('./leaderboard') },
  { file: 'link.js', command: require('./link') },
  { file: 'ssp.js', command: require('./ssp') },
  { file: 'sync-assets.js', command: require('./sync-assets') },
  { file: 'user.js', command: require('./user') },
  { file: 'wolpertinger.js', command: require('./wolpertinger') },
];
