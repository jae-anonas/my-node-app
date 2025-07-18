const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class User extends Model {}
  User.init({
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    is_admin: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    first_name: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    last_name: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    customer_id: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true,
      unique: true,
      references: {
        model: 'customer',
        key: 'customer_id'
      }
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'user',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: ["id"]
      },
      {
        name: "email",
        unique: true,
        using: "BTREE",
        fields: ["email"]
      },
      {
        name: "idx_fk_customer_id",
        unique: true,
        using: "BTREE",
        fields: ["customer_id"]
      }
    ]
  });
  
  // Define associations
  User.associate = function(models) {
    if (models.Customer) {
      User.belongsTo(models.Customer, {
        foreignKey: 'customer_id',
        as: 'customer'
      });
    }
  };
  
  return User;
};
