const { DataTypes, Op } = require('sequelize');

module.exports = (sequelize) => {
  const VerificationCode = sequelize.define('VerificationCode', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    discord_user_id: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true
    },
    expiration: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    tableName: 'verification_codes',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    indexes: [
      {
        fields: ['code']
      },
      {
        fields: ['discord_user_id']
      },
      {
        fields: ['expiration']
      }
    ]
  });

  VerificationCode.generateCode = function(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  VerificationCode.createCode = async function(discordUserId, codeLength = 6, expirationMinutes = 5) {
    await this.destroy({
      where: { discord_user_id: discordUserId }
    });

    const code = this.generateCode(codeLength);
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + expirationMinutes);

    return await this.create({
      discord_user_id: discordUserId,
      code,
      expiration
    });
  };

  VerificationCode.findValidCode = async function(code) {
    const now = new Date();
    return await this.findOne({
      where: {
        code: code.toUpperCase(),
        expiration: { [Op.gt]: now }
      }
    });
  };

  VerificationCode.cleanupExpired = async function() {
    const now = new Date();
    const deletedCount = await this.destroy({
      where: {
        expiration: { [Op.lt]: now }
      }
    });
    return deletedCount;
  };

  return VerificationCode;
};