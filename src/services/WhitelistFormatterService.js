const { logger } = require('../utils/logger');

class WhitelistFormatterService {
  constructor(config = {}) {
    this.logger = logger.child({ service: 'WhitelistFormatterService' });
    this.preferEosID = config.preferEosID || false;
    this.includeComments = config.includeComments !== false; // Default true
  }

  getIdentifier(entry) {
    if (this.preferEosID && entry.eosID) {
      return entry.eosID;
    }
    return entry.steamid64;
  }

  formatEntry(entry) {
    const identifier = this.getIdentifier(entry);
    let line = identifier;

    if (this.includeComments && entry.discord_username) {
      line += ` // ${entry.discord_username}`;
    }

    return line;
  }

  async formatWhitelistContent(entries) {
    try {
      if (!Array.isArray(entries)) {
        this.logger.error('Invalid entries provided to formatter', {
          type: typeof entries,
          value: entries
        });
        return '';
      }

      if (entries.length === 0) {
        this.logger.debug('No entries to format');
        return '';
      }

      const lines = [];
      const seenIdentifiers = new Set();
      let duplicateCount = 0;

      for (const entry of entries) {
        if (!entry) {
          this.logger.warn('Null entry encountered during formatting');
          continue;
        }

        const identifier = this.getIdentifier(entry);

        if (!identifier) {
          this.logger.warn('Entry missing required identifier', {
            steamid64: entry.steamid64,
            eosID: entry.eosID,
            preferEosID: this.preferEosID
          });
          continue;
        }

        if (seenIdentifiers.has(identifier)) {
          duplicateCount++;
          this.logger.debug('Duplicate identifier found, skipping', {
            identifier,
            discord_username: entry.discord_username
          });
          continue;
        }

        seenIdentifiers.add(identifier);
        const formattedLine = this.formatEntry(entry);
        lines.push(formattedLine);
      }

      const content = lines.join('\n');

      this.logger.info('Whitelist content formatted', {
        totalEntries: entries.length,
        uniqueEntries: lines.length,
        duplicatesSkipped: duplicateCount,
        contentLength: content.length,
        preferEosID: this.preferEosID
      });

      return content;

    } catch (error) {
      this.logger.error('Failed to format whitelist content', {
        error: error.message,
        entryCount: entries?.length || 0
      });
      throw new Error(`Whitelist formatting failed: ${error.message}`);
    }
  }

  async formatCombinedContent(whitelistContents) {
    try {
      const sections = [];
      let totalLines = 0;
      let totalCharacters = 0;

      for (const [type, content] of Object.entries(whitelistContents)) {
        if (content && content.trim()) {
          const lines = content.trim().split('\n');
          sections.push(`// ${type.toUpperCase()} WHITELIST (${lines.length} entries)`);
          sections.push(content.trim());
          sections.push(''); // Empty line between sections

          totalLines += lines.length;
          totalCharacters += content.length;
        }
      }

      // Add header
      const timestamp = new Date().toISOString();
      const header = [
        '// Combined Squad Server Whitelist',
        `// Generated: ${timestamp}`,
        `// Total Entries: ${totalLines}`,
        `// Prefer EOS ID: ${this.preferEosID}`,
        '',
        ''
      ];

      const finalContent = [...header, ...sections].join('\n');

      this.logger.info('Combined whitelist content formatted', {
        sections: Object.keys(whitelistContents).length,
        totalLines,
        totalCharacters,
        finalLength: finalContent.length
      });

      return finalContent;

    } catch (error) {
      this.logger.error('Failed to format combined whitelist content', {
        error: error.message,
        sections: Object.keys(whitelistContents || {})
      });
      throw new Error(`Combined whitelist formatting failed: ${error.message}`);
    }
  }

  formatStats(entries) {
    if (!Array.isArray(entries)) {
      return { total: 0, withDiscord: 0, withoutDiscord: 0 };
    }

    const stats = {
      total: entries.length,
      withDiscord: 0,
      withoutDiscord: 0,
      steamIds: 0,
      eosIds: 0
    };

    for (const entry of entries) {
      if (entry.discord_username) {
        stats.withDiscord++;
      } else {
        stats.withoutDiscord++;
      }

      if (entry.steamid64) {
        stats.steamIds++;
      }

      if (entry.eosID) {
        stats.eosIds++;
      }
    }

    return stats;
  }

  validateEntry(entry) {
    const issues = [];

    if (!entry) {
      return ['Entry is null or undefined'];
    }

    if (!entry.steamid64 && !entry.eosID) {
      issues.push('Missing both Steam ID and EOS ID');
    }

    if (this.preferEosID && !entry.eosID && entry.steamid64) {
      issues.push('Prefer EOS ID is enabled but entry only has Steam ID');
    }

    if (entry.steamid64 && !/^\d{17}$/.test(entry.steamid64)) {
      issues.push('Invalid Steam ID format');
    }

    if (entry.eosID && !/^[a-f0-9]{32}$/.test(entry.eosID)) {
      issues.push('Invalid EOS ID format');
    }

    return issues;
  }

  validateEntries(entries) {
    const validation = {
      valid: 0,
      invalid: 0,
      issues: []
    };

    if (!Array.isArray(entries)) {
      validation.issues.push('Entries is not an array');
      return validation;
    }

    for (let i = 0; i < entries.length; i++) {
      const issues = this.validateEntry(entries[i]);
      if (issues.length === 0) {
        validation.valid++;
      } else {
        validation.invalid++;
        validation.issues.push({
          index: i,
          entry: entries[i],
          issues
        });
      }
    }

    return validation;
  }
}

module.exports = WhitelistFormatterService;