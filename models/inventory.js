const { DataTypes } = require('sequelize');
module.exports = function(sequelize) {
  return sequelize.define('inventory', {
    inventory_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    film_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'film',
        key: 'film_id'
      }
    },
    store_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'store',
        key: 'store_id'
      }
    },
    last_update: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'inventory',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "inventory_id" },
        ]
      },
      {
        name: "idx_fk_film_id",
        using: "BTREE",
        fields: [
          { name: "film_id" },
        ]
      },
      {
        name: "idx_store_id_film_id",
        using: "BTREE",
        fields: [
          { name: "store_id" },
          { name: "film_id" },
        ]
      },
    ]
  });
};
