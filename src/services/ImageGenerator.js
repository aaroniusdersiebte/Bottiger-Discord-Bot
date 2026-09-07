/**
 * ImageGenerator - rendert Wolpertinger-Charakterbilder.
 *
 * Seit der /public-Auslieferung hat der Bot KEIN eigenes `canvas` mehr: das
 * Rendering laeuft in Zappify (POST /api/character/render). Diese Klasse ist ein
 * duenner API-Wrapper mit unveraenderter Schnittstelle, damit die Aufrufer
 * (commands/user.js, commands/wolpertinger.js) gleich bleiben.
 *
 * Ist Zappify aus, wirft generateCharacter() - die Aufrufer fangen das ab und
 * zeigen "Bild nur verfuegbar, solange Zappify laeuft".
 */

class ImageGenerator {
  /**
   * @param {import('./ApiClient')} apiClient
   */
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Rendert ein Charakter-Bild aus einem Charakter-Objekt.
   * @param {object} characterData - { hintergrund:'file.png', koerper:'file.png', ... } ('random' erlaubt)
   * @param {object} [_assetManager] - ignoriert (Random-Aufloesung passiert in Zappify)
   * @returns {Promise<Buffer>} PNG-Buffer
   */
  async generateCharacter(characterData, _assetManager = null) {
    if (!characterData || typeof characterData !== 'object') {
      throw new Error('Kein Charakter-Objekt uebergeben');
    }
    // mundFrames ist ein grosses Array (alle Mund-Dateien) - Zappify fuellt das
    // selbst, wir schicken es nicht mit.
    const { mundFrames, ...character } = characterData;

    try {
      const response = await this.apiClient.post('/api/character/render', { character }, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data);
    } catch (err) {
      const status = err.response?.status;
      if (!status) {
        throw new Error('Zappify ist nicht erreichbar - Charakterbild nicht verfuegbar.');
      }
      throw new Error(`Charakterbild konnte nicht gerendert werden (HTTP ${status}).`);
    }
  }

  /**
   * Preview mit teilweiser Auswahl - identische Logik wie generateCharacter.
   * @param {object} partialCharacterData
   * @returns {Promise<Buffer>}
   */
  async generatePreview(partialCharacterData, _assetManager = null) {
    return this.generateCharacter(partialCharacterData);
  }
}

module.exports = ImageGenerator;
