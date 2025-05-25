const mysql = require("mysql2/promise");
require("dotenv").config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "sales_management",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully");
    console.log(
      `📊 Connected to: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`
    );

    // Test query to users table
    const [rows] = await connection.execute(
      "SELECT COUNT(*) as count FROM users"
    );
    console.log(`👥 Users found: ${rows[0].count}`);

    // Get sample user data
    const [userRows] = await connection.execute(
      "SELECT id, email, username, role FROM users LIMIT 2"
    );
    if (userRows.length > 0) {
      console.log("📧 Sample users:");
      userRows.forEach((user) => {
        console.log(
          `  - ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`
        );
      });
    }

    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    console.error("\n🔧 Please check:");
    console.error("  1. MySQL server is running");
    console.error('  2. Database "sales_management" exists');
    console.error("  3. Username and password are correct");
    console.error("  4. Users table exists");
    return false;
  }
}

// Get user by email from users table
async function getUserByEmail(email) {
  try {
    const connection = await pool.getConnection();
    const query = `SELECT id, username, email, password, role, full_name, is_active FROM users WHERE email = ? AND is_active = 1`;

    const [rows] = await connection.execute(query, [email]);
    connection.release();

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error getting user by email:", error.message);
    throw error;
  }
}

// Get user by username from users table
async function getUserByUsername(username) {
  try {
    const connection = await pool.getConnection();
    const query = `SELECT id, username, email, password, role, full_name, is_active FROM users WHERE username = ? AND is_active = 1`;

    const [rows] = await connection.execute(query, [username]);
    connection.release();

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error getting user by username:", error.message);
    throw error;
  }
}

// Get user by email or username
async function getUserByEmailOrUsername(identifier) {
  try {
    const connection = await pool.getConnection();
    const query = `
      SELECT id, username, email, password, role, full_name, is_active 
      FROM users 
      WHERE (email = ? OR username = ?) AND is_active = 1
    `;

    const [rows] = await connection.execute(query, [identifier, identifier]);
    connection.release();

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error getting user:", error.message);
    throw error;
  }
}

// Update user last login (optional - you may need to add last_login column)
async function updateUserLastLogin(userId) {
  try {
    const connection = await pool.getConnection();

    // Check if last_login column exists
    const [columns] = await connection.execute("DESCRIBE users");
    const hasLastLogin = columns.some((col) => col.Field === "last_login");

    if (hasLastLogin) {
      const query = `UPDATE users SET updated_at = NOW() WHERE id = ?`;
      await connection.execute(query, [userId]);
    } else {
      // Just update the updated_at timestamp
      const query = `UPDATE users SET updated_at = NOW() WHERE id = ?`;
      await connection.execute(query, [userId]);
    }

    connection.release();
  } catch (error) {
    console.error("Error updating user login:", error.message);
    // Don't throw error for this optional operation
  }
}

// Get user info by ID (for JWT verification)
async function getUserById(userId) {
  try {
    const connection = await pool.getConnection();
    const query = `SELECT id, username, email, role, full_name, is_active FROM users WHERE id = ? AND is_active = 1`;

    const [rows] = await connection.execute(query, [userId]);
    connection.release();

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error getting user by ID:", error.message);
    throw error;
  }
}

// Get all active users (for management purposes)
async function getAllUsers() {
  try {
    const connection = await pool.getConnection();
    const query = `
      SELECT id, username, email, role, full_name, created_at, updated_at, is_active
      FROM users 
      WHERE is_active = 1
      ORDER BY created_at DESC
    `;

    const [rows] = await connection.execute(query);
    connection.release();

    return rows;
  } catch (error) {
    console.error("Error getting all users:", error.message);
    throw error;
  }
}

// Check database and table structure
async function checkDatabaseStructure() {
  try {
    const connection = await pool.getConnection();

    console.log("\n📋 Database Structure Check:");

    // Check if users table exists
    const [tables] = await connection.execute('SHOW TABLES LIKE "users"');
    if (tables.length === 0) {
      console.log("❌ Users table does not exist");
      connection.release();
      return false;
    }

    // Check users table structure
    const [columns] = await connection.execute("DESCRIBE users");
    console.log("✅ Users table structure:");
    columns.forEach((col) => {
      console.log(
        `  - ${col.Field}: ${col.Type} ${col.Null === "NO" ? "(NOT NULL)" : ""}`
      );
    });

    // Check required columns
    const requiredColumns = ["id", "email", "password"];
    const existingColumns = columns.map((col) => col.Field);
    const missingColumns = requiredColumns.filter(
      (col) => !existingColumns.includes(col)
    );

    if (missingColumns.length > 0) {
      console.log(`❌ Missing required columns: ${missingColumns.join(", ")}`);
      connection.release();
      return false;
    }

    console.log("✅ All required columns exist");
    connection.release();
    return true;
  } catch (error) {
    console.error("Error checking database structure:", error.message);
    return false;
  }
}

// Export functions and pool
module.exports = {
  pool,
  testConnection,
  getUserByEmail,
  getUserByUsername,
  getUserByEmailOrUsername,
  updateUserLastLogin,
  getUserById,
  getAllUsers,
  checkDatabaseStructure,
};
