/**
 * BingoImageGenerator - rendert Bingo-Karten als Bild.
 *
 * Seit der /public-Auslieferung hat der Bot KEIN eigenes `canvas` mehr: das
 * Rendering laeuft in Zappify (POST /api/bingo/render). Duenner API-Wrapper mit
 * unveraenderter Schnittstelle, damit die Aufrufer (commands/bingo.js,
 * services/BingoService.js) gleich bleiben.
 */

class BingoImageGenerator {
  /**
   * @param {import('./ApiClient')} apiClient
   */
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  /**
   * @param {Array<Array<{id:string,text:string}>>} card
   * @param {string[]} [markedEvents]
   * @param {string[]} [verifiedEvents]
   * @returns {Promise<Buffer>} PNG-Buffer
   */
  async generate(card, markedEvents = [], verifiedEvents = []) {
    if (!card || !Array.isArray(card) || card.length === 0) {
      throw new Error('Keine Karte zum Rendern uebergeben');
    }
    try {
      const response = await this.apiClient.post('/api/bingo/render', {
        card,
        markedEvents: markedEvents || [],
        verifiedEvents: verifiedEvents || [],
      }, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (err) {
      const status = err.response?.status;
      if (!status) {
        throw new Error('Zappify ist nicht erreichbar - Bingo-Karte nicht verfuegbar.');
      }
      throw new Error(`Bingo-Karte konnte nicht gerendert werden (HTTP ${status}).`);
    }
  }
}

module.exports = BingoImageGenerator;
