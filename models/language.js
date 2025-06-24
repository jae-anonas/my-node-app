const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class Language extends Model {
    static associate(models) {
      // A Language has many Films (as language)
      Language.hasMany(models.Film, { foreignKey: 'language_id', as: 'films' });
      // A Language has many Films (as original_language)
      Language.hasMany(models.Film, { foreignKey: 'original_language_id', as: 'original_films' });
    }
  }
  Language.init({
    language_id: {
      autoIncrement: true,
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.CHAR(20),
      allowNull: false
    },
    last_update: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    sequelize,
    modelName: 'Language',
    tableName: 'language',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: ["language_id"]
      }
    ]
  });
  return Language;
};
