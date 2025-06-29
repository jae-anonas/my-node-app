const { DataTypes } = require('sequelize');
module.exports = function(sequelize) {
  return sequelize.define('store', {
    store_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    manager_staff_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'staff',
        key: 'staff_id'
      },
      unique: "fk_store_staff"
    },
    address_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'address',
        key: 'address_id'
      }
    },
    last_update: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'store',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "store_id" },
        ]
      },
      {
        name: "idx_unique_manager",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "manager_staff_id" },
        ]
      },
      {
        name: "idx_fk_address_id",
        using: "BTREE",
        fields: [
          { name: "address_id" },
        ]
      },
    ]
  });
};
