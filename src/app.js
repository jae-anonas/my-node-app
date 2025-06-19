// Import required modules
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');
var cors = require('cors');

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

app.post('/signin', express.json(), (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  // Hash the password using SHA-256
  console.log(`Attempting login for user: ${username}`);
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  console.log(`Hashed password for user ${username}: ${hash}`);
  const sql = 'SELECT * FROM user WHERE name = ? AND password_hash = ? LIMIT 1';
  db.query(sql, [username, hash], (err, results) => {
    if (err) {
      console.error('Error during login:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    if (results.length === 1) {
      // Login successful
      console.log(`User ${username} logged in successfully.`);
      return res.json({ success: true, message: 'Login successful.', userData: results[0] });
    } else {
      // Login failed
      console.log(`Login failed for user ${username}.`);
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
  });
});

app.post('/signup', express.json(), (req, res) => {
  console.log('Received signup request:', req.body);
  console.log('Received signup request data:', req.body.userData);
  // Validate request body
  const { name, password, email } = req.body.userData || req.body;
  if (!name || !password || !email) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  // Hash the password using SHA-256
  const hash = crypto.createHash('sha256').update(password).digest('hex');

  // Check if user already exists
  const checkSql = 'SELECT * FROM user WHERE name = ? or email= ? LIMIT 1';
  db.query(checkSql, [name, email], (err, results) => {
    if (err) {
      console.error('Error checking user:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    if (results.length > 0) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    // Insert new user
    const insertSql = 'INSERT INTO user (name, password_hash, email) VALUES (?, ?, ?)';
    db.query(insertSql, [name, hash, email], (err, result) => {
      if (err) {
        console.error('Error creating user:', err);
        return res.status(500).json({ error: 'Database error.' });
      }
      return res.status(201).json({ success: true, message: 'User created successfully.' });
    });
  });
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

app.get('/users', (req, res) => {
  const sql = `
    SELECT id, name, email, first_name, last_name, role, created_at, updated_at
    FROM user
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    res.json(results);
  });
});

app.get('/users/by-id', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing user id in query parameter.' });
  }
  const sql = `
    SELECT id, name, email, first_name, last_name, role, created_at, updated_at
    FROM user
    WHERE id = ?
  `;
  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('Error fetching user by id:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user: results[0] });
  });
});

app.put('/users/edit', express.json(), (req, res) => {
  const { id, name, email, first_name, last_name, role } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'User id is required.' });
  }
  const sql = `
    UPDATE user
    SET name = ?, email = ?, first_name = ?, last_name = ?, role = ?, updated_at = NOW()
    WHERE id = ?
  `;
  db.query(sql, [name, email, first_name, last_name, role, id], (err, result) => {
    if (err) {
      console.error('Error updating user:', err);
      return res.status(500).json({ error: 'Database error.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ success: true, message: 'User updated successfully.' });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
