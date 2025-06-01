const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
require("dotenv").config();

// Database configuration
const dbConfig = {
  host:
    process.env.DB_HOST ||
    "cstore.cju6ggoikqtr.ap-southeast-1.rds.amazonaws.com",
  port: parseInt(process.env.DB_PORT) || 3308,
  user: process.env.DB_USER || "admin",
  password: process.env.DB_PASSWORD || "12345678",
  database: process.env.DB_NAME || "store",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  ssl: {
    rejectUnauthorized: false,
  },
};

const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    console.log("🔍 Testing database connection...");
    console.log(`   User: ${dbConfig.user}`);
    console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   Database: ${dbConfig.database}`);

    const connection = await pool.getConnection();
    await connection.ping();
    console.log("✅ Database ping successful");

    const [result] = await connection.execute("SELECT 1 as test");
    console.log("✅ Test query successful");

    const [userResult] = await connection.execute("SELECT USER() as user_info");
    console.log(`✅ Connected as: ${userResult[0].user_info}`);

    const [dbResult] = await connection.execute("SELECT DATABASE() as db_name");
    console.log(`✅ Database: ${dbResult[0].db_name}`);

    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

// Check database structure
async function checkDatabaseStructure() {
  try {
    console.log("🔍 Checking existing database structure...");
    const connection = await pool.getConnection();

    // Get existing tables
    const [existingTables] = await connection.execute("SHOW TABLES");
    console.log("📋 Existing tables:");
    const expectedTables = [
      "admin",
      "cart",
      "category",
      "favorite",
      "`order`",
      "order_detail",
      "product",
      "rating",
      "user",
      "voucher",
    ];
    const tableNames = existingTables.map((table) => Object.values(table)[0]);
    tableNames.forEach((table) => console.log(`   - ${table}`));

    // Check missing tables
    const missingTables = expectedTables.filter(
      (table) => !tableNames.includes(table.replace(/`/g, ""))
    );
    if (missingTables.length > 0) {
      console.error("❌ Missing tables:", missingTables);
      connection.release();
      return false;
    }

    // Check order table columns
    if (tableNames.includes("order")) {
      const [columns] = await connection.execute("SHOW COLUMNS FROM `order`");
      const columnNames = columns.map((col) => col.Field);
      console.log("📋 Columns in order table:", columnNames);
      const requiredColumns = [
        "id",
        "user_id",
        "total_price",
        "pay_method",
        "status",
        "created_date",
        "updated_at",
        "is_active",
        "discount_applied",
        "payment_status", // Thêm cột mới
      ];
      const missingColumns = requiredColumns.filter(
        (col) => !columnNames.includes(col)
      );
      if (missingColumns.length > 0) {
        console.error("❌ Missing columns in order table:", missingColumns);
        connection.release();
        return false;
      }
    }

    // Check each existing table structure
    for (const tableName of tableNames) {
      try {
        const [count] = await connection.execute(
          `SELECT COUNT(*) as count FROM \`${tableName}\``
        );
        console.log(`✅ Table ${tableName}: ${count[0].count} records`);
      } catch (error) {
        console.log(
          `⚠️ Table ${tableName}: Cannot count records`,
          error.message
        );
      }
    }

    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database structure check failed:", error.message);
    return false;
  }
}

// Get admin by ID
async function getAdminById(id) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, username, email, full_name, is_active, created_at, updated_at, last_login 
       FROM admin 
       WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      username: rows[0].username,
      email: rows[0].email,
      full_name: rows[0].full_name,
      is_active: rows[0].is_active,
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at,
      last_login: rows[0].last_login,
      role: "admin",
    };
  } catch (error) {
    console.error("❌ Error getting admin by ID:", error.message);
    throw error;
  }
}

// Get admin by username or email
async function getAdminByUsernameOrEmail(identifier) {
  try {
    console.log(`🔍 Looking up admin: ${identifier}`);
    const [rows] = await pool.execute(
      `SELECT id, username, email, password, full_name, is_active, created_at, updated_at, last_login 
       FROM admin 
       WHERE username = ? OR email = ?`,
      [identifier, identifier]
    );

    if (rows.length === 0) {
      console.log(`❌ Admin not found: ${identifier}`);
      return null;
    }

    const admin = rows[0];
    console.log(
      `✅ Admin found: { id: ${admin.id}, username: ${admin.username} }`
    );
    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      password: admin.password,
      full_name: admin.full_name,
      is_active: admin.is_active,
      created_at: admin.created_at,
      updated_at: admin.updated_at,
      last_login: admin.last_login,
      role: "admin",
    };
  } catch (error) {
    console.error("❌ Error getting admin:", error.message);
    return null;
  }
}

// Verify admin login
async function verifyAdminLogin(identifier, password) {
  try {
    const admin = await getAdminByUsernameOrEmail(identifier);
    if (!admin) {
      console.log(`❌ Admin not found: ${identifier}`);
      return {
        success: false,
        message: "Tên đăng nhập hoặc email không tồn tại",
      };
    }

    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      console.log(`❌ Invalid password for admin: ${identifier}`);
      return { success: false, message: "Mật khẩu không đúng" };
    }

    console.log(`✅ Admin login successful: ${admin.username}`);
    return {
      success: true,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        full_name: admin.full_name,
        is_active: admin.is_active,
        created_at: admin.created_at,
        updated_at: admin.updated_at,
        last_login: admin.last_login,
      },
    };
  } catch (error) {
    console.error("❌ Error verifying admin login:", error.message);
    return { success: false, message: "Lỗi xác thực admin" };
  }
}

// Update admin last login
async function updateAdminLastLogin(adminId) {
  try {
    await pool.execute(`UPDATE admin SET last_login = NOW() WHERE id = ?`, [
      adminId,
    ]);
    console.log(`✅ Updated last login for admin ID: ${adminId}`);
  } catch (error) {
    console.error("❌ Error updating admin last login:", error.message);
    throw error;
  }
}

// Get all admins
async function getAllAdmins() {
  try {
    const [rows] = await pool.execute(`
      SELECT id, username, email, full_name, is_active, created_at, updated_at, last_login 
      FROM admin 
      ORDER BY created_at DESC
    `);
    return rows.map((admin) => ({
      id: admin.id,
      username: admin.username,
      email: admin.email,
      full_name: admin.full_name,
      is_active: admin.is_active,
      created_at: admin.created_at,
      updated_at: admin.updated_at,
      last_login: admin.last_login,
      role: "admin",
    }));
  } catch (error) {
    console.error("❌ Error getting admins:", error.message);
    return [];
  }
}

// Get all categories
async function getAllCategories() {
  try {
    const [rows] = await pool.execute(`
      SELECT id, name, detail 
      FROM category 
      ORDER BY id
    `);
    return rows.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.detail,
      status: "active",
    }));
  } catch (error) {
    console.error("❌ Error getting categories:", error.message);
    return [];
  }
}

// Get all products
async function getAllProducts(filters = {}) {
  try {
    let query = `
      SELECT 
        p.id, 
        p.category_id, 
        p.name, 
        p.desc AS description, 
        p.price, 
        p.image_url, 
        p.quantity AS stock, 
        p.status, 
        p.hot, 
        p.is_active, 
        c.name AS category_name,
        p.created_at,
        p.updated_at
      FROM product p
      LEFT JOIN category c ON p.category_id = c.id
      WHERE p.is_active = 1 AND p.status = 'in_stock'
    `;
    let params = [];

    // Apply filters
    if (filters.category_id) {
      query += " AND p.category_id = ?";
      params.push(filters.category_id);
    }
    if (filters.search) {
      query += " AND (p.name LIKE ? OR p.desc LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.minPrice) {
      query += " AND p.price >= ?";
      params.push(parseFloat(filters.minPrice));
    }
    if (filters.maxPrice) {
      query += " AND p.price <= ?";
      params.push(parseFloat(filters.maxPrice));
    }

    query += " ORDER BY p.created_at DESC";

    const [rows] = await pool.execute(query, params);
    console.log(
      `🔍 Fetched ${rows.length} products from database with filters:`,
      filters
    );

    return rows.map((product) => {
      const shortDescription =
        product.description && product.description.length > 100
          ? product.description.substring(0, 97) + "..."
          : product.description || "";
      const formattedProduct = {
        id: product.id,
        name: product.name || "Sản phẩm không xác định",
        description: product.description || "",
        short_description: shortDescription,
        price: parseFloat(product.price) || 0,
        stock: Number(product.stock) || 0,
        category_id: product.category_id || "",
        category_name: product.category_name || "Chưa phân loại",
        image_url: product.image_url || "/images/placeholder.jpg",
        status: product.status || "in_stock",
        is_hot: product.hot ? true : false,
        is_active: product.is_active || 0,
        created_at: product.created_at,
        updated_at: product.updated_at,
        price_vnd: formatVNDCurrency(parseFloat(product.price) || 0),
        stock_status: getStockStatus(Number(product.stock) || 0),
      };
      if (!product.id || !product.name || !product.price) {
        console.warn(`⚠️ Invalid product data:`, formattedProduct);
      }
      return formattedProduct;
    });
  } catch (error) {
    console.error("❌ Error getting products:", error.message);
    return [];
  }
}

async function checkDatabaseStructure() {
  try {
    console.log("🔍 Checking existing database structure...");
    const connection = await pool.getConnection();

    // Get existing tables
    const [existingTables] = await connection.execute("SHOW TABLES");
    console.log("📋 Existing tables:");
    const expectedTables = [
      "admin",
      "cart",
      "category",
      "favorite",
      "`order`",
      "order_detail",
      "product",
      "rating",
      "user",
      "voucher",
    ];
    const tableNames = existingTables.map((table) => Object.values(table)[0]);
    tableNames.forEach((table) => console.log(`   - ${table}`));

    // Check missing tables
    const missingTables = expectedTables.filter(
      (table) => !tableNames.includes(table.replace(/`/g, ""))
    );
    if (missingTables.length > 0) {
      console.error("❌ Missing tables:", missingTables);
      connection.release();
      return false;
    }

    // Check product table columns
    if (tableNames.includes("product")) {
      const [columns] = await connection.execute("SHOW COLUMNS FROM product");
      const columnNames = columns.map((col) => col.Field);
      console.log("📋 Columns in product table:", columnNames);
      const requiredColumns = [
        "id",
        "category_id",
        "name",
        "desc",
        "price",
        "quantity",
        "image_url",
        "status",
        "hot",
        "is_active",
        "created_at",
        "updated_at",
      ];
      const missingColumns = requiredColumns.filter(
        (col) => !columnNames.includes(col)
      );
      if (missingColumns.length > 0) {
        console.error("❌ Missing columns in product table:", missingColumns);
        connection.release();
        return false;
      }
    }

    // Check each existing table structure
    for (const tableName of tableNames) {
      try {
        const [count] = await connection.execute(
          `SELECT COUNT(*) as count FROM \`${tableName}\``
        );
        console.log(`✅ Table ${tableName}: ${count[0].count} records`);
      } catch (error) {
        console.log(
          `⚠️ Table ${tableName}: Cannot count records`,
          error.message
        );
      }
    }

    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database structure check failed:", error.message);
    return false;
  }
}

// Get product by ID (Updated)
async function getProductById(id) {
  try {
    const [rows] = await pool.execute(
      `
      SELECT 
        p.id, 
        p.name, 
        p.desc AS description, 
        p.price, 
        p.quantity AS stock, 
        p.status, 
        p.category_id, 
        p.image_url, 
        p.created_at, 
        p.updated_at, 
        c.name AS category_name
      FROM product p
      LEFT JOIN category c ON p.category_id = c.id
      WHERE p.id = ? AND p.is_active = 1 AND p.status = 'in_stock'
      `,
      [id]
    );
    if (rows.length === 0) {
      console.log(`❌ Product not found: ${id}`);
      return null;
    }
    const product = rows[0];
    const formattedProduct = {
      id: product.id,
      name: product.name || "Sản phẩm không xác định",
      description: product.description || "",
      price: parseFloat(product.price) || 0,
      stock: Number(product.stock) || 0,
      status: product.status || "in_stock",
      category_id: product.category_id || "",
      category_name: product.category_name || "Chưa phân loại",
      image_url: product.image_url || "",
      created_at: product.created_at,
      updated_at: product.updated_at,
      price_vnd: formatVNDCurrency(parseFloat(product.price) || 0),
      stock_status: getStockStatus(Number(product.stock) || 0),
    };
    if (!product.id || !product.name || !product.price) {
      console.warn(`⚠️ Invalid product data for ID ${id}:`, formattedProduct);
    }
    return formattedProduct;
  } catch (error) {
    console.error("❌ Error getting product by ID:", error.message);
    return null;
  }
}

// Get all users
async function getAllUsers() {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, email, full_name, profile_pic, phone, role, create_at, is_active, address
      FROM user 
      WHERE is_active = 1
      ORDER BY create_at DESC
      `
    );
    return rows.map((user) => ({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      profile_image: user.profile_pic,
      created_at: user.create_at,
      updated_at: null, // Bảng user không có cột updated_at
      is_active: user.is_active,
    }));
  } catch (error) {
    console.error("❌ Error getting users:", error.message);
    return [];
  }
}

// Get user by ID
async function getUserById(id) {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, full_name, email, phone, address, profile_pic as profile_image, create_at
      FROM user 
      WHERE id = ? AND is_active = 1
      `,
      [id]
    );
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      full_name: rows[0].full_name,
      email: rows[0].email,
      phone: rows[0].phone,
      address: rows[0].address,
      profile_image: rows[0].profile_image,
      created_at: rows[0].create_at,
      updated_at: null,
      is_active: 1,
    };
  } catch (error) {
    console.error("❌ Error getting user by ID:", error.message);
    return null;
  }
}

// Get all orders
async function getAllOrders() {
  try {
    console.log("🔍 Attempting to fetch orders from database...");
    const [rows] = await pool.execute(
      `
      SELECT o.id, o.user_id, u.full_name as customer_name, u.email as customer_email, 
             u.phone as customer_phone, u.address as customer_address, o.total_price, 
             o.created_date, o.status, o.pay_method, o.discount_applied, o.payment_status,
             DATE_FORMAT(o.created_date, '%d/%m/%Y %H:%i') as order_date_formatted
      FROM \`order\` o
      LEFT JOIN user u ON o.user_id = u.id
      ORDER BY o.created_date DESC
      LIMIT 10
      `
    );
    console.log(`✅ Fetched ${rows.length} orders from database`);
    return rows.map((order) => ({
      id: order.id,
      user_id: order.user_id,
      customer_name: order.customer_name || "Khách không xác định",
      customer_email: order.customer_email || "",
      customer_phone: order.customer_phone || "",
      customer_address: order.customer_address || "",
      total_price: parseFloat(order.total_price) || 0,
      created_date: order.created_date,
      status: order.status || "pending",
      pay_method: order.pay_method || "unknown",
      discount_applied: order.discount_applied || 0,
      payment_status: order.payment_status || "unpaid", // Thêm payment_status
      amount_vnd: formatVNDCurrency(parseFloat(order.total_price) || 0),
      status_text: getOrderStatusText(order.status),
      order_date_formatted: order.order_date_formatted || "",
    }));
  } catch (error) {
    console.error("❌ Error getting orders:", {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
    });
    throw new Error(`Lỗi truy vấn đơn hàng: ${error.message}`);
  }
}

// Get order with items
async function getOrderWithItems(orderId) {
  try {
    const [orderRows] = await pool.execute(
      `
      SELECT o.id, o.user_id, u.full_name as customer_name, u.email as customer_email, 
             u.phone as customer_phone, u.address as customer_address, o.total_price, 
             o.created_date, o.status, o.pay_method, o.discount_applied, o.payment_status,
             DATE_FORMAT(o.created_date, '%d/%m/%Y %H:%i') as order_date_formatted
      FROM \`order\` o
      LEFT JOIN user u ON o.user_id = u.id
      WHERE o.id = ?
      `,
      [orderId]
    );

    if (orderRows.length === 0) {
      console.warn(`✅ Đơn hàng không tìm thấy: ${orderId}`);
      return null;
    }

    // Kiểm tra và log lỗi liên quan đến user_id và thông tin khách hàng
    if (!orderRows[0].user_id) {
      console.error(
        `✅ Đơn hàng ${orderId} không có user_id. Vui lòng kiểm tra bảng 'order'.`
      );
    } else if (
      !orderRows[0].customer_name ||
      !orderRows[0].customer_email ||
      !orderRows[0].customer_phone ||
      !orderRows[0].customer_address
    ) {
      console.error(
        `✅ Đơn hàng ${orderId} có user_id ${orderRows[0].user_id} nhưng thiếu thông tin khách hàng trong bảng 'user'. Vui lòng kiểm tra các cột full_name, email, phone, address.`
      );
    }

    const [itemRows] = await pool.execute(
      `
      SELECT od.id, od.product_id, p.name as product_name, p.image_url as product_image, 
             od.quantity, od.price_at_purchase as unit_price, c.name as category_name
      FROM order_detail od
      LEFT JOIN product p ON od.product_id = p.id
      LEFT JOIN category c ON p.category_id = c.id
      WHERE od.order_id = ?
      `,
      [orderId]
    );

    if (!itemRows || itemRows.length === 0) {
      console.warn(`⚠️ Không tìm thấy sản phẩm nào cho đơn hàng ${orderId}`);
    }

    // Lấy thông tin voucher nếu có discount_applied
    let voucher = null;
    let discountValue = 0;
    if (orderRows[0].discount_applied) {
      const [voucherRows] = await pool.execute(
        `
        SELECT id, vccode, value, type, min_total 
        FROM voucher 
        WHERE vccode = ? AND active = 1
        `,
        [orderRows[0].discount_applied]
      );

      if (voucherRows.length > 0) {
        voucher = voucherRows[0];
        // Tính giá trị giảm giá thực tế
        if (voucher.type === "PERCENTAGE") {
          discountValue =
            (orderRows[0].total_price / (1 - voucher.value / 100)) *
            (voucher.value / 100);
        } else if (voucher.type === "FIXED") {
          discountValue = voucher.value;
        }
      }
    }

    return {
      id: orderRows[0].id,
      user_id: orderRows[0].user_id || null,
      user: {
        id: orderRows[0].user_id || null,
        full_name: orderRows[0].customer_name || "Khách không xác định",
        email: orderRows[0].customer_email || "N/A",
        phone: orderRows[0].customer_phone || "N/A",
        address: orderRows[0].customer_address || "N/A",
      },
      total_price: parseFloat(orderRows[0].total_price) || 0,
      created_date: orderRows[0].created_date,
      status: orderRows[0].status || "pending",
      pay_method: orderRows[0].pay_method || "unknown",
      payment_status: orderRows[0].payment_status || "unpaid", // Thêm payment_status
      discount_applied: voucher
        ? {
            vccode: voucher.vccode,
            value: parseFloat(discountValue.toFixed(2)),
            type: voucher.type,
            min_total: parseFloat(voucher.min_total) || 0,
          }
        : null,
      amount_vnd: formatVNDCurrency(parseFloat(orderRows[0].total_price) || 0),
      status_text: getOrderStatusText(orderRows[0].status),
      order_date_formatted: orderRows[0].order_date_formatted,
      items: itemRows.map((item) => ({
        id: item.id,
        product: {
          id: item.product_id,
          name: item.product_name || "Sản phẩm không xác định",
          image_url: item.product_image || "",
        },
        quantity: item.quantity || 0,
        price_at_purchase: parseFloat(item.unit_price) || 0,
        category_name: item.category_name || "Chưa phân loại",
        unit_price_vnd: formatVNDCurrency(parseFloat(item.unit_price) || 0),
        total_price: (item.quantity || 0) * (parseFloat(item.unit_price) || 0),
        total_price_vnd: formatVNDCurrency(
          (item.quantity || 0) * (parseFloat(item.unit_price) || 0)
        ),
      })),
    };
  } catch (error) {
    console.error(
      `❌ Lỗi khi lấy chi tiết đơn hàng ${orderId}:`,
      error.message
    );
    return null;
  }
}

// Get all carts
async function getAllCarts() {
  try {
    const [rows] = await pool.execute(
      `
      SELECT c.id, c.user_id, c.product_id, c.quantity, p.name, p.image_url, p.price
      FROM cart c
      JOIN product p ON c.product_id = p.id
      ORDER BY c.id
      `
    );
    return rows.map((cart) => ({
      id: cart.id,
      user_id: cart.user_id,
      product_id: cart.product_id,
      product_name: cart.name,
      quantity: cart.quantity,
      price: parseFloat(cart.price),
      product_image: cart.image_url,
      price_vnd: formatVNDCurrency(cart.price),
    }));
  } catch (error) {
    console.error("❌ Error getting carts:", error.message);
    return [];
  }
}

// Get all favorites
async function getAllFavorites() {
  try {
    const [rows] = await pool.execute(
      `
      SELECT f.id, f.user_id, f.product_id, p.name, p.image_url
      FROM favorite f
      JOIN product p ON f.product_id = p.id
      ORDER BY f.id
      `
    );
    return rows.map((favorite) => ({
      id: favorite.id,
      user_id: favorite.user_id,
      product_id: favorite.product_id,
      product_name: favorite.name,
      product_image: favorite.image_url,
    }));
  } catch (error) {
    console.error("❌ Error getting favorites:", error.message);
    return [];
  }
}

// Get all order details
async function getAllOrderDetails() {
  try {
    const [rows] = await pool.execute(
      `
      SELECT od.id, od.order_id, od.product_id, od.quantity, od.price_at_purchase, 
             p.name AS product_name, p.image_url
      FROM order_detail od
      LEFT JOIN product p ON od.product_id = p.id
      ORDER BY od.id
      `
    );
    return rows.map((detail) => ({
      id: detail.id,
      order_id: detail.order_id,
      product_id: detail.product_id,
      product_name: detail.product_name || "Sản phẩm không xác định",
      product_image_url: detail.image_url || "",
      quantity: Number(detail.quantity) || 0,
      unit_price: parseFloat(detail.price_at_purchase) || 0,
      unit_price_vnd: formatVNDCurrency(
        parseFloat(detail.price_at_purchase) || 0
      ),
      total_price:
        (Number(detail.quantity) || 0) *
        (parseFloat(detail.price_at_purchase) || 0),
      total_price_vnd: formatVNDCurrency(
        (Number(detail.quantity) || 0) *
          (parseFloat(detail.price_at_purchase) || 0)
      ),
    }));
  } catch (error) {
    console.error("❌ Error getting order details:", error.message);
    throw error;
  }
}

// Get all ratings
async function getAllRatings() {
  try {
    const [rows] = await pool.execute(
      `
      SELECT r.id, r.user_id, r.product_id, r.star, r.body, r.created_date, r.update_date, p.name, p.image_url
      FROM rating r
      JOIN product p ON r.product_id = p.id
      ORDER BY r.created_date DESC
      `
    );
    return rows.map((rating) => ({
      id: rating.id,
      user_id: rating.user_id,
      product_id: rating.product_id,
      product_name: rating.name,
      product_image: rating.image_url,
      star: rating.star,
      comment: rating.body,
      created_at: rating.created_date,
    }));
  } catch (error) {
    console.error("❌ Error getting ratings:", error.message);
    return [];
  }
}

// Get all vouchers
async function getAllVouchers() {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, \`desc\`, value, type, min_total, quantity, start_date, end_date, active, vccode 
      FROM voucher 
      ORDER BY start_date DESC
      `
    );
    return rows.map((voucher) => ({
      vccode: voucher.vccode,
      discount: parseFloat(voucher.value),
      active: voucher.active,
      start_date: voucher.start_date,
      end_date: voucher.end_date,
    }));
  } catch (error) {
    console.error("❌ Error getting vouchers:", error.message);
    return [];
  }
}

// Get dashboard stats
async function getDashboardStats() {
  try {
    // Get product count
    const [productStats] = await pool.execute(
      `SELECT COUNT(*) as total_products FROM product WHERE status = 'in_stock'`
    );
    // Get category count
    const [categoryStats] = await pool.execute(
      `SELECT COUNT(*) as total_categories FROM category`
    );
    // Get user count
    const [userStats] = await pool.execute(
      `SELECT COUNT(*) as total_users FROM user WHERE is_active = 1`
    );
    // Get revenue
    const [revenueStats] = await pool.execute(
      `SELECT COALESCE(SUM(total_price), 0) as total_revenue 
       FROM \`order\` 
       WHERE status = 'completed'`
    );
    // Get recent transactions
    const [recentTransactions] = await pool.execute(
      `
      SELECT o.id, CONCAT('#', LPAD(o.id, 4, '0')) as order_id, u.full_name as customer_name, 
             p.name as product_name, p.image_url as product_image, o.total_price as amount, 
             o.status, o.created_date as date
      FROM \`order\` o
      JOIN user u ON o.user_id = u.id
      LEFT JOIN order_detail od ON o.id = od.order_id
      LEFT JOIN product p ON od.product_id = p.id
      WHERE o.status = 'completed'
      ORDER BY o.created_date DESC
      LIMIT 10
      `
    );
    // Get top selling products
    const [topProducts] = await pool.execute(
      `
      SELECT p.id, p.name, p.image_url, c.name as category_name, 
             COALESCE(SUM(od.quantity), 0) as total_sold, 
             COALESCE(SUM(od.quantity * od.price_at_purchase), 0) as revenue
      FROM order_detail od
      JOIN \`order\` o ON od.order_id = o.id
      LEFT JOIN product p ON od.product_id = p.id
      LEFT JOIN category c ON p.category_id = c.id
      WHERE o.status = 'completed'
      GROUP BY p.id, p.name, p.image_url, c.name
      ORDER BY total_sold DESC
      LIMIT 5
      `
    );
    return {
      products: Number(productStats[0].total_products) || 0,
      categories: Number(categoryStats[0].total_categories) || 0,
      users: Number(userStats[0].total_users) || 0,
      revenue: formatVNDCurrency(revenueStats[0].total_revenue),
      revenue_raw: parseFloat(revenueStats[0].total_revenue) || 0,
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        order_id: tx.order_id,
        customer_name: tx.customer_name || "Khách không xác định",
        product_name: tx.product_name || "Sản phẩm không xác định",
        product_image: tx.product_image || "",
        amount: parseFloat(tx.amount) || 0,
        amount_vnd: formatVNDCurrency(tx.amount),
        status: tx.status || "pending",
        status_text: getOrderStatusText(tx.status),
        date: tx.date,
      })),
      topProducts: topProducts.map((p) => ({
        id: p.id,
        name: p.name || "Sản phẩm không xác định",
        image_url: p.image_url || "",
        category_name: p.category_name || "Chưa phân loại",
        total_sold: Number(p.total_sold) || 0,
        revenue: parseFloat(p.revenue) || 0,
        revenue_vnd: formatVNDCurrency(p.revenue),
      })),
    };
  } catch (error) {
    console.error("❌ Error getting dashboard stats:", error.message);
    throw error; // Ném lỗi để endpoint xử lý
  }
}

// Format VND currency
function formatVNDCurrency(amount) {
  if (!amount) return "0đ";
  if (amount >= 1000000) {
    return (amount / 1000000).toFixed(1) + "M đ";
  } else if (amount >= 1000) {
    return Math.round(amount / 1000) + "k đ";
  } else {
    return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
  }
}

// Get stock status
function getStockStatus(quantity) {
  if (quantity === 0) {
    return { class: "stock-out", text: "Hết hàng", color: "#dc3545" };
  } else if (quantity <= 10) {
    return { class: "stock-low", text: "Sắp hết", color: "#ffc107" };
  } else {
    return { class: "stock-in", text: "Còn hàng", color: "#28a745" };
  }
}

// Get order status text
function getOrderStatusText(status) {
  const statusMap = {
    pending: "Chờ xử lý",
    processing: "Đang xử lý",
    shipped: "Đang giao",
    completed: "Đã giao",
    cancelled: "Đã hủy",
  };
  return statusMap[status] || status;
}

// Close database connection
async function closeConnection() {
  try {
    await pool.end();
    console.log("✅ Database connection closed");
  } catch (error) {
    console.error("❌ Error closing database connection:", error.message);
  }
}

// Exports
module.exports = {
  pool,
  testConnection,
  checkDatabaseStructure,
  getAdminById,
  getAdminByUsernameOrEmail,
  verifyAdminLogin,
  updateAdminLastLogin,
  getAllAdmins,
  getAllCategories,
  getAllProducts,
  getProductById,
  getAllUsers,
  getUserById,
  getAllOrders,
  getOrderWithItems,
  getAllCarts,
  getAllCategories,
  getAllProducts,
  getAllCarts,
  getAllFavorites,
  getAllOrderDetails,
  getAllRatings,
  getAllVouchers,
  getDashboardStats,
  formatVNDCurrency,
  getStockStatus,
  getOrderStatusText,
  closeConnection,
};
