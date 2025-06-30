// Import required modules
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');
var cors = require('cors');
const path = require('path');
const fs = require('fs');

// Sequelize setup
const { Sequelize } = require('sequelize');
const UserModel = require('../models/user');
const FilmModel = require('../models/film');
const FilmCategoryModel = require('../models/film_category');
const CategoryModel = require('../models/category');
const LanguageModel = require('../models/language');
const InventoryModel = require('../models/inventory');
const StoreModel = require('../models/store');
const RentalModel = require('../models/rental');
const CustomerModel = require('../models/customer');

const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    ...(process.env.NODE_ENV === 'production' && {
      dialectOptions: {
        ssl: {
          ca: fs.readFileSync(process.env.DB_SSL_CA || './DigiCertGlobalRootCA.crt.pem')
        }
      }
    })
  }
);

const User = UserModel(sequelize);
const Film = FilmModel(sequelize);
const FilmCategory = FilmCategoryModel(sequelize);
const Category = CategoryModel(sequelize);
const Language = LanguageModel(sequelize);
const Inventory = InventoryModel(sequelize);
const Store = StoreModel(sequelize);
const Rental = RentalModel(sequelize);
const Customer = CustomerModel(sequelize);

// Set up associations
const models = { User, Film, FilmCategory, Category, Language, Inventory, Store, Rental, Customer };

if (User.associate) User.associate(models);
if (Film.associate) Film.associate(models);
if (Category.associate) Category.associate(models);
if (FilmCategory.associate) FilmCategory.associate(models);

// Add associations for Inventory and Store
Film.hasMany(Inventory, { foreignKey: 'film_id', as: 'inventories' });
Inventory.belongsTo(Film, { foreignKey: 'film_id', as: 'film' });

Store.hasMany(Inventory, { foreignKey: 'store_id', as: 'inventories' });
Inventory.belongsTo(Store, { foreignKey: 'store_id', as: 'store' });

// Add associations for Rental
Inventory.hasMany(Rental, { foreignKey: 'inventory_id', as: 'rentals' });
Rental.belongsTo(Inventory, { foreignKey: 'inventory_id', as: 'inventory' });

Customer.hasMany(Rental, { foreignKey: 'customer_id', as: 'rentals' });
Rental.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });

// Initialize Express app
const app = express();
app.use(cors());
const port = process.env.PORT || 3000;


// Serve static files from Angular build output
app.use(express.static(path.join(__dirname, '../dist/my-angular-app/browser')));

// Fallback to index.html for Angular client-side routes (not for static files or API)
app.get('*', (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/films') ||
    req.path.startsWith('/users') ||
    req.path.includes('.') // skip static file requests
  ) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../dist/my-angular-app/browser/index.html'));
});

app.post('/api/signin', express.json(), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  // Hash the password using SHA-256
  console.log(`Attempting login for user: ${username}`);
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  console.log(`Hashed password for user ${username}: ${hash}`);
  try {
    const user = await User.findOne({ 
      where: { name: username, password_hash: hash },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['customer_id', 'first_name', 'last_name', 'email', 'active', 'store_id', 'address_id']
        }
      ]
    });
    if (user) {
      // Login successful
      console.log(`User ${username} logged in successfully.`);
      return res.json({ 
        success: true, 
        message: 'Login successful.', 
        userData: user
      });
    } else {
      // Login failed
      console.log(`Login failed for user ${username}.`);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ error: 'Database error.' });
  }
});

// /signup endpoint using Sequelize
app.post('/api/signup', express.json(), async (req, res) => {
  const { name, password, email, first_name, last_name, store_id = 1 } = req.body.userData || req.body;
  if (!name || !password || !email) {
    return res.status(400).json({ error: 'Username, password, and email are required.' });
  }
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  
  // Use transaction to ensure both User and Customer are created together
  const transaction = await sequelize.transaction();
  
  try {
    const existing = await User.findOne({ 
      where: { [Sequelize.Op.or]: [{ name }, { email }] },
      transaction
    });
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    
    // Create Customer record first
    const customer = await Customer.create({
      first_name: first_name || name, // Use username as first_name if not provided
      last_name: last_name || '', // Default to empty string if not provided
      email,
      store_id, // Default to store 1 if not provided
      address_id: 1, // Default address_id
      active: 1,
      create_date: new Date(),
      last_update: new Date()
    }, { transaction });
    
    // Create User record with reference to Customer
    const user = await User.create({ 
      name, 
      password_hash: hash, 
      email,
      customer_id: customer.customer_id,
      first_name: first_name || name,
      last_name: last_name || '',
      role: 'customer'
    }, { transaction });
    
    await transaction.commit();
    
    return res.status(201).json({ 
      success: true, 
      message: 'User and customer created successfully.',
      user_id: user.id,
      customer_id: customer.customer_id
    });
  } catch (err) {
    await transaction.rollback();
    console.error('Error creating user and customer:', err);
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: 'Validation error: ' + err.message });
    }
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ error: 'Invalid store_id provided.' });
    }
    return res.status(500).json({ error: 'Database error.' });
  }
});

// User endpoints
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/users/by-id', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing user id in query parameter.' });
  }
  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    console.error('Error fetching user by id:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.put('/api/users/edit', express.json(), async (req, res) => {
  const { id, name, email, first_name, last_name, role } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'User id is required.' });
  }
  try {
    const [affectedRows] = await User.update(
      { name, email, first_name, last_name, role },
      { where: { id } }
    );
    if (affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Film endpoints
app.get('/api/films', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;
  try {
    const { count, rows } = await Film.findAndCountAll({
      include: [{
        model: Category,
        as: 'categories',
        through: { attributes: [] },
        attributes: ['category_id', 'name']
      }],
      limit: pageSize,
      offset
    });

    // Get inventory details for all films
    const filmIds = rows.map(film => film.film_id);
    const inventoryData = await sequelize.query(`
      SELECT 
        i.film_id,
        i.store_id,
        s.manager_staff_id,
        s.address_id,
        COUNT(i.inventory_id) as copies_count
      FROM inventory i
      JOIN store s ON i.store_id = s.store_id
      WHERE i.film_id IN (${filmIds.length ? filmIds.map(() => '?').join(',') : 'NULL'})
      GROUP BY i.film_id, i.store_id
      ORDER BY i.film_id, i.store_id
    `, {
      replacements: filmIds,
      type: sequelize.QueryTypes.SELECT
    });

    // Group inventory by film_id
    const inventoryByFilm = inventoryData.reduce((acc, inv) => {
      if (!acc[inv.film_id]) acc[inv.film_id] = [];
      acc[inv.film_id].push({
        store_id: inv.store_id,
        manager_staff_id: inv.manager_staff_id,
        address_id: inv.address_id,
        copies_count: inv.copies_count
      });
      return acc;
    }, {});

    // Add inventory details to films
    const filmsWithInventory = rows.map(film => ({
      ...film.toJSON(),
      inventory: inventoryByFilm[film.film_id] || []
    }));

    res.json({
      page,
      pageSize,
      total: count,
      films: filmsWithInventory
    });
  } catch (err) {
    console.error('Error fetching films:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/films/search', async (req, res) => {
  const { title, category, minYear, maxYear, rating, page = 1, pageSize = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = {};
  let include = [{
    model: Category,
    as: 'categories',
    through: { attributes: [] },
    attributes: ['category_id', 'name']
  }];

  // If searching by category, ensure films with at least one matching category are included
  if (category) {
    include[0].where = { name: { [Sequelize.Op.like]: `%${category}%` } };
  }

  // If searching by title or both title and category, use OR logic
  if (title && category) {
    // Remove include[0].where to avoid AND logic, use OR with a subquery for category
    delete include[0].where;
    where = {
      [Sequelize.Op.or]: [
        { title: { [Sequelize.Op.like]: `%${title}%` } },
        Sequelize.literal(`EXISTS (
          SELECT 1 FROM film_category fc
          JOIN category c ON fc.category_id = c.category_id
          WHERE fc.film_id = film.film_id AND c.name LIKE '%${category}%'
        )`)
      ]
    };
  } else if (title) {
    where.title = { [Sequelize.Op.like]: `%${title}%` };
  }

  if (minYear) where.release_year = { ...(where.release_year || {}), [Sequelize.Op.gte]: minYear };
  if (maxYear) where.release_year = { ...(where.release_year || {}), [Sequelize.Op.lte]: maxYear };
  if (rating) where.rating = rating;

  try {
    const { count, rows } = await Film.findAndCountAll({
      where,
      include,
      limit: parseInt(pageSize),
      offset,
      distinct: true // Needed for correct count with include
    });

    // Get inventory details for search results
    const filmIds = rows.map(film => film.film_id);
    const inventoryData = filmIds.length ? await sequelize.query(`
      SELECT 
        i.film_id,
        i.store_id,
        s.manager_staff_id,
        s.address_id,
        COUNT(i.inventory_id) as copies_count
      FROM inventory i
      JOIN store s ON i.store_id = s.store_id
      WHERE i.film_id IN (${filmIds.map(() => '?').join(',')})
      GROUP BY i.film_id, i.store_id
      ORDER BY i.film_id, i.store_id
    `, {
      replacements: filmIds,
      type: sequelize.QueryTypes.SELECT
    }) : [];

    // Group inventory by film_id
    const inventoryByFilm = inventoryData.reduce((acc, inv) => {
      if (!acc[inv.film_id]) acc[inv.film_id] = [];
      acc[inv.film_id].push({
        store_id: inv.store_id,
        manager_staff_id: inv.manager_staff_id,
        address_id: inv.address_id,
        copies_count: inv.copies_count
      });
      return acc;
    }, {});

    // Add inventory details to films
    const filmsWithInventory = rows.map(film => ({
      ...film.toJSON(),
      inventory: inventoryByFilm[film.film_id] || []
    }));

    res.json({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total: count,
      films: filmsWithInventory
    });
  } catch (err) {
    console.error('Error searching films:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/films/by-id', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing film id in query parameter.' });
  }
  try {
    const film = await Film.findByPk(id, {
      include: [
        {
          model: Category,
          as: 'categories',
          through: { attributes: [] },
          attributes: ['category_id', 'name']
        },
        {
          model: Language,
          as: 'language',
          attributes: ['language_id', 'name']
        },
        {
          model: Language,
          as: 'original_language',
          attributes: ['language_id', 'name']
        }
      ]
    });
    if (!film) {
      return res.status(404).json({ error: 'Film not found.' });
    }

    // Get inventory details for this specific film
    const inventoryData = await sequelize.query(`
      SELECT 
        i.store_id,
        s.manager_staff_id,
        s.address_id,
        COUNT(i.inventory_id) as copies_count
      FROM inventory i
      JOIN store s ON i.store_id = s.store_id
      WHERE i.film_id = ?
      GROUP BY i.store_id
      ORDER BY i.store_id
    `, {
      replacements: [id],
      type: sequelize.QueryTypes.SELECT
    });

    const filmJson = film.toJSON();
    filmJson.language = filmJson.language ? filmJson.language.name : null;
    filmJson.original_language = filmJson.original_language ? filmJson.original_language.name : null;
    filmJson.inventory = inventoryData.map(inv => ({
      store_id: inv.store_id,
      manager_staff_id: inv.manager_staff_id,
      address_id: inv.address_id,
      copies_count: inv.copies_count
    }));

    res.json({ film: filmJson });
  } catch (err) {
    console.error('Error fetching film by id:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.post('/api/films/by-categories', express.json(), async (req, res) => {
  let { categories } = req.body;
  // Accept comma-separated string or array
  if (!categories) {
    return res.status(400).json({ error: 'Missing categories parameter.' });
  }
  if (!Array.isArray(categories)) {
    categories = categories.split(',').map(c => c.trim()).filter(Boolean);
  }
  if (!categories.length) {
    return res.status(400).json({ error: 'No valid categories provided.' });
  }
  try {
    // Fetch all categories and their films in one query
    const foundCategories = await Category.findAll({
      where: { name: { [Sequelize.Op.in]: categories } },
      include: [{
        model: Film,
        as: 'films',
        through: { attributes: [] },
        attributes: { exclude: [] } // return all film attributes
      }],
      attributes: ['category_id', 'name']
    });

    // Get all film IDs from the results
    const allFilmIds = [];
    foundCategories.forEach(cat => {
      cat.films.forEach(film => {
        if (!allFilmIds.includes(film.film_id)) {
          allFilmIds.push(film.film_id);
        }
      });
    });

    // Get inventory details for all films
    const inventoryData = allFilmIds.length ? await sequelize.query(`
      SELECT 
        i.film_id,
        i.store_id,
        s.manager_staff_id,
        s.address_id,
        COUNT(i.inventory_id) as copies_count
      FROM inventory i
      JOIN store s ON i.store_id = s.store_id
      WHERE i.film_id IN (${allFilmIds.map(() => '?').join(',')})
      GROUP BY i.film_id, i.store_id
      ORDER BY i.film_id, i.store_id
    `, {
      replacements: allFilmIds,
      type: sequelize.QueryTypes.SELECT
    }) : [];

    // Group inventory by film_id
    const inventoryByFilm = inventoryData.reduce((acc, inv) => {
      if (!acc[inv.film_id]) acc[inv.film_id] = [];
      acc[inv.film_id].push({
        store_id: inv.store_id,
        manager_staff_id: inv.manager_staff_id,
        address_id: inv.address_id,
        copies_count: inv.copies_count
      });
      return acc;
    }, {});

    // Format response with inventory details
    const result = foundCategories.map(cat => ({
      category: cat.name,
      films: (cat.films || []).map(film => ({
        ...film.toJSON(),
        inventory: inventoryByFilm[film.film_id] || []
      }))
    }));

    res.json(result);
  } catch (err) {
    console.error('Error in /films/by-categories:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.put('/api/films/edit', express.json(), async (req, res) => {
  const { film_id, title, description, release_year, language_id, original_language_id, rental_duration, rental_rate, length, replacement_cost, rating, special_features } = req.body;
  if (!film_id) {
    return res.status(400).json({ error: 'film_id is required.' });
  }
  try {
    const [affectedRows] = await Film.update(
      {
        title,
        description,
        release_year,
        language_id,
        original_language_id,
        rental_duration,
        rental_rate,
        length,
        replacement_cost,
        rating,
        special_features
      },
      { where: { film_id } }
    );
    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Film not found.' });
    }
    res.json({ success: true, message: 'Film updated successfully.' });
  } catch (err) {
    console.error('Error updating film:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.post('/api/films/create', express.json(), async (req, res) => {
  const {
    title,
    description,
    release_year,
    language_id,
    original_language_id,
    rental_duration,
    rental_rate,
    length,
    replacement_cost,
    rating,
    special_features,
    categories // optional: array of category IDs to associate
  } = req.body;

  if (!title || !language_id || !rental_duration || !rental_rate || !replacement_cost) {
    return res.status(400).json({ error: 'Missing required film fields.' });
  }

  try {
    // Create the film, include last_update
    const film = await Film.create({
      title,
      description,
      release_year,
      language_id,
      original_language_id,
      rental_duration,
      rental_rate,
      length,
      replacement_cost,
      rating,
      special_features,
      last_update: new Date() // <-- add this line
    });

    // Optionally associate categories
    if (Array.isArray(categories) && categories.length > 0) {
      await film.setCategories(categories);
    }

    res.status(201).json({ success: true, message: 'Film created successfully.', film_id: film.film_id });
  } catch (err) {
    console.error('Error creating film:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Inventory endpoints
app.get('/api/inventory/search', async (req, res) => {
  console.log('Searching inventory with query:', req.query);
  const { 
    film_title, 
    store_id, 
    film_id, 
    category, 
    page = 1, 
    pageSize = 10,
    groupBy = 'film_store' // 'film_store', 'film', 'store', or 'none'
  } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = {};
  let include = [
    {
      model: Film,
      as: 'film',
      attributes: ['film_id', 'title', 'description', 'release_year', 'rating'],
      include: []
    },
    {
      model: Store,
      as: 'store',
      attributes: ['store_id', 'manager_staff_id', 'address_id']
    }
  ];

  // Add category filter if provided
  if (category) {
    include[0].include.push({
      model: Category,
      as: 'categories',
      through: { attributes: [] },
      attributes: ['category_id', 'name'],
      where: { name: { [Sequelize.Op.like]: `%${category}%` } }
    });
  }

  // Add film title filter
  if (film_title) {
    include[0].where = { title: { [Sequelize.Op.like]: `%${film_title}%` } };
  }

  // Add direct filters
  if (store_id) where.store_id = store_id;
  if (film_id) where.film_id = film_id;

  try {
    if (groupBy === 'film_store') {
      // Group by both film_id and store_id with count
      const results = await Inventory.findAll({
        where,
        attributes: [
          [sequelize.col('inventory.film_id'), 'film_id'],
          [sequelize.col('inventory.store_id'), 'store_id'],
          [sequelize.fn('COUNT', sequelize.col('inventory.inventory_id')), 'inventory_count']
        ],
        group: [sequelize.col('inventory.film_id'), sequelize.col('inventory.store_id')],
        order: [[sequelize.col('inventory.film_id'), 'ASC'], [sequelize.col('inventory.store_id'), 'ASC']],
        limit: parseInt(pageSize),
        offset,
        raw: true
      });
      
      // Get film and store details separately
      const filmIds = [...new Set(results.map(r => r.film_id))];
      const storeIds = [...new Set(results.map(r => r.store_id))];
      
      const films = await Film.findAll({
        where: { film_id: { [Sequelize.Op.in]: filmIds } },
        attributes: ['film_id', 'title', 'description', 'release_year', 'rating'],
        raw: true
      });
      
      const stores = await Store.findAll({
        where: { store_id: { [Sequelize.Op.in]: storeIds } },
        attributes: ['store_id', 'manager_staff_id', 'address_id'],
        raw: true
      });
      
      // Combine results with film and store details
      const enrichedResults = results.map(result => ({
        ...result,
        film: films.find(f => f.film_id === result.film_id),
        store: stores.find(s => s.store_id === result.store_id)
      }));
      
      res.json({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        groupBy,
        results: enrichedResults
      });
    } else if (groupBy === 'film') {
      // Group by film_id only
      const results = await Inventory.findAll({
        where,
        attributes: [
          [sequelize.col('inventory.film_id'), 'film_id'],
          [sequelize.fn('COUNT', sequelize.col('inventory.inventory_id')), 'total_inventory_count'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('inventory.store_id'))), 'stores_count']
        ],
        group: [sequelize.col('inventory.film_id')],
        order: [[sequelize.col('inventory.film_id'), 'ASC']],
        limit: parseInt(pageSize),
        offset,
        raw: true
      });
      
      // Get film details separately
      const filmIds = results.map(r => r.film_id);
      const films = await Film.findAll({
        where: { film_id: { [Sequelize.Op.in]: filmIds } },
        attributes: ['film_id', 'title', 'description', 'release_year', 'rating'],
        raw: true
      });
      
      const enrichedResults = results.map(result => ({
        ...result,
        film: films.find(f => f.film_id === result.film_id)
      }));
      
      res.json({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        groupBy,
        results: enrichedResults
      });
    } else if (groupBy === 'store') {
      // Group by store_id only
      const results = await Inventory.findAll({
        where,
        attributes: [
          [sequelize.col('inventory.store_id'), 'store_id'],
          [sequelize.fn('COUNT', sequelize.col('inventory.inventory_id')), 'total_inventory_count'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('inventory.film_id'))), 'films_count']
        ],
        group: [sequelize.col('inventory.store_id')],
        order: [[sequelize.col('inventory.store_id'), 'ASC']],
        limit: parseInt(pageSize),
        offset,
        raw: true
      });
      
      // Get store details separately
      const storeIds = results.map(r => r.store_id);
      const stores = await Store.findAll({
        where: { store_id: { [Sequelize.Op.in]: storeIds } },
        attributes: ['store_id', 'manager_staff_id', 'address_id'],
        raw: true
      });
      
      const enrichedResults = results.map(result => ({
        ...result,
        store: stores.find(s => s.store_id === result.store_id)
      }));
      
      res.json({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        groupBy,
        results: enrichedResults
      });
    } else {
      // No grouping - return individual inventory records
      const { count, rows } = await Inventory.findAndCountAll({
        where,
        include,
        limit: parseInt(pageSize),
        offset,
        order: [['inventory_id', 'ASC']],
        distinct: true
      });
      
      res.json({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: count,
        groupBy: 'none',
        results: rows
      });
    }
  } catch (err) {
    console.error('Error searching inventory:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Check film availability in store endpoint
app.get('/api/inventory/available-in-store', async (req, res) => {
  const { film_id, store_id } = req.query;
  
  if (!film_id || !store_id) {
    return res.status(400).json({ error: 'film_id and store_id are required query parameters.' });
  }
  
  try {
    // Check if film and store exist
    const film = await Film.findByPk(film_id, {
      attributes: ['film_id', 'title', 'rental_rate', 'rental_duration']
    });
    
    if (!film) {
      return res.status(404).json({ error: 'Film not found.' });
    }
    
    const store = await Store.findByPk(store_id, {
      attributes: ['store_id', 'manager_staff_id', 'address_id']
    });
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found.' });
    }
    
    // Get inventory details for this film in this store
    const inventoryDetails = await sequelize.query(`
      SELECT 
        i.inventory_id,
        i.film_id,
        i.store_id,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM rental r 
            WHERE r.inventory_id = i.inventory_id 
            AND r.return_date IS NULL
          ) THEN 'rented'
          ELSE 'available'
        END as status
      FROM inventory i
      WHERE i.film_id = ? AND i.store_id = ?
      ORDER BY i.inventory_id
    `, {
      replacements: [film_id, store_id],
      type: sequelize.QueryTypes.SELECT
    });
    
    // Count available and rented copies
    const availableCopies = inventoryDetails.filter(item => item.status === 'available');
    const rentedCopies = inventoryDetails.filter(item => item.status === 'rented');
    
    const response = {
      film: {
        film_id: film.film_id,
        title: film.title,
        rental_rate: film.rental_rate,
        rental_duration: film.rental_duration
      },
      store: {
        store_id: store.store_id,
        manager_staff_id: store.manager_staff_id,
        address_id: store.address_id
      },
      availability: {
        is_available: availableCopies.length > 0,
        total_copies: inventoryDetails.length,
        available_copies: availableCopies.length,
        rented_copies: rentedCopies.length,
        available_inventory_ids: availableCopies.map(item => item.inventory_id),
        rented_inventory_ids: rentedCopies.map(item => item.inventory_id)
      },
      inventory_details: inventoryDetails
    };
    
    res.json(response);
  } catch (err) {
    console.error('Error checking film availability in store:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Rental endpoints
app.post('/api/rentals/create', express.json(), async (req, res) => {
  let { inventory_id, customer_id, staff_id = 1 } = req.body;
  
  if (!inventory_id || !customer_id) {
    return res.status(400).json({ error: 'inventory_id and customer_id are required.' });
  }

  // Normalize inventory_id to array
  const inventoryIds = Array.isArray(inventory_id) ? inventory_id : [inventory_id];
  
  if (inventoryIds.length === 0) {
    return res.status(400).json({ error: 'At least one inventory_id is required.' });
  }

  try {
    // Check if customer exists
    const customer = await Customer.findByPk(customer_id);
    if (!customer) {
      return res.status(400).json({ error: 'Customer not found.' });
    }

    // Check which inventory items are available (not currently rented)
    const availableInventory = await sequelize.query(`
      SELECT i.inventory_id, i.film_id, i.store_id, f.title
      FROM inventory i
      JOIN film f ON i.film_id = f.film_id
      WHERE i.inventory_id IN (${inventoryIds.map(() => '?').join(',')})
      AND NOT EXISTS (
        SELECT 1 FROM rental r 
        WHERE r.inventory_id = i.inventory_id 
        AND r.return_date IS NULL
      )
    `, {
      replacements: inventoryIds,
      type: sequelize.QueryTypes.SELECT
    });

    if (availableInventory.length === 0) {
      return res.status(400).json({ error: 'No inventory items are available for rental.' });
    }

    // Check for unavailable items
    const availableIds = availableInventory.map(item => item.inventory_id);
    const unavailableIds = inventoryIds.filter(id => !availableIds.includes(id));

    // Create rentals for all available inventory items
    const rentalPromises = availableInventory.map(item => 
      Rental.create({
        inventory_id: item.inventory_id,
        customer_id,
        staff_id,
        rental_date: new Date(),
        last_update: new Date()
      })
    );

    const createdRentals = await Promise.all(rentalPromises);

    // Format response with rental details
    const rentalsWithDetails = createdRentals.map((rental, index) => ({
      rental_id: rental.rental_id,
      inventory_id: rental.inventory_id,
      customer_id: rental.customer_id,
      staff_id: rental.staff_id,
      rental_date: rental.rental_date,
      film_title: availableInventory[index].title,
      store_id: availableInventory[index].store_id
    }));

    const response = {
      success: true,
      message: `${createdRentals.length} rental(s) created successfully.`,
      rentals: rentalsWithDetails,
      created_count: createdRentals.length,
      requested_count: inventoryIds.length
    };

    // Include information about unavailable items if any
    if (unavailableIds.length > 0) {
      response.warning = `${unavailableIds.length} inventory item(s) were not available for rental.`;
      response.unavailable_inventory_ids = unavailableIds;
    }

    res.status(201).json(response);
  } catch (err) {
    console.error('Error creating rental:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.put('/api/rentals/return', express.json(), async (req, res) => {
  const { rental_id } = req.body;
  
  if (!rental_id) {
    return res.status(400).json({ error: 'rental_id is required.' });
  }

  try {
    // Find the rental and check if it exists and hasn't been returned yet
    const rental = await Rental.findByPk(rental_id, {
      include: [
        {
          model: Inventory,
          as: 'inventory',
          include: [
            {
              model: Film,
              as: 'film',
              attributes: ['title']
            }
          ]
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['first_name', 'last_name']
        }
      ]
    });

    if (!rental) {
      return res.status(404).json({ error: 'Rental not found.' });
    }

    if (rental.return_date) {
      return res.status(400).json({ error: 'This rental has already been returned.' });
    }

    // Update the rental with return date
    await rental.update({
      return_date: new Date(),
      last_update: new Date()
    });

    res.json({
      success: true,
      message: 'Rental returned successfully.',
      rental: {
        rental_id: rental.rental_id,
        return_date: rental.return_date,
        film_title: rental.inventory.film.title,
        customer_name: `${rental.customer.first_name} ${rental.customer.last_name}`
      }
    });
  } catch (err) {
    console.error('Error returning rental:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/rentals/active', async (req, res) => {
  const { customer_id, page = 1, pageSize = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  try {
    let where = { return_date: null }; // Only active rentals
    if (customer_id) {
      where.customer_id = customer_id;
    }

    const { count, rows } = await Rental.findAndCountAll({
      where,
      include: [
        {
          model: Inventory,
          as: 'inventory',
          include: [
            {
              model: Film,
              as: 'film',
              attributes: ['film_id', 'title', 'rental_rate', 'rental_duration']
            },
            {
              model: Store,
              as: 'store',
              attributes: ['store_id']
            }
          ]
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['customer_id', 'first_name', 'last_name', 'email']
        }
      ],
      limit: parseInt(pageSize),
      offset,
      order: [['rental_date', 'DESC']]
    });

    res.json({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total: count,
      activeRentals: rows
    });
  } catch (err) {
    console.error('Error fetching active rentals:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/rentals/history', async (req, res) => {
  const { customer_id, page = 1, pageSize = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  try {
    let where = {};
    if (customer_id) {
      where.customer_id = customer_id;
    }

    const { count, rows } = await Rental.findAndCountAll({
      where,
      include: [
        {
          model: Inventory,
          as: 'inventory',
          include: [
            {
              model: Film,
              as: 'film',
              attributes: ['film_id', 'title', 'rental_rate']
            },
            {
              model: Store,
              as: 'store',
              attributes: ['store_id']
            }
          ]
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['customer_id', 'first_name', 'last_name', 'email']
        }
      ],
      limit: parseInt(pageSize),
      offset,
      order: [['rental_date', 'DESC']]
    });

    res.json({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total: count,
      rentalHistory: rows
    });
  } catch (err) {
    console.error('Error fetching rental history:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/rentals/overdue', async (req, res) => {
  const { page = 1, pageSize = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  try {
    // Get rentals that are overdue (more than 7 days old and not returned)
    const overdueRentals = await sequelize.query(`
      SELECT 
        r.rental_id,
        r.rental_date,
        r.customer_id,
        r.inventory_id,
        DATEDIFF(NOW(), r.rental_date) as days_overdue,
        f.title as film_title,
        f.rental_rate,
        c.first_name,
        c.last_name,
        c.email,
        s.store_id
      FROM rental r
      JOIN inventory i ON r.inventory_id = i.inventory_id
      JOIN film f ON i.film_id = f.film_id
      JOIN customer c ON r.customer_id = c.customer_id
      JOIN store s ON i.store_id = s.store_id
      WHERE r.return_date IS NULL
      AND DATEDIFF(NOW(), r.rental_date) > 7
      ORDER BY days_overdue DESC
      LIMIT ? OFFSET ?
    `, {
      replacements: [parseInt(pageSize), offset],
      type: sequelize.QueryTypes.SELECT
    });

    // Get total count of overdue rentals
    const countResult = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM rental r
      WHERE r.return_date IS NULL
      AND DATEDIFF(NOW(), r.rental_date) > 7
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total: countResult[0].total,
      overdueRentals
    });
  } catch (err) {
    console.error('Error fetching overdue rentals:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Dropdown endpoints
app.get('/api/languages/options', async (req, res) => {
  try {
    const languages = await Language.findAll({
      attributes: ['language_id', 'name'],
      order: [['name', 'ASC']]
    });
    res.json(languages.map(lang => ({
      language_id: lang.language_id,
      name: lang.name
    })));
  } catch (err) {
    console.error('Error fetching languages:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/categories/options', async (req, res) => {
  try {
    const categories = await Category.findAll({
      attributes: ['category_id', 'name'],
      order: [['name', 'ASC']]
    });
    res.json(categories.map(cat => ({
      category_id: cat.category_id,
      name: cat.name
    })));
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/stores/options', async (req, res) => {
  try {
    const stores = await Store.findAll({
      attributes: ['store_id', 'manager_staff_id', 'address_id'],
      order: [['store_id', 'ASC']]
    });
    res.json(stores.map(store => ({
      store_id: store.store_id,
      manager_staff_id: store.manager_staff_id,
      address_id: store.address_id,
      label: `Store ${store.store_id}` // Friendly display name
    })));
  } catch (err) {
    console.error('Error fetching stores:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Customer endpoints
app.get('/api/customers/by-id', async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing customer id in query parameter.' });
  }
  try {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json({ customer });
  } catch (err) {
    console.error('Error fetching customer by id:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.put('/api/customers/edit', express.json(), async (req, res) => {
  const { 
    customer_id, 
    first_name, 
    last_name, 
    email, 
    store_id, 
    address_id, 
    active 
  } = req.body;
  
  if (!customer_id) {
    return res.status(400).json({ error: 'Customer id is required.' });
  }
  
  try {
    // Build update object with only provided fields
    const updateData = {};
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (email !== undefined) updateData.email = email;
    if (store_id !== undefined) updateData.store_id = store_id;
    if (address_id !== undefined) updateData.address_id = address_id;
    if (active !== undefined) updateData.active = active;
    
    // Always update last_update timestamp
    updateData.last_update = new Date();
    
    const [affectedRows] = await Customer.update(
      updateData,
      { where: { customer_id } }
    );
    
    if (affectedRows === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    
    // Fetch and return the updated customer
    const updatedCustomer = await Customer.findByPk(customer_id);
    
    res.json({ 
      success: true, 
      message: 'Customer updated successfully.',
      customer: updatedCustomer
    });
  } catch (err) {
    console.error('Error updating customer:', err);
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: 'Validation error: ' + err.message });
    }
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ error: 'Foreign key constraint error: Invalid store_id or address_id.' });
    }
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/api/customers', async (req, res) => {
  const { page = 1, pageSize = 10, store_id, active } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  try {
    let where = {};
    if (store_id) where.store_id = store_id;
    if (active !== undefined) where.active = active === 'true';
    
    const { count, rows } = await Customer.findAndCountAll({
      where,
      attributes: ['customer_id', 'first_name', 'last_name', 'email', 'store_id', 'active', 'create_date'],
      limit: parseInt(pageSize),
      offset,
      order: [['last_name', 'ASC'], ['first_name', 'ASC']]
    });
    
    res.json({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total: count,
      customers: rows
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
