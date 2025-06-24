'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // User table
    await queryInterface.createTable('user', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      is_admin: { type: Sequelize.BOOLEAN },
      first_name: { type: Sequelize.TEXT },
      last_name: { type: Sequelize.TEXT },
      role: { type: Sequelize.STRING(100) },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Language table
    await queryInterface.createTable('language', {
      language_id: { type: Sequelize.TINYINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.CHAR(20), allowNull: false },
      last_update: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Category table
    await queryInterface.createTable('category', {
      category_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(25), allowNull: false },
      last_update: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Film table
    await queryInterface.createTable('film', {
      film_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      title: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT },
      release_year: { type: Sequelize.INTEGER },
      language_id: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: false,
        references: { model: 'language', key: 'language_id' }
      },
      original_language_id: {
        type: Sequelize.TINYINT.UNSIGNED,
        allowNull: true,
        references: { model: 'language', key: 'language_id' }
      },
      rental_duration: { type: Sequelize.INTEGER, allowNull: false },
      rental_rate: { type: Sequelize.DECIMAL(4,2), allowNull: false },
      length: { type: Sequelize.INTEGER },
      replacement_cost: { type: Sequelize.DECIMAL(5,2), allowNull: false },
      rating: { type: Sequelize.STRING(10) },
      special_features: { type: Sequelize.STRING(255) },
      last_update: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // FilmCategory (junction) table
    await queryInterface.createTable('film_category', {
      film_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: 'film', key: 'film_id' }
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: 'category', key: 'category_id' }
      },
      last_update: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('film_category');
    await queryInterface.dropTable('film');
    await queryInterface.dropTable('category');
    await queryInterface.dropTable('language');
    await queryInterface.dropTable('user');
  }
};