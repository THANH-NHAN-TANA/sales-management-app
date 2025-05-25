const mysql = require("mysql2/promise");
require("dotenv").config();

// Database configuration - Loại bỏ các options không hợp lệ
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "salesapp",
  password: process.env.DB_PASSWORD || "SalesApp@123",
  database: process.env.DB_NAME || "sales_management",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
};

const pool = mysql.createPool(dbConfig);

// Test connection function - Sửa SQL query
async function testConnection() {
  try {
    console.log("🔍 Testing database connection...");
    console.log(`   User: ${dbConfig.user}`);
    console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   Database: ${dbConfig.database}`);

    const connection = await pool.getConnection();
    await connection.ping();
    console.log("✅ Database ping successful");

    // Test basic query
    const [result] = await connection.execute("SELECT 1 as test");
    console.log("✅ Test query successful");

    // Sửa SQL query - không dùng current_user làm alias
    const [userResult] = await connection.execute("SELECT USER() as user_info");
    console.log(`✅ Connected as: ${userResult[0].user_info}`);

    // Test database selection
    const [dbResult] = await connection.execute("SELECT DATABASE() as db_name");
    console.log(`✅ Database: ${dbResult[0].db_name}`);

    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    console.error("❌ Error code:", error.code);

    if (error.code === "ER_ACCESS_DENIED_ERROR") {
      console.error("💡 Check database credentials in .env file");
      console.error("   DB_USER=salesapp");
      console.error("   DB_PASSWORD=SalesApp@123");
    } else if (error.code === "ECONNREFUSED") {
      console.error("💡 MySQL server is not running");
      console.error("   Start with: sudo systemctl start mysql");
    } else if (error.code === "ER_BAD_DB_ERROR") {
      console.error("💡 Database 'sales_management' does not exist");
      console.error("   Create with: CREATE DATABASE sales_management;");
    } else if (error.code === "ER_PARSE_ERROR") {
      console.error("💡 SQL syntax error - this is a code issue");
    }
    return false;
  }
}

// Check database structure
async function checkDatabaseStructure() {
  try {
    console.log("🔍 Checking database structure...");
    const connection = await pool.getConnection();

    const requiredTables = [
      "users",
      "products",
      "customers",
      "orders",
      "order_items",
      "password_resets",
      "user_sessions",
    ];

    let allTablesExist = true;

    for (const tableName of requiredTables) {
      try {
        const [tables] = await connection.execute(
          `SHOW TABLES LIKE '${tableName}'`
        );
        if (tables.length === 0) {
          console.log(`⚠️  Table ${tableName} not found`);
          allTablesExist = false;
        } else {
          const [count] = await connection.execute(
            `SELECT COUNT(*) as count FROM ${tableName}`
          );
          console.log(
            `✅ Table ${tableName} exists (${count[0].count} records)`
          );
        }
      } catch (error) {
        console.log(`❌ Error checking table ${tableName}:`, error.message);
        allTablesExist = false;
      }
    }

    // Kiểm tra users có thể đăng nhập
    try {
      const [users] = await connection.execute(
        "SELECT id, username, email, role FROM users WHERE is_active = 1 LIMIT 5"
      );

      if (users.length > 0) {
        console.log("👤 Available users for login:");
        users.forEach((user) => {
          console.log(`   - ${user.username} (${user.role}): ${user.email}`);
        });
      }
    } catch (error) {
      console.log("⚠️  Could not check users:", error.message);
    }

    connection.release();

    if (allTablesExist) {
      console.log("✅ All required tables exist");
    } else {
      console.log("⚠️  Some tables are missing but app can still run");
    }

    return true;
  } catch (error) {
    console.error("❌ Database structure check failed:", error.message);
    return false;
  }
}

// FIXED: Get user functions - only use existing columns
async function getUserByEmailOrUsername(identifier) {
  try {
    console.log(`🔍 Looking up user: ${identifier}`);

    // Only select columns that exist in the database
    const [rows] = await pool.execute(
      `SELECT id, username, email, password, role, full_name, is_active, created_at, updated_at 
       FROM users 
       WHERE (email = ? OR username = ?) AND is_active = 1 
       LIMIT 1`,
      [identifier, identifier]
    );

    if (rows.length === 0) {
      console.log(`❌ User not found: ${identifier}`);
      return null;
    }

    const user = rows[0];
    console.log(
      `👤 User found: { id: ${user.id}, username: ${user.username}, active: ${user.is_active} }`
    );

    return user;
  } catch (error) {
    console.error("❌ Error getting user:", error.message);
    throw error;
  }
}

async function getUserById(id) {
  try {
    // Only select columns that exist in the database
    const [rows] = await pool.execute(
      `SELECT id, username, email, password, role, full_name, is_active, created_at, updated_at 
       FROM users 
       WHERE id = ? AND is_active = 1 
       LIMIT 1`,
      [id]
    );

    return rows[0] || null;
  } catch (error) {
    console.error("❌ Error getting user by ID:", error.message);
    throw error;
  }
}

async function updateUserLastLogin(userId) {
  try {
    // Check if last_login column exists, if not just skip the update
    const [columns] = await pool.execute("DESCRIBE users");
    const hasLastLogin = columns.some((col) => col.Field === "last_login");

    if (hasLastLogin) {
      await pool.execute("UPDATE users SET last_login = NOW() WHERE id = ?", [
        userId,
      ]);
    } else {
      // Just update updated_at since last_login doesn't exist
      await pool.execute("UPDATE users SET updated_at = NOW() WHERE id = ?", [
        userId,
      ]);
    }
    return true;
  } catch (error) {
    console.error("❌ Error updating last login:", error.message);
    return false;
  }
}

// Close connection
async function closeConnection() {
  try {
    await pool.end();
    console.log("✅ Database connection closed");
  } catch (error) {
    console.error("❌ Error closing database connection:", error);
  }
}

// Export all functions
module.exports = {
  pool,
  testConnection,
  checkDatabaseStructure,
  getUserByEmailOrUsername,
  getUserById,
  updateUserLastLogin,
  closeConnection,
};
