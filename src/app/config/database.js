// config/database.js - Hoàn chỉnh cho Sales Management System

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
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
};

const pool = mysql.createPool(dbConfig);

// ===================== CONNECTION & SETUP FUNCTIONS =====================

// Test connection function
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

    // Get current user info
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
      "categories",
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

    // Check available users
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

// ===================== USER FUNCTIONS =====================

async function getUserByEmailOrUsername(identifier) {
  try {
    console.log(`🔍 Looking up user: ${identifier}`);

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
    // Check if last_login column exists
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

async function updateUserProfile(userId, data) {
  try {
    const { fullName, password } = data;
    let query = "UPDATE users SET updated_at = NOW()";
    let params = [];

    if (fullName !== undefined) {
      query += ", full_name = ?";
      params.push(fullName);
    }

    if (password) {
      query += ", password = ?";
      params.push(password);
    }

    query += " WHERE id = ?";
    params.push(userId);

    await pool.execute(query, params);
    return true;
  } catch (error) {
    console.error("❌ Update user profile error:", error);
    return false;
  }
}

// ===================== CATEGORY FUNCTIONS =====================

async function getAllCategories() {
  try {
    const [rows] = await pool.execute(`
      SELECT id, name, name_en, description, icon, status, created_at, updated_at
      FROM categories 
      WHERE status = 'active' 
      ORDER BY id
    `);
    return rows;
  } catch (error) {
    console.error("❌ Get categories error:", error);
    return [];
  }
}

async function getCategoryById(id) {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM categories WHERE id = ? AND status = 'active'",
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    console.error("❌ Get category by ID error:", error);
    return null;
  }
}

// ===================== PRODUCT FUNCTIONS =====================

async function getAllProducts(filters = {}) {
  try {
    let query = `
      SELECT 
        p.id, p.product_code, p.name, p.description, p.price, p.stock, 
        p.category, p.category_id, p.image_url, p.is_active, 
        p.created_at, p.updated_at,
        c.name as category_name, c.name_en as category_name_en, c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1
    `;
    let params = [];

    // Apply filters
    if (filters.category_id) {
      query += " AND p.category_id = ?";
      params.push(filters.category_id);
    }

    if (filters.category) {
      query += " AND (p.category LIKE ? OR c.name LIKE ?)";
      params.push(`%${filters.category}%`, `%${filters.category}%`);
    }

    if (filters.minPrice) {
      query += " AND p.price >= ?";
      params.push(parseFloat(filters.minPrice));
    }

    if (filters.maxPrice) {
      query += " AND p.price <= ?";
      params.push(parseFloat(filters.maxPrice));
    }

    if (filters.inStock === "true") {
      query += " AND p.stock > 0";
    }

    if (filters.search) {
      query +=
        " AND (p.name LIKE ? OR p.description LIKE ? OR p.product_code LIKE ?)";
      params.push(
        `%${filters.search}%`,
        `%${filters.search}%`,
        `%${filters.search}%`
      );
    }

    query += " ORDER BY p.created_at DESC";

    const [rows] = await pool.execute(query, params);

    // Format price for Vietnamese currency
    return rows.map((product) => ({
      ...product,
      price_vnd: formatVNDCurrency(product.price),
      stock_status: getStockStatus(product.stock),
    }));
  } catch (error) {
    console.error("❌ Get products error:", error);
    return [];
  }
}

async function getProductById(id) {
  try {
    const [rows] = await pool.execute(
      `
      SELECT 
        p.*, 
        c.name as category_name, c.name_en as category_name_en, c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ? AND p.is_active = 1
    `,
      [id]
    );

    if (rows[0]) {
      return {
        ...rows[0],
        price_vnd: formatVNDCurrency(rows[0].price),
        stock_status: getStockStatus(rows[0].stock),
      };
    }
    return null;
  } catch (error) {
    console.error("❌ Get product by ID error:", error);
    return null;
  }
}

async function createProduct(productData) {
  try {
    const {
      name,
      description,
      price,
      stock,
      category_id,
      image_url,
      product_code,
    } = productData;

    // Generate product code if not provided
    let generatedCode = product_code;
    if (!generatedCode) {
      const [maxResult] = await pool.execute(
        "SELECT MAX(CAST(SUBSTRING(product_code, 3) AS UNSIGNED)) as max_num FROM products WHERE product_code LIKE 'pr%'"
      );
      const nextNum = (maxResult[0].max_num || 21) + 1;
      generatedCode = `pr${nextNum.toString().padStart(2, "0")}`;
    }

    // Get category name
    const category = await getCategoryById(category_id);

    const [result] = await pool.execute(
      `
      INSERT INTO products (product_code, name, description, price, stock, category, category_id, image_url, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
      [
        generatedCode,
        name,
        description || null,
        price,
        stock,
        category ? category.name : null,
        category_id,
        image_url || null,
      ]
    );

    return {
      id: result.insertId,
      product_code: generatedCode,
      category: category ? category.name : null,
      category_id,
      image_url,
      ...productData,
    };
  } catch (error) {
    console.error("❌ Create product error:", error);
    throw error;
  }
}

async function updateProduct(id, productData) {
  try {
    const { name, description, price, stock, category_id, image_url } =
      productData;

    // Get category name
    const category = await getCategoryById(category_id);

    await pool.execute(
      `
      UPDATE products 
      SET name = ?, description = ?, price = ?, stock = ?, category = ?, category_id = ?, 
          image_url = ?, updated_at = NOW()
      WHERE id = ? AND is_active = 1
    `,
      [
        name,
        description || null,
        price,
        stock,
        category ? category.name : null,
        category_id,
        image_url || null,
        id,
      ]
    );

    const updatedProduct = await getProductById(id);
    return updatedProduct;
  } catch (error) {
    console.error("❌ Update product error:", error);
    throw error;
  }
}

async function deleteProduct(id) {
  try {
    // Soft delete - set is_active to 0
    const [result] = await pool.execute(
      "UPDATE products SET is_active = 0, updated_at = NOW() WHERE id = ?",
      [id]
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error("❌ Delete product error:", error);
    throw error;
  }
}

async function checkProductInOrders(productId) {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) as count FROM order_items WHERE product_id = ?",
      [productId]
    );
    return rows[0].count > 0;
  } catch (error) {
    console.error("❌ Check product in orders error:", error);
    return false;
  }
}

// ===================== CUSTOMER FUNCTIONS =====================

async function getAllCustomers() {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, phone, address, is_active, created_at, updated_at
       FROM customers 
       WHERE is_active = 1 
       ORDER BY created_at DESC`
    );
    return rows;
  } catch (error) {
    console.error("❌ Get customers error:", error);
    return [];
  }
}

async function getCustomerById(id) {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM customers WHERE id = ? AND is_active = 1",
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    console.error("❌ Get customer by ID error:", error);
    return null;
  }
}

// ===================== ORDER FUNCTIONS =====================

async function getAllOrders() {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        o.id, o.total_amount, o.status, o.order_date, o.delivery_date, o.notes,
        c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
        FORMAT(o.total_amount, 0) as amount_formatted,
        DATE_FORMAT(o.order_date, '%d/%m/%Y %H:%i') as order_date_formatted
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.order_date DESC
    `);

    return rows.map((order) => ({
      ...order,
      amount_vnd: formatVNDCurrency(order.total_amount),
      status_text: getOrderStatusText(order.status),
    }));
  } catch (error) {
    console.error("❌ Get orders error:", error);
    return [];
  }
}

async function getOrderWithItems(orderId) {
  try {
    // Get order info
    const [orderRows] = await pool.execute(
      `
      SELECT 
        o.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
        FORMAT(o.total_amount, 0) as amount_formatted
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `,
      [orderId]
    );

    if (orderRows.length === 0) return null;

    // Get order items with product details
    const [itemRows] = await pool.execute(
      `
      SELECT 
        oi.*, 
        p.name as product_name, p.image_url as product_image,
        p.product_code, cat.name as category_name,
        FORMAT(oi.unit_price, 0) as unit_price_formatted,
        FORMAT(oi.total_price, 0) as total_price_formatted
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      WHERE oi.order_id = ?
    `,
      [orderId]
    );

    return {
      ...orderRows[0],
      amount_vnd: formatVNDCurrency(orderRows[0].total_amount),
      status_text: getOrderStatusText(orderRows[0].status),
      items: itemRows.map((item) => ({
        ...item,
        unit_price_vnd: formatVNDCurrency(item.unit_price),
        total_price_vnd: formatVNDCurrency(
          item.total_price || item.quantity * item.unit_price
        ),
      })),
    };
  } catch (error) {
    console.error("❌ Get order with items error:", error);
    return null;
  }
}

// ===================== DASHBOARD FUNCTIONS =====================

async function getDashboardStats() {
  try {
    // Get product count by category
    const [productStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(DISTINCT category_id) as total_categories
      FROM products WHERE is_active = 1
    `);

    // Get customer count
    const [customerCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM customers WHERE is_active = 1"
    );

    // Get revenue (in VND)
    const [revenueSum] = await pool.execute(`
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM orders 
      WHERE status IN ('delivered', 'shipped')
    `);

    // Get recent transactions with Vietnamese formatting
    const [recentTransactions] = await pool.execute(`
      SELECT 
        CONCAT('#', LPAD(o.id, 4, '0')) as orderId,
        c.name as customerName,
        p.name as productName,
        p.image_url as productImage,
        o.total_amount as amount,
        o.status,
        o.order_date as date,
        FORMAT(o.total_amount, 0) as amount_formatted
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE p.is_active = 1
      ORDER BY o.order_date DESC
      LIMIT 10
    `);

    // Get top selling products
    const [topProducts] = await pool.execute(`
      SELECT 
        p.name,
        p.image_url,
        cat.name as category_name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.unit_price) as revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id AND p.is_active = 1
      JOIN categories cat ON p.category_id = cat.id AND cat.status = 'active'
      GROUP BY p.id, p.name, cat.name
      ORDER BY total_sold DESC
      LIMIT 5
    `);

    // Sales by category
    const [categorySales] = await pool.execute(`
      SELECT 
        c.name as category_name,
        c.icon,
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(oi.quantity), 0) as items_sold,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      LEFT JOIN order_items oi ON p.id = oi.product_id
      WHERE c.status = 'active'
      GROUP BY c.id, c.name, c.icon
      ORDER BY revenue DESC
    `);

    return {
      products: productStats[0].total_products,
      categories: productStats[0].total_categories,
      customers: customerCount[0].count,
      revenue: formatVNDCurrency(revenueSum[0].total),
      revenue_raw: revenueSum[0].total,
      recentTransactions: recentTransactions.map((tx) => ({
        ...tx,
        amount_vnd: formatVNDCurrency(tx.amount),
      })),
      topProducts: topProducts.map((p) => ({
        ...p,
        revenue_vnd: formatVNDCurrency(p.revenue),
      })),
      categorySales: categorySales.map((c) => ({
        ...c,
        revenue_vnd: formatVNDCurrency(c.revenue),
      })),
    };
  } catch (error) {
    console.error("❌ Get dashboard stats error:", error);
    return {
      products: 0,
      categories: 0,
      customers: 0,
      revenue: "0đ",
      revenue_raw: 0,
      recentTransactions: [],
      topProducts: [],
      categorySales: [],
    };
  }
}

// ===================== HELPER FUNCTIONS =====================

// Helper function to format VND currency
function formatVNDCurrency(amount) {
  if (amount >= 1000000) {
    return (amount / 1000000).toFixed(1) + "M đ";
  } else if (amount >= 1000) {
    return Math.round(amount / 1000) + "k đ";
  } else {
    return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
  }
}

// Helper function to get stock status
function getStockStatus(stock) {
  if (stock === 0) {
    return { class: "stock-out", text: "Hết hàng", color: "#dc3545" };
  } else if (stock <= 10) {
    return { class: "stock-low", text: "Sắp hết", color: "#ffc107" };
  } else {
    return { class: "stock-in", text: "Còn hàng", color: "#28a745" };
  }
}

// Helper function for order status
function getOrderStatusText(status) {
  const statusMap = {
    pending: "Chờ xử lý",
    processing: "Đang xử lý",
    shipped: "Đang giao",
    delivered: "Đã giao",
    cancelled: "Đã hủy",
  };
  return statusMap[status] || status;
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

// ===================== EXPORT ALL FUNCTIONS =====================

module.exports = {
  pool,
  testConnection,
  checkDatabaseStructure,

  // User functions
  getUserByEmailOrUsername,
  getUserById,
  updateUserLastLogin,
  updateUserProfile,

  // Category functions
  getAllCategories,
  getCategoryById,

  // Product functions
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  checkProductInOrders,

  // Customer functions
  getAllCustomers,
  getCustomerById,

  // Order functions
  getAllOrders,
  getOrderWithItems,

  // Dashboard functions
  getDashboardStats,

  // Helper functions
  formatVNDCurrency,
  getStockStatus,
  getOrderStatusText,

  // Connection management
  closeConnection,
};
