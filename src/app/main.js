const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");
const fs = require("fs");
const {
  testConnection,
  checkDatabaseStructure,
  getUserByEmailOrUsername,
  updateUserLastLogin,
  getUserById,
} = require("./config/database");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// JWT Secret
const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

// ===================== MYSQL2 CONNECTION FOR MOCK DATA =====================
const mysql = require("mysql2/promise");

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "salesapp",
  password: process.env.DB_PASSWORD || "SalesApp@123",
  database: process.env.DB_NAME || "sales_management",
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT) || 0,
};

const pool = mysql.createPool(dbConfig);

// ===================== MOCK DATA VARIABLES =====================
let products = [];
let customers = [];
let orders = [];
let orderItems = [];
let categories = [];

// ===================== LOAD DATA FROM MYSQL TO MOCK VARIABLES =====================

async function loadDashboardData() {
  try {
    showLoading("Đang tải dữ liệu...");
    const response = await fetch("/api/dashboard/stats", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    if (data.success !== false) {
      updateStats(data);
      updateCharts(data.charts);
    } else {
      throw new Error(data.error || "Failed to load data");
    }
  } catch (error) {
    console.error("❌ Load dashboard error:", error);
    showNotification("Không thể tải dữ liệu", "error");
  } finally {
    hideLoading();
  }
}

async function loadProductsFromDatabase() {
  try {
    console.log("📦 Loading products from MySQL...");
    const [rows] = await pool.execute(`
      SELECT 
        p.id, p.product_code, p.name, p.description, p.price, p.stock, 
        p.category, p.category_id, p.image_url, p.is_active, 
        p.created_at, p.updated_at
      FROM products p
      ORDER BY p.created_at DESC
    `);

    products = rows.map((product) => ({
      ...product,
      // Ensure compatibility with existing code
      category: product.category || "Unknown",
    }));

    console.log(`✅ Loaded ${products.length} products from database`);
    return products;
  } catch (error) {
    console.error("❌ Error loading products:", error);
    return products;
  }
}

async function loadCustomersFromDatabase() {
  try {
    console.log("👥 Loading customers from MySQL...");

    const [rows] = await pool.execute(`
      SELECT id, name, email, phone, address, is_active, created_at, updated_at
      FROM customers 
      WHERE is_active = 1 
      ORDER BY created_at DESC
    `);

    customers = rows;
    console.log(`✅ Loaded ${customers.length} customers from database`);
    return customers;
  } catch (error) {
    console.error("❌ Error loading customers:", error);
    // Fallback to original mock data
    customers = [
      {
        id: 1,
        name: "Nguyen Van Anh",
        email: "nguyen.van.anh@email.com",
        phone: "+84901234567",
        address: "123 Le Loi St, District 1, Ho Chi Minh City",
      },
    ];
    return customers;
  }
}

async function loadOrdersFromDatabase() {
  try {
    console.log("📋 Loading orders from MySQL...");

    const [rows] = await pool.execute(`
      SELECT o.*, 
             c.name AS customer_name
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.is_active = 1
      ORDER BY o.order_date DESC
    `);

    // ✅ FIX: Proper mapping to match expected structure
    orders = rows.map((order) => ({
      id: order.id, // Keep original id
      order_id: order.id, // Also map to order_id for compatibility
      customer_id: order.customer_id, // Keep customer_id for relationships
      customer_name: order.customer_name || "Unknown Customer",
      total_amount: parseFloat(order.total_amount) || 0,
      status: order.status || "pending",
      order_date: order.order_date, // Keep original field name
      created_at: order.order_date || new Date().toISOString(), // Map for compatibility
      delivery_date: order.delivery_date,
      notes: order.notes,
      user_id: order.user_id,
      updated_at: order.updated_at,
      is_active: order.is_active,
    }));

    console.log(`✅ Loaded ${orders.length} orders from database`);
    console.log("📊 Sample order data:", orders[0]); // Debug log
    return orders;
  } catch (error) {
    console.error("❌ Error loading orders:", error);

    // ✅ FIX: Better fallback data structure
    orders = [
      {
        id: 1,
        order_id: 1,
        customer_id: 1,
        customer_name: "Nguyễn Văn An",
        total_amount: 200000,
        status: "processing",
        order_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ];
    return orders;
  }
}

async function loadOrderItemsFromDatabase() {
  try {
    console.log("📋 Loading order items from MySQL...");

    const [rows] = await pool.execute(`
      SELECT id, order_id, product_id, quantity, unit_price, total_price, created_at
      FROM order_items 
      ORDER BY created_at DESC
    `);

    orderItems = rows;
    console.log(`✅ Loaded ${orderItems.length} order items from database`);
    return orderItems;
  } catch (error) {
    console.error("❌ Error loading order items:", error);
    orderItems = [];
    return orderItems;
  }
}

async function loadCategoriesFromDatabase() {
  try {
    console.log("📂 Loading categories from MySQL...");

    const [rows] = await pool.execute(`
      SELECT id, name, name_en, description, icon, status, created_at, updated_at
      FROM categories 
      WHERE status = 'active' 
      ORDER BY id
    `);

    categories = rows;
    console.log(`✅ Loaded ${categories.length} categories from database`);
    return categories;
  } catch (error) {
    console.error("❌ Error loading categories:", error);
    categories = [];
    return categories;
  }
}

// ===================== LOAD ALL DATA FUNCTION =====================
async function loadAllDataFromDatabase() {
  try {
    console.log("🔄 Loading all data from MySQL database...");

    await Promise.all([
      loadCategoriesFromDatabase(),
      loadProductsFromDatabase(),
      loadCustomersFromDatabase(),
      loadOrdersFromDatabase(),
      loadOrderItemsFromDatabase(),
    ]);

    console.log("✅ All mock data loaded from database successfully!");
    console.log(`📊 Data Summary:
    - Categories: ${categories.length}
    - Products: ${products.length}  
    - Customers: ${customers.length}
    - Orders: ${orders.length}
    - Order Items: ${orderItems.length}`);
  } catch (error) {
    console.error("❌ Error loading data from database:", error);
  }
}

// ===================== HELPER FUNCTIONS FOR VIETNAMESE FORMATTING =====================

function formatVNDCurrency(amount) {
  if (amount >= 1000000) {
    return (amount / 1000000).toFixed(1) + "M đ";
  } else if (amount >= 1000) {
    return Math.round(amount / 1000) + "k đ";
  } else {
    return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
  }
}

function getStockStatus(stock) {
  if (stock === 0) {
    return { class: "stock-out", text: "Hết hàng", color: "#dc3545" };
  } else if (stock <= 10) {
    return { class: "stock-low", text: "Sắp hết", color: "#ffc107" };
  } else {
    return { class: "stock-in", text: "Còn hàng", color: "#28a745" };
  }
}

// ===================== SAVE DATA BACK TO DATABASE FUNCTIONS =====================

async function saveProductToDatabase(product) {
  try {
    if (product.id && product.id > 0) {
      // Update existing product
      await pool.execute(
        `
        UPDATE products 
        SET name = ?, description = ?, price = ?, stock = ?, 
            category = ?, category_id = ?, image_url = ?, updated_at = NOW()
        WHERE id = ?
      `,
        [
          product.name,
          product.description || null,
          product.price,
          product.stock,
          product.category || null,
          product.category_id || null,
          product.image_url || null,
          product.id,
        ]
      );
      console.log(`✅ Updated product ${product.id} in database`);
    } else {
      // Insert new product
      const [result] = await pool.execute(
        `
        INSERT INTO products (name, description, price, stock, category, category_id, image_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `,
        [
          product.name,
          product.description || null,
          product.price,
          product.stock,
          product.category || null,
          product.category_id || null,
          product.image_url || null,
        ]
      );
      product.id = result.insertId;
      console.log(`✅ Inserted new product ${product.id} into database`);
    }
    return product;
  } catch (error) {
    console.error("❌ Error saving product to database:", error);
    throw error;
  }
}

async function deleteProductFromDatabase(productId) {
  try {
    await pool.execute(
      "UPDATE products SET is_active = 0, updated_at = NOW() WHERE id = ?",
      [productId]
    );
    console.log(`✅ Soft deleted product ${productId} from database`);
    return true;
  } catch (error) {
    console.error("❌ Error deleting product from database:", error);
    throw error;
  }
}

// ===================== ANTI-SPAM CONFIGURATIONS =====================

// Cache for token verification to reduce database calls
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up token cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (now - data.timestamp > TOKEN_CACHE_TTL) {
      tokenCache.delete(token);
    }
  }
}, TOKEN_CACHE_TTL);

// Enhanced rate limiting
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Increase limit for development
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for static files in development
    return process.env.NODE_ENV !== "production";
  },
});

// Authentication rate limiter
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 10,
  message: {
    success: false,
    error: "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV !== "production";
  },
});

// Apply general rate limiting
app.use(generalLimiter);

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://cdnjs.cloudflare.com",
        ],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(compression());

// CORS Configuration
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== "production") {
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return callback(null, true);
        }
      }

      const allowedOrigins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        process.env.CORS_ORIGIN,
        process.env.FRONTEND_URL,
      ].filter(Boolean);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all in development
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "X-Requested-With",
    ],
  })
);

app.options("*", cors());

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Static file handling
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : "0",
    etag: true,
    lastModified: true,
    index: false, // Important: Don't serve index.html automatically
  })
);

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: true, // ✅ Cho phép resave
    saveUninitialized: true, // ✅ Tạo session ngay cả khi empty
    cookie: {
      secure: false, // ✅ Flexible cho development
      maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
    name: "salesapp_session",
    rolling: true, // ✅ Refresh session on activity
  })
);

// Initialize database connection on startup
async function initializeApp() {
  try {
    console.log("🚀 Initializing Sales Management Application...");

    const connected = await testConnection();
    if (connected) {
      const structureOk = await checkDatabaseStructure();
      if (structureOk) {
        console.log("✅ Application connected to sales_management database");
        console.log("✅ Database structure verified");

        // Load all data from database to mock variables
        await loadAllDataFromDatabase();
      } else {
        console.error("❌ Database structure validation failed");
        process.exit(1);
      }
    } else {
      console.error("❌ Failed to connect to sales_management database");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Database connection error:", error.message);
    process.exit(1);
  }
}

// ===================== AUTHENTICATION MIDDLEWARE =====================

// Enhanced authentication middleware with caching
const authenticateToken = async (req, res, next) => {
  console.log("🔐 Enhanced auth middleware for:", req.path);

  // Check token from header
  const authHeader = req.headers["authorization"];
  const headerToken = authHeader && authHeader.split(" ")[1];

  // Check session from browser
  const sessionUserId = req.session?.userId;

  console.log("🔑 Header token:", headerToken ? "Present" : "Missing");
  console.log("🍪 Session userId:", sessionUserId ? "Present" : "Missing");

  if (headerToken) {
    // Use token from header
    console.log("📡 Using token from Authorization header");

    const cached = tokenCache.get(headerToken);
    if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
      req.user = cached.user;
      console.log("✅ Using cached token for user:", req.user.username);
      return next();
    }

    jwt.verify(headerToken, JWT_SECRET, async (err, user) => {
      if (err) {
        console.log("❌ Token verification failed:", err.message);
        tokenCache.delete(headerToken);

        if (req.path.startsWith("/api/")) {
          return res.status(403).json({
            success: false,
            error: "Invalid or expired token",
          });
        }
        return res.redirect("/login?error=token_expired");
      }

      tokenCache.set(headerToken, {
        user: user,
        timestamp: Date.now(),
      });

      req.user = user;
      console.log("✅ Token verified for user:", user.username);

      // Auto-create session for browser requests
      if (
        !req.session?.userId &&
        req.method === "GET" &&
        !req.path.startsWith("/api/")
      ) {
        console.log("🍪 Auto-creating session for browser request");
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.username = user.username;
        req.session.email = user.email;
        req.session.name = user.name;
      }

      next();
    });
  } else if (sessionUserId) {
    // Use session for browser navigation
    console.log("🍪 Using session authentication");

    try {
      const user = await getUserById(sessionUserId);

      if (!user || !user.is_active) {
        console.log("❌ Session user not found or inactive");
        req.session.destroy();

        if (req.path.startsWith("/api/")) {
          return res.status(401).json({
            success: false,
            error: "Session expired or user inactive",
          });
        }
        return res.redirect("/login?error=session_expired");
      }

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.full_name || user.username,
      };

      console.log("✅ Session verified for user:", req.user.username);
      next();
    } catch (error) {
      console.error("❌ Session verification error:", error);
      req.session.destroy();

      if (req.path.startsWith("/api/")) {
        return res.status(500).json({
          success: false,
          error: "Authentication error",
        });
      }
      return res.redirect("/login?error=auth_error");
    }
  } else {
    // No authentication found
    console.log("❌ No authentication method found");

    if (req.path.startsWith("/api/")) {
      return res.status(401).json({
        success: false,
        error: "Access token required",
      });
    }

    return res.redirect("/login?error=auth_required");
  }
};

// Optional authentication middleware
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    const cached = tokenCache.get(token);
    if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
      req.user = cached.user;
      return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
        tokenCache.set(token, {
          user: user,
          timestamp: Date.now(),
        });
      }
    });
  }
  next();
};

// ===================== HANDLE FAVICON AND STATIC ASSETS =====================

// Handle favicon requests to prevent 404 spam
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/favicon.svg", (req, res) => {
  const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="16" cy="16" r="15" fill="url(#gradient)" stroke="#fff" stroke-width="1"/>
  <path d="M8 20 L12 16 L16 18 L24 10" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="8" cy="20" r="1.5" fill="#fff"/>
  <circle cx="12" cy="16" r="1.5" fill="#fff"/>
  <circle cx="16" cy="18" r="1.5" fill="#fff"/>
  <circle cx="24" cy="10" r="1.5" fill="#fff"/>
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svgFavicon);
});

// ===================== WEB INTERFACE ROUTES (LOGIN FIRST) =====================

// ROOT ROUTE - ALWAYS SHOW LOGIN FIRST
app.get("/", (req, res) => {
  console.log("📍 Root route accessed - serving login page");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// LOGIN PAGE ROUTES
app.get("/login", (req, res) => {
  console.log("📍 Login route accessed");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login.html", (req, res) => {
  console.log("📍 Login.html route accessed");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// PROTECTED ROUTES - REQUIRE AUTHENTICATION
app.get("/dashboard", authenticateToken, (req, res) => {
  console.log("📍 Dashboard accessed by user:", req.user.username);
  console.log("📍 Serving dashboard.html file");
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/dashboard.html", authenticateToken, (req, res) => {
  console.log("📍 Dashboard.html accessed by user:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/products-page", authenticateToken, (req, res) => {
  console.log("📍 Products page accessed by user:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "products.html"));
});

app.get("/customers-page", authenticateToken, (req, res) => {
  console.log(
    "📍 Customers page accessed by user:",
    req.user ? req.user.username : "No user"
  );
  const filePath = path.join(__dirname, "public", "customers.html");
  if (!fs.existsSync(filePath)) {
    console.error("❌ File not found:", filePath);
    return res.status(404).json({ success: false, error: "Page not found" });
  }
  res.sendFile(filePath);
});

app.get("/orders-page", authenticateToken, (req, res) => {
  console.log("📍 Orders page accessed by user:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "orders.html"));
});

app.get("/statistics-page", authenticateToken, (req, res) => {
  console.log("📍 Statistics page accessed by user:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "statistics.html"));
});

// ===================== API ROUTES =====================

// Health check
app.get("/health", async (req, res) => {
  try {
    const healthInfo = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      dataStats: {
        products: products.length,
        customers: customers.length,
        orders: orders.length,
        categories: categories.length,
      },
    };

    res.json(healthInfo);
  } catch (error) {
    console.error("❌ Health check error:", error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// API Info endpoint
app.get("/api", (req, res) => {
  res.json({
    message: "Sales Management System API",
    version: process.env.APP_VERSION || "1.0.0",
    description: "Sales Management with MySQL-loaded mock data",
    dataSource: "MySQL Database (loaded to memory)",
    endpoints: {
      auth: {
        login: "POST /api/auth/login",
        verify: "GET /api/auth/verify",
        logout: "POST /api/auth/logout",
        updateProfile: "PUT /api/auth/update-profile",
        me: "GET /api/auth/me",
      },
      data: {
        categories: "GET /api/categories",
        products: "GET /api/products",
        customers: "GET /api/customers",
        orders: "GET /api/orders",
        dashboard: "GET /api/dashboard/stats",
        transactions: "GET /api/transactions",
      },
      system: {
        health: "GET /health",
        api: "GET /api",
      },
    },
  });
});

app.get(
  "/api/statistics/revenue/monthly",
  authenticateToken,
  async (req, res) => {
    try {
      const { month } = req.query; // Ví dụ: "2025-05"
      console.log(`📊 Fetching monthly revenue for ${month}`);

      const [rows] = await pool.execute(
        `
      SELECT DATE(order_date) AS day, SUM(total_amount) AS revenue
      FROM orders
      WHERE DATE_FORMAT(order_date, '%Y-%m') = ? AND is_active = 1
      GROUP BY DATE(order_date)
      ORDER BY day ASC
    `,
        [month]
      );

      res.json({
        success: true,
        month: month,
        data: rows.map((row) => ({
          day: row.day.toISOString().split("T")[0],
          revenue: parseFloat(row.revenue),
        })),
      });
    } catch (error) {
      console.error("❌ Monthly revenue error:", error);
      res.status(500).json({
        success: false,
        error: "Lỗi server khi lấy dữ liệu doanh thu tháng",
      });
    }
  }
);

app.get(
  "/api/statistics/revenue/yearly",
  authenticateToken,
  async (req, res) => {
    try {
      const { year } = req.query; // Ví dụ: 2025
      console.log(`📊 Fetching yearly revenue for ${year}`);

      const [rows] = await pool.execute(
        `
      SELECT DATE_FORMAT(order_date, '%Y-%m') AS month, SUM(total_amount) AS revenue
      FROM orders
      WHERE YEAR(order_date) = ? AND is_active = 1
      GROUP BY DATE_FORMAT(order_date, '%Y-%m')
      ORDER BY month ASC
    `,
        [year]
      );

      res.json({
        success: true,
        year: parseInt(year),
        data: rows.map((row) => ({
          month: row.month,
          revenue: parseFloat(row.revenue),
        })),
      });
    } catch (error) {
      console.error("❌ Yearly revenue error:", error);
      res.status(500).json({
        success: false,
        error: "Lỗi server khi lấy dữ liệu doanh thu năm",
      });
    }
  }
);

app.get(
  "/api/statistics/products/sold",
  authenticateToken,
  async (req, res) => {
    try {
      const { year, month } = req.query; // Ví dụ: year=2025, month="2025-05"
      console.log(`📊 Fetching product sales for ${month}`);

      const [rows] = await pool.execute(
        `
      SELECT p.category, SUM(oi.quantity) AS quantity
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE DATE_FORMAT(o.order_date, '%Y-%m') = ? AND o.is_active = 1
      GROUP BY p.category
      ORDER BY quantity DESC
    `,
        [month]
      );

      res.json({
        success: true,
        year: parseInt(year),
        month: month,
        data: rows.map((row) => ({
          category: row.category,
          quantity: parseInt(row.quantity),
        })),
      });
    } catch (error) {
      console.error("❌ Product sales error:", error);
      res.status(500).json({
        success: false,
        error: "Lỗi server khi lấy dữ liệu bán hàng",
      });
    }
  }
);

// ===================== AUTHENTICATION API ROUTES =====================

// Login API
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    console.log("🔐 Login attempt for:", username);

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu",
      });
    }

    const user = await getUserByEmailOrUsername(username);

    if (!user) {
      console.log("❌ User not found:", username);
      return res.status(401).json({
        success: false,
        error: "Tên đăng nhập hoặc mật khẩu không đúng",
      });
    }

    if (!user.is_active) {
      console.log("❌ User inactive:", username);
      return res.status(401).json({
        success: false,
        error: "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log("❌ Invalid password for:", username);
      return res.status(401).json({
        success: false,
        error: "Tên đăng nhập hoặc mật khẩu không đúng",
      });
    }

    await updateUserLastLogin(user.id);

    const tokenExpiry = rememberMe ? "30d" : "24h";
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.full_name || user.username,
      },
      JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    req.session.userId = user.id;
    req.session.userRole = user.role;

    const displayName = user.full_name || user.username;

    console.log("✅ Login successful for user:", displayName);

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        username: user.username,
        name: displayName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server trong quá trình đăng nhập. Vui lòng thử lại.",
    });
  }
});

// Token verification API
app.get("/api/auth/verify", authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        error: "Token không hợp lệ hoặc người dùng đã bị vô hiệu hóa",
      });
    }

    const displayName = user.full_name || user.username;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: displayName,
        fullName: user.full_name || "",
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error("❌ Token verification error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server trong quá trình xác thực token",
    });
  }
});

// Logout API
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    console.log("🚪 Enhanced logout request for user:", req.user.username);

    // Clear token from cache
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
      tokenCache.delete(token);
      console.log("🧹 Token cleared from cache");
    }

    // Enhanced session cleanup
    if (req.session) {
      const sessionId = req.session.id;
      const username = req.session.username || req.user.username;

      req.session.destroy((err) => {
        if (err) {
          console.error("❌ Session destroy error:", err);
        } else {
          console.log("🧹 Session destroyed successfully:", sessionId);
        }
      });
    }

    console.log("✅ Enhanced logout successful");
    res.json({ success: true, message: "Đăng xuất thành công" });
  } catch (error) {
    console.error("❌ Enhanced logout error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi trong quá trình đăng xuất",
    });
  }
});

// Profile Update API
app.put("/api/auth/update-profile", authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword, fullName } = req.body;
    const userId = req.user.id;

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Người dùng không tồn tại",
      });
    }

    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({
          success: false,
          error: "Vui lòng nhập mật khẩu cũ",
        });
      }

      const isValidOldPassword = await bcrypt.compare(
        oldPassword,
        user.password
      );
      if (!isValidOldPassword) {
        return res.status(400).json({
          success: false,
          error: "Mật khẩu cũ không đúng",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: "Mật khẩu mới phải có ít nhất 6 ký tự",
        });
      }

      const hashedNewPassword = await bcrypt.hash(
        newPassword,
        parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12
      );

      await pool.execute(
        "UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?",
        [hashedNewPassword, userId]
      );
    }

    if (fullName !== undefined) {
      await pool.execute(
        "UPDATE users SET full_name = ?, updated_at = NOW() WHERE id = ?",
        [fullName || null, userId]
      );
    }

    const updatedUser = await getUserById(userId);
    const displayName = updatedUser.full_name || updatedUser.username;

    res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        name: displayName,
        fullName: updatedUser.full_name || "",
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server. Vui lòng thử lại sau.",
    });
  }
});

// Get current user info
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const displayName = user.full_name || user.username;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: displayName,
        fullName: user.full_name || "",
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error("Get user info error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// ===================== DATA API ROUTES USING MOCK DATA FROM MYSQL =====================

// Categories API
app.get("/api/categories", optionalAuth, (req, res) => {
  try {
    res.json({
      success: true,
      categories: categories,
      total: categories.length,
    });
  } catch (error) {
    console.error("❌ Get categories error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy danh mục",
    });
  }
});

// Dashboard Stats
app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    const totalRevenue = orders.reduce(
      (sum, order) => sum + order.total_amount,
      0
    );

    const stats = {
      products: products.length,
      revenue: formatVNDCurrency(totalRevenue),
      users: customers.length,
      charts: {
        products: [
          50,
          55,
          60,
          58,
          65,
          70,
          75,
          72,
          78,
          85,
          90,
          95,
          110,
          125,
          products.length,
        ],
        revenue: [
          200,
          250,
          180,
          320,
          380,
          350,
          420,
          400,
          450,
          500,
          550,
          600,
          650,
          720,
          Math.round(totalRevenue / 1000),
        ],
        users: [
          100,
          110,
          95,
          120,
          140,
          135,
          150,
          145,
          160,
          180,
          200,
          220,
          240,
          260,
          customers.length,
        ],
      },
    };

    res.json(stats);
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ success: false, error: "Lỗi server" });
  }
});

// Transactions
app.get("/api/transactions", authenticateToken, async (req, res) => {
  try {
    const transactions = orders
      .map((order) => {
        const customer = customers.find((c) => c.id === order.customer_id);
        return {
          id: order.id,
          orderId: `#${order.id.toString().padStart(4, "0")}`,
          customerName: customer ? customer.name : "Unknown Customer",
          phone: customer ? customer.phone : "N/A",
          address: customer ? customer.address : "N/A",
          amount: order.total_amount,
          amount_vnd: formatVNDCurrency(order.total_amount),
          date: order.order_date,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    res.json({
      success: true,
      transactions: transactions,
    });
  } catch (error) {
    console.error("Transactions error:", error);
    res.status(500).json({ success: false, error: "Lỗi server" });
  }
});

// Products API with Vietnamese support
app.get("/api/products", optionalAuth, (req, res) => {
  try {
    const { category, category_id, minPrice, maxPrice, inStock, search } =
      req.query;
    let filteredProducts = [...products];

    // Filter by category or category_id
    if (category) {
      filteredProducts = filteredProducts.filter((p) =>
        p.category?.toLowerCase().includes(category.toLowerCase())
      );
    }

    if (category_id) {
      filteredProducts = filteredProducts.filter(
        (p) => p.category_id === category_id
      );
    }

    // Filter by search
    if (search) {
      filteredProducts = filteredProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.description &&
            p.description.toLowerCase().includes(search.toLowerCase())) ||
          (p.product_code &&
            p.product_code.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Price filters
    if (minPrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.price >= parseFloat(minPrice)
      );
    }
    if (maxPrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.price <= parseFloat(maxPrice)
      );
    }

    // Stock filter
    if (inStock === "true") {
      filteredProducts = filteredProducts.filter((p) => p.stock > 0);
    }

    // Add Vietnamese formatting
    filteredProducts = filteredProducts.map((product) => ({
      ...product,
      price_vnd: formatVNDCurrency(product.price),
      stock_status: getStockStatus(product.stock),
    }));

    res.json({
      success: true,
      products: filteredProducts,
      total: filteredProducts.length,
      filters: { category, category_id, minPrice, maxPrice, inStock, search },
    });
  } catch (error) {
    console.error("❌ Get products error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy danh sách sản phẩm",
    });
  }
});

// Get single product by ID
app.get("/api/products/:id", optionalAuth, (req, res) => {
  try {
    const productId = req.params.id;
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy sản phẩm",
      });
    }

    // Add Vietnamese formatting
    const formattedProduct = {
      ...product,
      price_vnd: formatVNDCurrency(product.price),
      stock_status: getStockStatus(product.stock),
    };

    res.json({
      success: true,
      product: formattedProduct,
    });
  } catch (error) {
    console.error("❌ Get product error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy thông tin sản phẩm",
    });
  }
});

// Create new product
app.post("/api/products", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      price,
      stock,
      category,
      category_id,
      description,
      image_url,
    } = req.body;

    console.log("➕ Creating new product:", name);

    // Validation
    if (!name || !price || stock === undefined) {
      return res.status(400).json({
        success: false,
        error: "Tên, giá và số lượng là bắt buộc",
      });
    }

    if (price <= 0) {
      return res.status(400).json({
        success: false,
        error: "Giá sản phẩm phải lớn hơn 0",
      });
    }

    if (stock < 0) {
      return res.status(400).json({
        success: false,
        error: "Số lượng không được âm",
      });
    }

    // Check if product name already exists in mock data
    const existingProduct = products.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        error: "Tên sản phẩm đã tồn tại",
      });
    }

    // Create new product
    const newProduct = {
      id: `pr${String(products.length + 1).padStart(2, "0")}`,
      name: name.trim(),
      price: parseFloat(price),
      stock: parseInt(stock),
      category: category?.trim() || null,
      category_id: category_id || null,
      description: description ? description.trim() : null,
      image_url: image_url ? image_url.trim() : null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Save to database
    try {
      await saveProductToDatabase(newProduct);
    } catch (dbError) {
      console.error("❌ Database save error:", dbError);
      // Continue with mock data even if database save fails
    }

    // Add to mock data
    products.push(newProduct);

    console.log("✅ Product created successfully:", newProduct.id);

    res.json({
      success: true,
      message: "Thêm sản phẩm thành công",
      product: newProduct,
    });
  } catch (error) {
    console.error("❌ Create product error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi tạo sản phẩm",
    });
  }
});

// Update existing product
app.put("/api/products/:id", authenticateToken, async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      name,
      price,
      stock,
      category,
      category_id,
      description,
      image_url,
    } = req.body;

    console.log("✏️ Updating product:", productId);

    // Find product in mock data
    const productIndex = products.findIndex((p) => p.id === productId);
    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy sản phẩm",
      });
    }

    // Validation
    if (!name || !price || stock === undefined) {
      return res.status(400).json({
        success: false,
        error: "Tên, giá và số lượng là bắt buộc",
      });
    }

    if (price <= 0) {
      return res.status(400).json({
        success: false,
        error: "Giá sản phẩm phải lớn hơn 0",
      });
    }

    if (stock < 0) {
      return res.status(400).json({
        success: false,
        error: "Số lượng không được âm",
      });
    }

    // Check if new name conflicts with other products
    const existingProduct = products.find(
      (p) => p.id !== productId && p.name.toLowerCase() === name.toLowerCase()
    );
    if (existingProduct) {
      return res.status(400).json({
        success: false,
        error: "Tên sản phẩm đã tồn tại",
      });
    }

    // Update product in mock data
    const updatedProduct = {
      ...products[productIndex],
      name: name.trim(),
      price: parseFloat(price),
      stock: parseInt(stock),
      category: category?.trim() || products[productIndex].category,
      category_id: category_id || products[productIndex].category_id,
      description: description ? description.trim() : null,
      image_url: image_url
        ? image_url.trim()
        : products[productIndex].image_url,
      updated_at: new Date(),
    };

    // Save to database
    try {
      await saveProductToDatabase(updatedProduct);
    } catch (dbError) {
      console.error("❌ Database update error:", dbError);
      // Continue with mock data even if database update fails
    }

    products[productIndex] = updatedProduct;

    console.log("✅ Product updated successfully:", productId);

    res.json({
      success: true,
      message: "Cập nhật sản phẩm thành công",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("❌ Update product error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi cập nhật sản phẩm",
    });
  }
});

// Delete product
app.delete("/api/products/:id", authenticateToken, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    console.log("🗑️ Deleting product:", productId);

    // Find product in mock data
    const productIndex = products.findIndex((p) => p.id === productId);
    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy sản phẩm",
      });
    }

    const productName = products[productIndex].name;

    // Check if product is in any orders
    const hasOrders = orderItems.some((item) => item.product_id === productId);
    if (hasOrders) {
      return res.status(400).json({
        success: false,
        error: "Không thể xóa sản phẩm đã có đơn hàng",
      });
    }

    // Delete from database (soft delete)
    try {
      await deleteProductFromDatabase(productId);
    } catch (dbError) {
      console.error("❌ Database delete error:", dbError);
      // Continue with mock data even if database delete fails
    }

    // Remove from mock data
    products.splice(productIndex, 1);

    console.log("✅ Product deleted successfully:", productName);

    res.json({
      success: true,
      message: `Đã xóa sản phẩm "${productName}" thành công`,
    });
  } catch (error) {
    console.error("❌ Delete product error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi xóa sản phẩm",
    });
  }
});

// Customers API
app.get("/api/customers", authenticateToken, (req, res) => {
  res.json({
    success: true,
    customers: customers,
    total: customers.length,
  });
});

// Orders API
/* The following route handler is duplicated and contains a syntax error. 
   It should be removed because a correct version exists below. */

app.post("/api/orders/:id/delivery", authenticateToken, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status, location, notes } = req.body;

    // Insert delivery tracking record
    await pool.execute(
      `
      INSERT INTO delivery_tracking (order_id, status, location, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `,
      [orderId, status, location, notes, req.user.id]
    );

    // Update order status if needed
    if (status === "delivered") {
      await pool.execute(
        `
        UPDATE orders SET status = 'completed', updated_at = NOW() 
        WHERE id = ?
      `,
        [orderId]
      );

      // Update mock data
      const orderIndex = orders.findIndex((o) => o.id === orderId);
      if (orderIndex !== -1) {
        orders[orderIndex].status = "completed";
        orders[orderIndex].updated_at = new Date();
      }
    }

    res.json({
      success: true,
      message: "Cập nhật trạng thái giao hàng thành công",
    });
  } catch (error) {
    console.error("❌ Update delivery status error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi khi cập nhật trạng thái giao hàng",
    });
  }
});

// ===================== ERROR HANDLING =====================

// Orders API for Dashboard
app.get("/api/orders", authenticateToken, async (req, res) => {
  try {
    console.log("📋 Fetching orders for dashboard by user:", req.user.username);

    // Sử dụng dữ liệu từ memory hoặc load fresh từ database
    let ordersData = orders;

    if (!ordersData || ordersData.length === 0) {
      console.log("📊 No mock data found, loading fresh from database...");
      ordersData = await loadOrdersFromDatabase();
    }

    // ✅ FIX: Format dữ liệu đúng cho frontend
    const formattedOrders = ordersData.slice(0, 10).map((order) => ({
      id: order.id, // Giữ nguyên ID để query chi tiết
      order_id: `#${order.id}`, // Hiển thị với # prefix
      customer_name: order.customer_name || "Unknown",
      customer_phone: order.customer_phone || "N/A",
      customer_address: order.customer_address || "N/A",
      total_amount: parseFloat(order.total_amount) || 0,
      status: mapOrderStatus(order.status || "pending"),
      order_date: order.order_date,
      created_at: order.order_date || order.created_at,
    }));

    console.log(`✅ Returning ${formattedOrders.length} formatted orders`);
    console.log("📊 Sample formatted order:", formattedOrders[0]);

    res.json({
      success: true,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("❌ Get orders error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy danh sách đơn hàng",
    });
  }
});

// ✅ FIX: Sửa API endpoint để lấy chi tiết order với order_items
app.get("/api/orders/:id/details", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id.replace("#", ""); // Remove # if present
    console.log(`🔍 Fetching order details for ID: ${orderId}`);

    // Get order info
    const [orderRows] = await pool.execute(
      `
      SELECT 
        o.id,
        o.customer_id,
        o.total_amount,
        o.status,
        o.order_date,
        o.delivery_date,
        o.notes,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ? AND o.is_active = 1
      `,
      [orderId]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy đơn hàng",
      });
    }

    const order = orderRows[0];

    // ✅ FIX: Get order items với đúng order_id format
    const [itemRows] = await pool.execute(
      `
      SELECT 
        oi.id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        p.name AS product_name,
        p.product_code,
        p.category
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
      ORDER BY oi.id
      `,
      [orderId]
    );

    // Format response
    const orderDetails = {
      order_id: `#${order.id}`,
      customer_name: order.customer_name || "Unknown Customer",
      customer_phone: order.customer_phone || "N/A",
      customer_address: order.customer_address || "N/A",
      total_amount: parseFloat(order.total_amount) || 0,
      status: mapOrderStatus(order.status || "pending"),
      order_date: order.order_date,
      delivery_date: order.delivery_date,
      notes: order.notes,
      created_at: order.order_date,
      items: itemRows.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name || "Unknown Product",
        product_code: item.product_code || "N/A",
        category: item.category || "N/A",
        quantity: parseInt(item.quantity) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        total_price: parseFloat(item.total_price) || 0,
      })),
    };

    console.log(`✅ Order details found: ${itemRows.length} items`);

    res.json({
      success: true,
      order: orderDetails,
    });
  } catch (error) {
    console.error(`❌ Get order details error:`, error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy chi tiết đơn hàng",
    });
  }
});

// ===================== HELPER FUNCTION FOR STATUS MAPPING =====================
function mapOrderStatus(status) {
  const statusMap = {
    pending: "Chờ xử lý",
    processing: "Đang xử lý",
    shipped: "Đang giao",
    delivered: "Đã giao",
    completed: "Đã giao",
    cancelled: "Đã hủy",
  };
  return statusMap[status?.toLowerCase()] || "Chờ xử lý";
}

// Enhanced error handling
app.use((err, req, res, next) => {
  console.error("❌ Application Error:", {
    message: err.message,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      error: "CORS policy violation",
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// 404 handler
app.use((req, res) => {
  console.log("❓ 404 Request:", req.method, req.url);

  if (req.url.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      error: "API endpoint not found",
      message: `${req.method} ${req.url} does not exist`,
    });
  }

  // For web routes, redirect to login
  res.redirect("/login");
});

// ===================== SERVER STARTUP =====================

// Start server
initializeApp().then(() => {
  app.listen(port, () => {
    console.log(
      `🚀 Sales Management Server is running on http://localhost:${port}`
    );
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`🔐 Login Page: http://localhost:${port}/login`);
    console.log(
      `📊 Dashboard: http://localhost:${port}/dashboard (requires login)`
    );
    console.log("✅ MySQL-powered mock data system activated");
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  if (pool) pool.end();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Shutting down gracefully...");
  if (pool) pool.end();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

module.exports = app;
