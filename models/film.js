const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class Film extends Model {}
  Film.init({
    film_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    release_year: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    language_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    original_language_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    rental_duration: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rental_rate: {
      type: DataTypes.DECIMAL(4,2),
      allowNull: false
    },
    length: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    replacement_cost: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: false
    },
    rating: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    special_features: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    last_update: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Film',
    tableName: 'film',
    timestamps: false
  });
  Film.associate = (models) => {
    Film.belongsToMany(models.Category, {
      through: models.FilmCategory,
      foreignKey: 'film_id',
      otherKey: 'category_id',
      as: 'categories'
    });
  };
  return Film;
};
