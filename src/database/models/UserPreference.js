const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserPreference = sequelize.define('UserPreference', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    discord_user_id: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      comment: 'Discord user ID for cross-device sync'
    },
    preferences: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      comment: 'User preferences JSON (dashboard sections, etc.)'
    }
  }, {
    tableName: 'user_preferences',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['discord_user_id'],
        unique: true,
        name: 'idx_user_preferences_discord_user_id'
      }
    ]
  });

  /**
   * Get or create user preferences by Discord user ID
   * @param {string} discordUserId - Discord user ID
   * @returns {Promise<UserPreference>}
   */
  UserPreference.getOrCreate = async function(discordUserId) {
    const [pref] = await this.findOrCreate({
      where: { discord_user_id: discordUserId },
      defaults: { preferences: {} }
    });
    return pref;
  };

  /**
   * Update user preferences with deep merge
   * @param {string} discordUserId - Discord user ID
   * @param {object} newPreferences - Preferences to merge
   * @returns {Promise<UserPreference>}
   */
  UserPreference.updatePreferences = async function(discordUserId, newPreferences) {
    const pref = await this.getOrCreate(discordUserId);
    const merged = deepMerge(pref.preferences || {}, newPreferences);
    await pref.update({ preferences: merged });
    return pref;
  };

  return UserPreference;
};

/**
 * Deep merge two objects
 * @param {object} target - Target object
 * @param {object} source - Source object to merge
 * @returns {object} Merged object
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      output[key] = deepMerge(target[key] || {}, sourceVal);
    } else if (sourceVal !== undefined) {
      output[key] = sourceVal;
    }
  }
  return output;
}
