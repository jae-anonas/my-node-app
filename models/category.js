const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class Category extends Model {}
  Category.init({
    category_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(25),
      allowNull: false
    },
    last_update: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Category',
    tableName: 'category',
    timestamps: false
  });
  Category.associate = (models) => {
    Category.belongsToMany(models.Film, {
      through: models.FilmCategory,
      foreignKey: 'category_id',
      otherKey: 'film_id',
      as: 'films'
    });
  };
  return Category;
};
