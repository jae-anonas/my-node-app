const { DataTypes } = require('sequelize');

module.exports = function(sequelize) {
  return sequelize.define('address', {
    address_id: {
      autoIncrement: true,
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    address: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    address2: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    district: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    city_id: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      references: {
        model: 'city',
        key: 'city_id'
      }
    },
    postal_code: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    location: {
      type: DataTypes.GEOMETRY,
      allowNull: false
    },
    last_update: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'address',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "address_id" },
        ]
      },
      {
        name: "idx_fk_city_id",
        using: "BTREE",
        fields: [
          { name: "city_id" },
        ]
      },
      {
        name: "idx_location",
        type: "SPATIAL",
        fields: [
          { name: "location", length: 32 },
        ]
      },
    ]
  });
};
