const mysql = require("mysql2/promise");
require("dotenv").config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "salesapp",
  password: process.env.DB_PASSWORD || "SalesApp@123",
  database: process.env.DB_NAME || "sales_management",
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT) || 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  charset: "utf8mb4",
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    console.log("🔍 Testing database connection...");
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

// Check and create database structure
async function checkDatabaseStructure() {
  try {
    console.log("🔍 Checking database structure...");
    const connection = await pool.getConnection();

    // Create users table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        full_name VARCHAR(100) GENERATED ALWAYS AS (CONCAT(IFNULL(first_name, ''), ' ', IFNULL(last_name, ''))) STORED,
        phone VARCHAR(20),
        address TEXT,
        gender ENUM('male', 'female', 'other'),
        birth_date DATE,
        role ENUM('admin', 'manager', 'staff', 'user') DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create default admin user if not exists
    const [adminUsers] = await connection.execute(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      ["admin", "admin@salesmanagement.com"]
    );

    if (adminUsers.length === 0) {
      console.log("📝 Creating default admin user...");
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash("123456", 12);

      await connection.execute(
        `
        INSERT INTO users (
          username, email, password, first_name, last_name,
          role, is_active, email_verified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          "admin",
          "admin@salesmanagement.com",
          hashedPassword,
          "System",
          "Administrator",
          "admin",
          true,
          true,
        ]
      );
      console.log("✅ Default admin user created (admin/123456)");
    }

    // Create additional sample users for testing
    const [testUsers] = await connection.execute(
      "SELECT id FROM users WHERE username IN (?, ?, ?)",
      ["manager", "staff", "user"]
    );

    if (testUsers.length < 3) {
      console.log("📝 Creating sample users...");
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash("123456", 12);

      const sampleUsers = [
        [
          "manager",
          "manager@salesmanagement.com",
          "Sales",
          "Manager",
          "manager",
        ],
        ["staff", "staff@salesmanagement.com", "Staff", "Member", "staff"],
        ["user", "user@salesmanagement.com", "Regular", "User", "user"],
      ];

      for (const [username, email, firstName, lastName, role] of sampleUsers) {
        try {
          await connection.execute(
            `
            INSERT IGNORE INTO users (
              username, email, password, first_name, last_name,
              role, is_active, email_verified
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              username,
              email,
              hashedPassword,
              firstName,
              lastName,
              role,
              true,
              true,
            ]
          );
        } catch (error) {
          // Ignore duplicate errors
          if (!error.message.includes("Duplicate")) {
            console.error(`Error creating user ${username}:`, error.message);
          }
        }
      }
      console.log("✅ Sample users created");
    }

    // Create products table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock INT DEFAULT 0,
        category VARCHAR(100),
        sku VARCHAR(100) UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_category (category),
        INDEX idx_sku (sku),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create customers table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        address TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_email (email),
        INDEX idx_phone (phone),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create orders table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT,
        user_id INT,
        total_amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
        order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_customer (customer_id),
        INDEX idx_user (user_id),
        INDEX idx_status (status),
        INDEX idx_date (order_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create order_items table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        INDEX idx_order (order_id),
        INDEX idx_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    connection.release();
    console.log("✅ Database structure verified/created");
    return true;
  } catch (error) {
    console.error("❌ Database structure check failed:", error);
    return false;
  }
}

// Get user by email or username
async function getUserByEmailOrUsername(identifier) {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1",
      [identifier, identifier]
    );
    return rows[0] || null;
  } catch (error) {
    console.error("Error getting user:", error);
    throw error;
  }
}

// Get user by ID
async function getUserById(id) {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    console.error("Error getting user by ID:", error);
    throw error;
  }
}

// Update user last login
async function updateUserLastLogin(userId) {
  try {
    await pool.execute("UPDATE users SET last_login = NOW() WHERE id = ?", [
      userId,
    ]);
    return true;
  } catch (error) {
    console.error("Error updating last login:", error);
    return false;
  }
}

// Create new user
async function createUser(userData) {
  try {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      phone,
      address,
      gender,
      birthDate,
      role = "user",
    } = userData;

    const [result] = await pool.execute(
      `
      INSERT INTO users (
        username, email, password, first_name, last_name,
        phone, address, gender, birth_date, role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        username,
        email,
        password,
        firstName,
        lastName,
        phone,
        address,
        gender,
        birthDate,
        role,
      ]
    );

    return result.insertId;
  } catch (error) {
    console.error("Error creating user:", error);
    throw error;
  }
}

// Update user
async function updateUser(userId, userData) {
  try {
    const fields = [];
    const values = [];

    // Build dynamic query
    Object.keys(userData).forEach((key) => {
      if (userData[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(userData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(userId);

    const [result] = await pool.execute(
      `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error updating user:", error);
    throw error;
  }
}

// Get all users with pagination
async function getUsers(page = 1, limit = 10, search = "") {
  try {
    const offset = (page - 1) * limit;
    let query = `
      SELECT id, username, email, first_name, last_name, full_name,
             phone, role, is_active, last_login, created_at
      FROM users
    `;
    let countQuery = "SELECT COUNT(*) as total FROM users";
    const params = [];

    if (search) {
      const searchCondition = ` WHERE username LIKE ? OR email LIKE ? OR full_name LIKE ?`;
      query += searchCondition;
      countQuery += searchCondition;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [users] = await pool.execute(query, params);
    const [countResult] = await pool.execute(
      countQuery,
      search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []
    );

    return {
      users,
      total: countResult[0].total,
      page,
      limit,
      totalPages: Math.ceil(countResult[0].total / limit),
    };
  } catch (error) {
    console.error("Error getting users:", error);
    throw error;
  }
}

// Close database connection
async function closeConnection() {
  try {
    await pool.end();
    console.log("✅ Database connection closed");
  } catch (error) {
    console.error("❌ Error closing database connection:", error);
  }
}

// Export functions and pool
module.exports = {
  pool,
  testConnection,
  checkDatabaseStructure,
  getUserByEmailOrUsername,
  getUserById,
  updateUserLastLogin,
  createUser,
  updateUser,
  getUsers,
  closeConnection,
};
