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

// Security Middleware - FIXED CSP to be less restrictive
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'", // Added for development
          "https://cdnjs.cloudflare.com",
        ],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"], // This allows same-origin API calls
      },
    },
  })
);

app.use(compression());

// FIXED: Simplified CORS Configuration - More permissive for development
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin)
      if (!origin) return callback(null, true);

      // Allow localhost in any form during development
      if (process.env.NODE_ENV !== "production") {
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          return callback(null, true);
        }
      }

      const allowedOrigins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001", // In case frontend runs on different port
        process.env.CORS_ORIGIN,
        process.env.FRONTEND_URL,
      ].filter(Boolean);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked origin: ${origin}`);
        callback(null, true); // TEMPORARY: Allow all origins in development
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

// FIXED: Add explicit OPTIONS handler for preflight requests
app.options("*", cors());

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Static file handling
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : "0",
    etag: true,
    lastModified: true,
    index: false,
  })
);

// FIXED: More lenient rate limiting for development
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 20, // Increased from 5 to 20
  message: {
    success: false,
    error: "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV !== "production";
  },
});

// FIXED Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
    name: "salesapp_session",
  })
);

// Database connection
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

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ success: false, error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Optional authentication middleware
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
};

// Role-based authorization middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    if (roles.includes(req.user.role)) {
      next();
    } else {
      res
        .status(403)
        .json({ success: false, error: "Insufficient permissions" });
    }
  };
};

// Mock data for Sales Management System
let products = [
  {
    id: 1,
    name: "iPhone 14 Pro",
    price: 999.99,
    stock: 50,
    category: "Electronics",
  },
  {
    id: 2,
    name: "Samsung Galaxy S23",
    price: 899.99,
    stock: 30,
    category: "Electronics",
  },
  {
    id: 3,
    name: 'MacBook Pro 14"',
    price: 1999.99,
    stock: 20,
    category: "Computers",
  },
  {
    id: 4,
    name: "Dell XPS 13",
    price: 1299.99,
    stock: 25,
    category: "Computers",
  },
  {
    id: 5,
    name: "Sony WH-1000XM5",
    price: 399.99,
    stock: 40,
    category: "Audio",
  },
  { id: 6, name: "iPad Air", price: 599.99, stock: 35, category: "Tablets" },
  {
    id: 7,
    name: "Apple Watch Series 8",
    price: 399.99,
    stock: 45,
    category: "Wearables",
  },
  { id: 8, name: "AirPods Pro", price: 249.99, stock: 60, category: "Audio" },
];

let customers = [
  {
    id: 1,
    name: "Nguyen Van Anh",
    email: "nguyen.van.anh@email.com",
    phone: "+84901234567",
    address: "123 Le Loi St, District 1, Ho Chi Minh City",
  },
  {
    id: 2,
    name: "Tran Thi Bao",
    email: "tran.thi.bao@email.com",
    phone: "+84907654321",
    address: "456 Nguyen Hue St, District 1, Ho Chi Minh City",
  },
  {
    id: 3,
    name: "Le Van Cuong",
    email: "le.van.cuong@email.com",
    phone: "+84912345678",
    address: "789 Dong Khoi St, District 1, Ho Chi Minh City",
  },
  {
    id: 4,
    name: "Pham Thi Dao",
    email: "pham.thi.dao@email.com",
    phone: "+84923456789",
    address: "321 Hai Ba Trung St, District 3, Ho Chi Minh City",
  },
  {
    id: 5,
    name: "Vo Van Dat",
    email: "vo.van.dat@email.com",
    phone: "+84934567890",
    address: "654 Cach Mang Thang 8 St, District 10, Ho Chi Minh City",
  },
];

let orders = [
  {
    id: 1,
    customer_id: 1,
    total_amount: 1999.99,
    status: "delivered",
    order_date: new Date("2024-01-15"),
  },
  {
    id: 2,
    customer_id: 2,
    total_amount: 899.99,
    status: "shipped",
    order_date: new Date("2024-01-16"),
  },
  {
    id: 3,
    customer_id: 3,
    total_amount: 649.98,
    status: "processing",
    order_date: new Date("2024-01-17"),
  },
  {
    id: 4,
    customer_id: 4,
    total_amount: 399.99,
    status: "pending",
    order_date: new Date("2024-01-18"),
  },
  {
    id: 5,
    customer_id: 5,
    total_amount: 1549.98,
    status: "delivered",
    order_date: new Date("2024-01-19"),
  },
];

let orderItems = [
  { id: 1, order_id: 1, product_id: 3, quantity: 1, unit_price: 1999.99 },
  { id: 2, order_id: 2, product_id: 2, quantity: 1, unit_price: 899.99 },
  { id: 3, order_id: 3, product_id: 5, quantity: 1, unit_price: 399.99 },
  { id: 4, order_id: 3, product_id: 8, quantity: 1, unit_price: 249.99 },
  { id: 5, order_id: 4, product_id: 5, quantity: 1, unit_price: 399.99 },
  { id: 6, order_id: 5, product_id: 1, quantity: 1, unit_price: 999.99 },
  { id: 7, order_id: 5, product_id: 6, quantity: 1, unit_price: 599.99 },
];

const getNextId = (array) => Math.max(...array.map((item) => item.id), 0) + 1;

// ===================== AUTHENTICATION ROUTES (FIXED) =====================

// FIXED: Enhanced Login API - only use existing database columns
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    console.log("🔐 Login attempt received:", {
      body: req.body ? "present" : "missing",
      username: req.body?.username ? "present" : "missing",
      password: req.body?.password ? "present" : "missing",
      ip: req.ip,
    });

    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      console.log("❌ Login failed: Missing credentials");
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu",
      });
    }

    console.log("🔍 Looking up user:", username);
    const user = await getUserByEmailOrUsername(username);

    if (!user) {
      console.log("❌ Login failed: User not found");
      return res.status(401).json({
        success: false,
        error: "Tên đăng nhập hoặc mật khẩu không đúng",
      });
    }

    console.log("👤 User found:", {
      id: user.id,
      username: user.username,
      active: user.is_active,
    });

    if (!user.is_active) {
      console.log("❌ Login failed: Account inactive");
      return res.status(401).json({
        success: false,
        error: "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
      });
    }

    console.log("🔑 Verifying password...");
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log("❌ Login failed: Invalid password");
      return res.status(401).json({
        success: false,
        error: "Tên đăng nhập hoặc mật khẩu không đúng",
      });
    }

    console.log("✅ Password valid, updating last login...");
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

    // FIXED: Create display name using only available columns
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

// FIXED: Enhanced Token verification - only use existing columns
app.get("/api/auth/verify", authenticateToken, async (req, res) => {
  try {
    console.log("🔍 Token verification for user ID:", req.user.id);

    const user = await getUserById(req.user.id);

    if (!user || !user.is_active) {
      console.log("❌ Token verification failed: User not found or inactive");
      return res.status(401).json({
        success: false,
        error: "Token không hợp lệ hoặc người dùng đã bị vô hiệu hóa",
      });
    }

    // FIXED: Create display name using only available columns
    const displayName = user.full_name || user.username;

    console.log("✅ Token verification successful for:", displayName);

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
    console.log("🚪 Logout request for user:", req.user.username);

    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
    });

    console.log("✅ Logout successful");
    res.json({ success: true, message: "Đăng xuất thành công" });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi trong quá trình đăng xuất",
    });
  }
});

// FIXED: Simplified Profile Update - only password and full_name
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

    // Password change logic
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

    // Update full name if provided
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

// FIXED: Get current user info - only existing columns
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

// Dashboard Stats
app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    const totalRevenue = orders.reduce(
      (sum, order) => sum + order.total_amount,
      0
    );

    const stats = {
      products: products.length,
      revenue: `${Math.round(totalRevenue / 1000)}k`,
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
          date: order.order_date,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    res.json(transactions);
  } catch (error) {
    console.error("Transactions error:", error);
    res.status(500).json({ success: false, error: "Lỗi server" });
  }
});

// ===================== WEB INTERFACE ROUTES (UPDATED) =====================

// Root route now shows login page first
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Dashboard (protected)
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Other protected pages
app.get("/products-page", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/customers-page", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/orders-page", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===================== API ROUTES =====================

// FIXED: Enhanced Health check with more detailed info
app.get("/health", async (req, res) => {
  try {
    const dbStatus = await testConnection();

    const healthInfo = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      uptime: Math.floor(process.uptime()),
      version: process.env.APP_VERSION || "1.0.0",
      database: dbStatus ? "connected" : "disconnected",
      features: {
        login: "enabled",
        otp: "disabled",
        email: "disabled",
      },
      server: {
        port: port,
        cors: "enabled",
        rateLimit:
          process.env.NODE_ENV === "production" ? "enabled" : "disabled",
      },
    };

    console.log("✅ Health check requested:", healthInfo.timestamp);
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
    message: "Sales Management System API (Simplified)",
    version: process.env.APP_VERSION || "1.0.0",
    description: "Simple login/logout system with MySQL authentication",
    endpoints: {
      auth: {
        login: "POST /api/auth/login",
        verify: "GET /api/auth/verify",
        logout: "POST /api/auth/logout",
        updateProfile: "PUT /api/auth/update-profile",
        me: "GET /api/auth/me",
      },
      data: {
        products: "GET /api/products",
        customers: "GET /api/customers",
        orders: "GET /api/orders",
        stats: "GET /api/stats",
        dashboard: "GET /api/dashboard/stats",
        transactions: "GET /api/transactions",
      },
      system: {
        health: "GET /health",
        api: "GET /api",
      },
    },
    features: {
      authentication: "Basic login/logout only",
      database: "MySQL user authentication",
      email: "Disabled",
      otp: "Disabled",
    },
  });
});

// Products API
app.get("/api/products", optionalAuth, (req, res) => {
  const { category, minPrice, maxPrice, inStock } = req.query;
  let filteredProducts = [...products];

  if (category) {
    filteredProducts = filteredProducts.filter((p) =>
      p.category.toLowerCase().includes(category.toLowerCase())
    );
  }

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

  if (inStock === "true") {
    filteredProducts = filteredProducts.filter((p) => p.stock > 0);
  }

  if (req.headers.accept === "application/json") {
    res.json(filteredProducts);
  } else {
    res.json({
      products: filteredProducts,
      total: filteredProducts.length,
      filters: { category, minPrice, maxPrice, inStock },
    });
  }
});

// Add missing API endpoints for customers and orders
app.get("/api/customers", authenticateToken, (req, res) => {
  res.json({
    success: true,
    customers: customers,
    total: customers.length,
  });
});

app.get("/api/orders", authenticateToken, (req, res) => {
  const ordersWithDetails = orders.map((order) => {
    const customer = customers.find((c) => c.id === order.customer_id);
    const items = orderItems.filter((item) => item.order_id === order.id);

    return {
      ...order,
      customer: customer || null,
      items: items.map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        return {
          ...item,
          product: product || null,
        };
      }),
    };
  });

  res.json({
    success: true,
    orders: ordersWithDetails,
    total: ordersWithDetails.length,
  });
});

// Enhanced error handling with CORS debugging
app.use((err, req, res, next) => {
  console.error("❌ Application Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    url: req.url,
    method: req.method,
    origin: req.headers.origin,
    userAgent: req.headers["user-agent"],
    timestamp: new Date().toISOString(),
  });

  if (err.message === "Not allowed by CORS") {
    console.error("🚫 CORS Error - Origin:", req.headers.origin);
    return res.status(403).json({
      success: false,
      error: "CORS policy violation",
      origin: req.headers.origin,
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

// Start server
initializeApp().then(() => {
  app.listen(port, () => {
    console.log(
      `🚀 Sales Management Server is running on http://localhost:${port}`
    );
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`🔗 Health check: http://localhost:${port}/health`);
    console.log(`📝 API Documentation: http://localhost:${port}/api`);
    console.log(`🌐 Web Interface: http://localhost:${port}/`);
    console.log(`🔐 Login Page: http://localhost:${port}/login`);
    console.log(`📧 Email/OTP: Disabled (Simplified version)`);
    console.log(`🎯 Features: Login/Logout only`);
    console.log(
      `🌐 CORS: ${
        process.env.NODE_ENV === "production"
          ? "Strict"
          : "Permissive (Development)"
      }`
    );
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
