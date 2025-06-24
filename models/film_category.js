const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class FilmCategory extends Model {}
  FilmCategory.init({
    film_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    last_update: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'FilmCategory',
    tableName: 'film_category',
    timestamps: false
  });
  FilmCategory.associate = (models) => {
    FilmCategory.belongsTo(models.Film, { foreignKey: 'film_id', as: 'film' });
    FilmCategory.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
  };
  return FilmCategory;
};
