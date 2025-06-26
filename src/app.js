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

const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    dialectOptions: {
      ssl: {
        ca: fs.readFileSync(process.env.DB_SSL_CA || './DigiCertGlobalRootCA.crt.pem')
    }
  }
  }
);

const User = UserModel(sequelize);
const Film = FilmModel(sequelize);
const FilmCategory = FilmCategoryModel(sequelize);
const Category = CategoryModel(sequelize);
const Language = LanguageModel(sequelize);

// Set up associations
if (User.associate) User.associate({});
if (Film.associate) Film.associate({ Category, FilmCategory, Language });
if (Category.associate) Category.associate({ Film, FilmCategory });
if (FilmCategory.associate) FilmCategory.associate({ Film, Category });

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
    const user = await User.findOne({ where: { name: username, password_hash: hash } });
    if (user) {
      // Login successful
      console.log(`User ${username} logged in successfully.`);
      return res.json({ success: true, message: 'Login successful.', userData: user });
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
  const { name, password, email } = req.body.userData || req.body;
  if (!name || !password || !email) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  try {
    const existing = await User.findOne({ where: { [Sequelize.Op.or]: [{ name }, { email }] } });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    await User.create({ name, password_hash: hash, email });
    return res.status(201).json({ success: true, message: 'User created successfully.' });
  } catch (err) {
    console.error('Error creating user:', err);
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
    res.json({
      page,
      pageSize,
      total: count,
      films: rows
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
    res.json({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total: count,
      films: rows
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
    // res.json({ film });
    const filmJson = film.toJSON();
    filmJson.language = filmJson.language ? filmJson.language.name : null;
    filmJson.original_language = filmJson.original_language ? filmJson.original_language.name : null;
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
    // Format response
    const result = foundCategories.map(cat => ({
      category: cat.name,
      films: cat.films || []
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

// Start the server
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
