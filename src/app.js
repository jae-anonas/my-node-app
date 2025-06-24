// Import required modules
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');
var cors = require('cors');
const path = require('path');

// Sequelize setup
const { Sequelize } = require('sequelize');
const UserModel = require('../models/user');
const FilmModel = require('../models/film');
const FilmCategoryModel = require('../models/film_category');
const CategoryModel = require('../models/category');

const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql'
  }
);

const User = UserModel(sequelize);
const Film = FilmModel(sequelize);
const FilmCategory = FilmCategoryModel(sequelize);
const Category = CategoryModel(sequelize);

// Set up associations
if (User.associate) User.associate({});
if (Film.associate) Film.associate({ Category, FilmCategory });
if (Category.associate) Category.associate({ Film, FilmCategory });
if (FilmCategory.associate) FilmCategory.associate({ Film, Category });

// Initialize Express app
const app = express();
app.use(cors());
const port = 3000;

// Create a MySQL connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE
});

// Serve static files from Angular build output
app.use(express.static(path.join(__dirname, '../my-angular-app/dist/my-angular-app/browser')));

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
  res.sendFile(path.join(__dirname, '../my-angular-app/dist/my-angular-app/browser/index.html'));
});

// Define a route to handle SQL queries
app.get('/query', (req, res) => {
  const sqlQuery = "select i.inventory_id, f.title from sakila.inventory i inner join film f limit 10;"; // Replace with your SQL query

  db.query(sqlQuery, (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).send('Database query failed');
    } else {
      res.json(results); // Send query results as JSON
    }
  });
});

app.post('/signin', express.json(), async (req, res) => {
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
app.post('/signup', express.json(), async (req, res) => {
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

// /users endpoint using Sequelize
app.get('/users', async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

// /users/by-id endpoint using Sequelize
app.get('/users/by-id', async (req, res) => {
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

// /users/edit endpoint using Sequelize
app.put('/users/edit', express.json(), async (req, res) => {
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

app.get('/films', (req, res) => {
  // Pagination parameters
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  // Query to get films with their category name
  const sql = `
    SELECT f.*, fc.category_id, c.name as category_name
    FROM film f
    LEFT JOIN film_category fc ON f.film_id = fc.film_id
    LEFT JOIN category c ON fc.category_id = c.category_id
    LIMIT ? OFFSET ?
  `;

  db.query(sql, [pageSize, offset], (err, results) => {
    if (err) {
      console.error('Error fetching films:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    res.json({
      page,
      pageSize,
      films: results
    });
  });
});

app.get('/films/search', (req, res) => {
  // Filters from query params
  const { title, category, minYear, maxYear, rating, page = 1, pageSize = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  // Build dynamic WHERE clauses
  let whereClauses = [];
  let params = [];

  if (title) {
    whereClauses.push('f.title LIKE ?');
    params.push(`%${title}%`);
  }
  if (category) {
    whereClauses.push('c.name = ?');
    params.push(category);
  }
  if (minYear) {
    whereClauses.push('f.release_year >= ?');
    params.push(minYear);
  }
  if (maxYear) {
    whereClauses.push('f.release_year <= ?');
    params.push(maxYear);
  }
  if (rating) {
    whereClauses.push('f.rating = ?');
    params.push(rating);
  }

  let where = whereClauses.length ? 'WHERE ' + whereClauses.join(' OR ') : '';

  const sql = `
    SELECT f.*, fc.category_id, c.name as category_name
    FROM film f
    LEFT JOIN film_category fc ON f.film_id = fc.film_id
    LEFT JOIN category c ON fc.category_id = c.category_id
    ${where}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total
    FROM film f
    LEFT JOIN film_category fc ON f.film_id = fc.film_id
    LEFT JOIN category c ON fc.category_id = c.category_id
    ${where}
  `;

  // Get total count first
  db.query(countSql, params, (err, countResults) => {
    if (err) {
      console.error('Error fetching film count:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    const total = countResults[0].total;
    // Add pagination params for main query
    db.query(sql, [...params, parseInt(pageSize), offset], (err, results) => {
      if (err) {
        console.error('Error searching films:', err);
        return res.status(500).json({ error: 'Database error.' });
      }
      res.json({
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        films: results
      });
    });
  });
});

app.post('/films/by-categories', express.json(), async (req, res) => {
  const { categories, limit } = req.body;
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: 'categories must be a non-empty array of category names.' });
  }
  const filmsByCategory = [];
  const filmLimit = parseInt(limit) || 5;

  // Helper to run a query and return a promise
  function queryAsync(sql, params) {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }

  try {
    for (const category of categories) {
      const sql = `
        SELECT f.*, fc.category_id, c.name as category_name
        FROM film f
        LEFT JOIN film_category fc ON f.film_id = fc.film_id
        LEFT JOIN category c ON fc.category_id = c.category_id
        WHERE c.name = ?
        LIMIT ?
      `;
      const films = await queryAsync(sql, [category, filmLimit]);
      filmsByCategory.push({ category, films });
    }
    res.json(filmsByCategory);
  } catch (err) {
    console.error('Error fetching films by categories:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

app.get('/users/by-id', async (req, res) => {
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

app.put('/users/edit', express.json(), async (req, res) => {
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

app.get('/films/by-id', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing film id in query parameter.' });
  }
  const sql = `
    SELECT f.*, fc.category_id, c.name as category_name
    FROM film f
    LEFT JOIN film_category fc ON f.film_id = fc.film_id
    LEFT JOIN category c ON fc.category_id = c.category_id
    WHERE f.film_id = ?
    LIMIT 1
  `;
  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('Error fetching film by id:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'Film not found.' });
    }
    res.json({ film: results[0] });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
