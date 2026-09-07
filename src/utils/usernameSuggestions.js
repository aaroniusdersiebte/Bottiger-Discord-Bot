/**
 * Username-Vorschlaege fuer Slash-Command-Autocomplete.
 *
 * Kunden-Modus: ueber die Zappify-API (GET /api/usernames). Ist Zappify aus,
 * bleibt nur der eigene Discord-Name.
 * Playground: zusaetzlich direkter users.db-Lookup (Substring), falls die API
 * gerade nichts liefert.
 */

const botProfile = require('../botProfile');

async function buildUsernameSuggestions(interaction, client, focusedValue) {
  const query = String(focusedValue || '').toLowerCase();
  const suggestions = [interaction.user.username];

  try {
    const fromApi = await client.apiClient.searchUsernames(query, 24);
    for (const name of fromApi) {
      if (!suggestions.includes(name)) suggestions.push(name);
    }
  } catch (err) {
    console.error('[Autocomplete] API-Lookup fehlgeschlagen:', err.message);
  }

  // Playground-Fallback: direkter DB-Lookup
  if (botProfile.isPlayground && suggestions.length <= 1) {
    try {
      const fs = require('fs');
      const config = client.userService.config;
      if (config.paths.usersDb && fs.existsSync(config.paths.usersDb)) {
        const Database = require('better-sqlite3');
        const db = new Database(config.paths.usersDb, { readonly: true });
        const rows = db.prepare('SELECT username FROM users WHERE username LIKE ? LIMIT 24').all(`%${query}%`);
        db.close();
        for (const row of rows) {
          if (!suggestions.includes(row.username)) suggestions.push(row.username);
        }
      }
    } catch (err) {
      console.error('[Autocomplete] DB-Fallback fehlgeschlagen:', err.message);
    }
  }

  return suggestions;
}

module.exports = { buildUsernameSuggestions };
