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

// Import database adapter with admin functions
const db = require("./config/database");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// JWT Secret
const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

// ===================== MOCK DATA VARIABLES =====================
let products = [];
let users = [];
let orders = [];
let orderDetails = [];
let categories = [];
let admins = [];
let carts = [];
let favorites = [];
let ratings = [];
let vouchers = [];

// ===================== LOAD DATA FROM REAL DATABASE STRUCTURE =====================
async function loadAllDataFromDatabase() {
  try {
    console.log("🔄 Loading data from database...");
    const tables = [
      { name: "categories", fetch: db.getAllCategories },
      { name: "products", fetch: db.getAllProducts },
      { name: "users", fetch: db.getAllUsers },
      { name: "orders", fetch: db.getAllOrders },
      { name: "admins", fetch: db.getAllAdmins },
      { name: "carts", fetch: db.getAllCarts },
      { name: "favorites", fetch: db.getAllFavorites },
      { name: "orderDetails", fetch: db.getAllOrderDetails },
      { name: "ratings", fetch: db.getAllRatings },
      { name: "vouchers", fetch: db.getAllVouchers },
    ];

    for (const { name, fetch } of tables) {
      try {
        const data = await fetch();
        eval(`${name} = data`); // Gán dữ liệu vào biến tương ứng
        console.log(`✅ ${name}: ${data.length}`);
      } catch (err) {
        console.error(`❌ Error loading ${name}:`, err.message);
      }
    }

    console.log("✅ All data loaded successfully!");
    console.log(
      `📊 Data Summary: ${tables
        .map((t) => `${t.name}: ${eval(t.name).length}`)
        .join(", ")}`
    );
  } catch (error) {
    console.error("❌ Failed to load data:", error.message);
  }
}

// ===================== HELPER FUNCTIONS FOR VIETNAMESE FORMATTING =====================
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

function getStockStatus(quantity) {
  if (quantity === 0) {
    return { class: "stock-out", text: "Hết hàng", color: "#dc3545" };
  } else if (quantity <= 10) {
    return { class: "stock-low", text: "Sắp hết", color: "#ffc107" };
  } else {
    return { class: "stock-in", text: "Còn hàng", color: "#28a745" };
  }
}

function mapOrderStatus(status) {
  const statusMap = {
    pending: "Chờ xử lý",
    processing: "Đang xử lý",
    shipped: "Đang giao",
    delivered: "Đã giao",
    completed: "Hoàn thành",
    cancelled: "Đã hủy",
  };
  return statusMap[status?.toLowerCase()] || "Không xác định";
}

// ===================== ANTI-SPAM CONFIGURATIONS =====================
const tokenCache = new Map();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (now - data.timestamp > TOKEN_CACHE_TTL) {
      tokenCache.delete(token);
    }
  }
}, TOKEN_CACHE_TTL);

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== "production",
});

const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 10,
  message: {
    success: false,
    error: "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== "production",
});

// Middleware Setup
app.use(generalLimiter);
app.use(compression());
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
        scriptSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:", "https://*.s3.amazonaws.com"],
        connectSrc: ["'self'", "https://*.s3.amazonaws.com"],
      },
    },
  })
);
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        process.env.CORS_ORIGIN,
        process.env.FRONTEND_URL,
      ].filter(Boolean);
      console.log(`🔍 Checking CORS for origin: ${origin}`);
      if (!origin || allowedOrigins.includes(origin)) {
        console.log(`✅ CORS allowed for origin: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS blocked for origin: ${origin}`);
        callback(null, true); // Tạm cho phép trong dev để debug
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
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : "0",
    etag: true,
    lastModified: true,
    index: false,
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
    name: "storeapp_session",
    rolling: true,
  })
);

// Initialize database connection
async function initializeApp() {
  try {
    console.log("🚀 Initializing Store Management Application...");
    const connected = await db.testConnection();
    if (connected) {
      const structureOk = await db.checkDatabaseStructure();
      if (structureOk) {
        console.log("✅ Application connected to store database");
        console.log("✅ Database structure verified");
        await loadAllDataFromDatabase();
      } else {
        console.error("❌ Database structure validation failed");
        process.exit(1);
      }
    } else {
      console.error("❌ Failed to connect to store database");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Database connection error:", error.message);
    process.exit(1);
  }
}

// ===================== AUTHENTICATION MIDDLEWARE =====================
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  const sessionUserId = req.session?.userId;

  if (token) {
    if (!token.includes(".")) {
      console.warn("⚠️ Invalid token format");
      return req.path.startsWith("/api/")
        ? res
            .status(401)
            .json({ success: false, error: "Invalid token format" })
        : res.redirect("/login?error=invalid_token");
    }

    const cached = tokenCache.get(token);
    if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
      req.user = cached.user;
      return next();
    }

    try {
      const user = jwt.verify(token, JWT_SECRET);
      tokenCache.set(token, { user, timestamp: Date.now() });
      req.user = user;

      if (
        !req.session?.userId &&
        req.method === "GET" &&
        !req.path.startsWith("/api/")
      ) {
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.username = user.username;
        req.session.email = user.email;
        req.session.name = user.name;
      }
      return next();
    } catch (err) {
      console.warn("❌ Token verification failed:", err.message);
      tokenCache.delete(token);
      return req.path.startsWith("/api/")
        ? res
            .status(403)
            .json({ success: false, error: "Invalid or expired token" })
        : res.redirect("/login?error=token_expired");
    }
  } else if (sessionUserId) {
    try {
      const user = await db.getAdminById(sessionUserId);
      if (!user || !user.is_active) {
        req.session.destroy();
        return req.path.startsWith("/api/")
          ? res.status(401).json({
              success: false,
              error: "Session expired or user inactive",
            })
          : res.redirect("/login?error=session_expired");
      }
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.full_name || user.username,
      };
      return next();
    } catch (error) {
      console.error("❌ Session verification error:", error.message);
      req.session.destroy();
      return req.path.startsWith("/api/")
        ? res
            .status(500)
            .json({ success: false, error: "Authentication error" })
        : res.redirect("/login?error=auth_error");
    }
  } else {
    return req.path.startsWith("/api/")
      ? res.status(401).json({ success: false, error: "Access token required" })
      : res.redirect("/login?error=auth_required");
  }
};

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
        tokenCache.set(token, { user, timestamp: Date.now() });
      }
      next();
    });
  } else {
    next();
  }
};

// ===================== HANDLE FAVICON AND STATIC ASSETS =====================
app.get("/favicon.ico", (req, res) => res.status(204).end());
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

// ===================== WEB INTERFACE ROUTES =====================
app.use((req, res, next) => {
  console.log(`📍 Route accessed: ${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  console.log("📍 Root route accessed - serving login page");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login", (req, res) => {
  console.log("📍 Login route accessed");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login.html", (req, res) => {
  console.log("📍 Login.html route accessed");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/admin", (req, res) => {
  console.log("📍 Admin login route accessed");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/admin/login", (req, res) => {
  console.log("📍 Admin login route accessed");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/admin/dashboard", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") {
    console.log(
      "❌ Non-admin user attempted to access admin dashboard:",
      req.user.username
    );
    return res.redirect("/login?error=admin_required");
  }
  console.log("📍 Admin dashboard accessed by:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/dashboard", authenticateToken, (req, res) => {
  console.log("📍 Dashboard accessed by user:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/dashboard.html", authenticateToken, (req, res) => {
  console.log("📍 Dashboard.html accessed by user:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/products-page", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(
        `⚠️ Unauthorized access attempt to /products-page by user: ${req.user.username}`
      );
      return res.status(403).send("Access denied");
    }
    console.log(`📄 Serving products page for user: ${req.user.username}`);
    const filePath = path.join(__dirname, "public", "products.html");
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Products page file not found at: ${filePath}`);
      return res.status(404).send("Products page not found");
    }
    res.sendFile(filePath);
  } catch (error) {
    console.error("❌ Error serving products page:", error.message);
    res.status(500).send("Server error");
  }
});

app.get("/customers-page", authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, "public", "customers.html");
  if (!fs.existsSync(filePath)) {
    console.error("❌ File not found:", filePath);
    return res.status(404).json({ success: false, error: "Page not found" });
  }
  res.sendFile(filePath);
});

app.get("/orders-page", authenticateToken, (req, res) => {
  console.log(`📄 Serving orders page for user: ${req.user.username}`);
  const filePath = path.join(__dirname, "public", "orders.html");
  if (!fs.existsSync(filePath)) {
    console.error("❌ File not found:", filePath);
    return res.status(404).json({ success: false, error: "Page not found" });
  }
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("❌ Error sending file:", err.message);
      res.status(500).json({ success: false, error: "Server error" });
    } else {
      console.log("✅ Orders page served successfully");
    }
  });
});

app.get("/statistics-page", authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, "public", "statistics.html");
  if (!fs.existsSync(filePath)) {
    console.error("❌ File not found:", filePath);
    return res.status(404).json({ success: false, error: "Page not found" });
  }
  res.sendFile(filePath);
});

// ===================== API ROUTES =====================
app.get("/health", async (req, res) => {
  try {
    const healthInfo = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      dataStats: {
        products: products.length,
        users: users.length,
        orders: orders.length,
        categories: categories.length,
        admins: admins.length,
        carts: carts.length,
        favorites: favorites.length,
        orderDetails: orderDetails.length,
        ratings: ratings.length,
        vouchers: vouchers.length,
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

app.get("/api", (req, res) => {
  res.json({
    message: "Store Management System API",
    version: process.env.APP_VERSION || "1.0.0",
    description: "Store Management with Real Database Structure",
    dataSource: "MySQL Database (Real Structure)",
    endpoints: {
      auth: {
        adminLogin: "POST /api/admin/login",
        verify: "GET /api/auth/verify",
        logout: "POST /api/auth/logout",
      },
      data: {
        categories: "GET /api/categories",
        products: "GET /api/products",
        customers: "GET /api/customers",
        orders: "GET /api/orders",
        dashboard: "GET /api/dashboard/stats",
        cart: "GET /api/cart",
        favorites: "GET /api/favorites",
        ratings: "GET /api/ratings",
        vouchers: "GET /api/vouchers",
      },
      admin: {
        login: "POST /api/admin/login",
        dashboard: "GET /api/admin/dashboard",
        users: "GET /api/admin/users",
      },
      system: {
        health: "GET /health",
        api: "GET /api",
      },
    },
  });
});

// ===================== ADMIN AUTHENTICATION API ROUTES =====================
app.post("/api/admin/login", authLimiter, async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    console.log("🔐 Admin login attempt for:", username);
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu",
      });
    }
    const result = await db.verifyAdminLogin(username, password);
    if (!result.success) {
      console.log("❌ Admin login failed:", result.message);
      return res.status(401).json({ success: false, error: result.message });
    }
    const tokenExpiry = rememberMe ? "30d" : "24h";
    const token = jwt.sign(
      {
        id: result.admin.id,
        username: result.admin.username,
        email: result.admin.email,
        role: "admin",
        name: result.admin.full_name,
      },
      JWT_SECRET,
      { expiresIn: tokenExpiry }
    );
    req.session.userId = result.admin.id;
    req.session.userRole = "admin";
    req.session.username = result.admin.username;
    console.log("✅ Admin login successful for:", result.admin.full_name);
    res.json({
      success: true,
      message: "Đăng nhập admin thành công",
      token,
      admin: {
        id: result.admin.id,
        username: result.admin.username,
        name: result.admin.full_name,
        email: result.admin.email,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("❌ Admin login error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server trong quá trình đăng nhập admin. Vui lòng thử lại.",
    });
  }
});

app.get("/api/auth/verify", authenticateToken, async (req, res) => {
  try {
    console.log("🔍 Verifying token for user:", req.user.username);
    let user;
    if (req.user.role === "admin") {
      user = await db.getAdminById(req.user.id);
    } else {
      user = await db.getUserById(req.user.id);
    }
    if (!user || !user.is_active) {
      console.warn(`⚠️ User not found or inactive: userId=${req.user.id}`);
      return res.status(401).json({
        success: false,
        error: "Token không hợp lệ hoặc người dùng đã bị vô hiệu hóa",
      });
    }
    const displayName = user.full_name || user.username;
    console.log(`✅ Token verified successfully for user: ${displayName}`);
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: displayName,
        fullName: user.full_name || "",
        email: user.email,
        role: req.user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error("❌ Token verification error:", error.message);
    res.status(500).json({
      success: false,
      error: "Lỗi server trong quá trình xác thực token",
    });
  }
});

app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    console.log("🚪 Logout request for user:", req.user.username);
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
      tokenCache.delete(token);
      console.log("🧹 Token cleared from cache");
    }
    if (req.session) {
      const sessionId = req.session.id;
      req.session.destroy((err) => {
        if (err) {
          console.error("❌ Session destroy error:", err);
        } else {
          console.log("🧹 Session destroyed successfully:", sessionId);
        }
      });
    }
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

app.post("/api/admin/update", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }

    const adminId = req.user.id;
    const { full_name, old_password, new_password } = req.body;

    if (!full_name) {
      return res
        .status(400)
        .json({ success: false, error: "Vui lòng điền họ và tên" });
    }

    const admin = await db.getAdminById(adminId);
    if (!admin || !admin.is_active) {
      return res.status(404).json({
        success: false,
        error: "Admin không tồn tại hoặc không hoạt động",
      });
    }

    let query = `UPDATE admin SET full_name = ?`;
    let params = [full_name];

    if (old_password && new_password) {
      if (new_password.length < 8) {
        return res.status(400).json({
          success: false,
          error: "Mật khẩu mới phải có ít nhất 8 ký tự",
        });
      }

      const adminWithPassword = await db.getAdminByUsernameOrEmail(
        admin.username
      );
      if (!adminWithPassword) {
        return res
          .status(404)
          .json({ success: false, error: "Admin không tồn tại" });
      }

      const isValidPassword = await bcrypt.compare(
        old_password,
        adminWithPassword.password
      );
      if (!isValidPassword) {
        return res
          .status(400)
          .json({ success: false, error: "Mật khẩu cũ không đúng" });
      }

      const hashedNewPassword = await bcrypt.hash(new_password, 15);
      query += `, password = ?`;
      params.push(hashedNewPassword);
    } else if (
      (old_password && !new_password) ||
      (!old_password && new_password)
    ) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng điền đầy đủ thông tin mật khẩu",
      });
    }

    query += ` WHERE id = ? AND is_active = 1`;
    params.push(adminId);

    const [result] = await db.pool.query(query, params);
    if (result.affectedRows === 0) {
      return res
        .status(500)
        .json({ success: false, error: "Không thể cập nhật thông tin admin" });
    }

    const updatedAdmin = await db.getAdminById(adminId);
    res.json({
      success: true,
      message: "Cập nhật thông tin admin thành công",
      user: {
        id: updatedAdmin.id,
        username: updatedAdmin.username,
        full_name: updatedAdmin.full_name,
        email: updatedAdmin.email,
        role: updatedAdmin.role,
      },
    });
  } catch (error) {
    console.error("❌ Admin update error:", error.message);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi cập nhật thông tin admin",
    });
  }
});

// ===================== DATA API ROUTES USING REAL DATABASE STRUCTURE =====================
app.get("/api/categories", optionalAuth, (req, res) => {
  try {
    res.json({
      success: true,
      categories,
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

app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    console.log("📋 Fetching dashboard stats for user:", req.user.username);
    // Lấy dữ liệu từ database
    const orders = await db.getAllOrders();
    console.log("📋 Orders:", orders); // Thêm log để kiểm tra
    const orderDetails = await db.getAllOrderDetails();
    console.log("📋 Order Details:", orderDetails); // Thêm log
    const users = await db.getAllUsers();
    console.log("📋 Users:", users); // Thêm log

    // Tính tổng sản phẩm bán ra
    let totalProducts = 0;
    const productSales = Array(12).fill(0);
    const currentYear = new Date().getFullYear();
    for (const detail of orderDetails) {
      const order = orders.find((o) => o.id === detail.order_id);
      if (order && order.created_date && order.status !== "cancelled") {
        const orderDate = new Date(order.created_date);
        const orderMonth = orderDate.getMonth();
        const orderYear = orderDate.getFullYear();
        if (orderYear === currentYear) {
          productSales[orderMonth] += detail.quantity || 0;
          totalProducts += detail.quantity || 0;
        }
      }
    }

    // Tính tổng doanh thu
    let totalRevenue = 0;
    const revenueData = Array(30).fill(0);
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    for (const order of orders) {
      if (order.created_date && order.status !== "cancelled") {
        const orderDate = new Date(order.created_date);
        if (orderDate >= thirtyDaysAgo && orderDate <= today) {
          const dayIndex = Math.floor(
            (today - orderDate) / (1000 * 60 * 60 * 24)
          );
          revenueData[29 - dayIndex] += order.total_price || 0;
          totalRevenue += order.total_price || 0;
        }
      }
    }

    // Tính số người dùng mới
    let totalUsers = 0;
    const userData = Array(12).fill(0);
    for (const user of users) {
      if (user.created_at) {
        const userDate = new Date(user.created_at);
        const userMonth = userDate.getMonth();
        const userYear = userDate.getFullYear();
        if (userYear === currentYear) {
          userData[userMonth]++;
          totalUsers++;
        }
      }
    }

    res.json({
      success: true,
      products: totalProducts,
      revenue: totalRevenue,
      users: totalUsers,
      orders: orders.slice(0, 10), // Giới hạn 10 đơn hàng
      charts: {
        products: productSales,
        revenue: revenueData,
        users: userData,
      },
    });
  } catch (error) {
    console.error("❌ Dashboard stats error:", error);
    res.status(500).json({ success: false, error: "Lỗi server" });
  }
});

app.get("/api/products", optionalAuth, (req, res) => {
  try {
    const { category, category_id, minPrice, maxPrice, inStock, search } =
      req.query;
    let filteredProducts = [...products]; // products từ loadAllDataFromDatabase
    if (category) {
      filteredProducts = filteredProducts.filter((p) =>
        p.category_name?.toLowerCase().includes(category.toLowerCase())
      );
    }
    if (category_id) {
      filteredProducts = filteredProducts.filter(
        (p) => p.category_id === category_id
      );
    }
    if (search) {
      filteredProducts = filteredProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.description &&
            p.description.toLowerCase().includes(search.toLowerCase()))
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
      filteredProducts = filteredProducts.filter((p) => p.stock > 0); // Sửa quantity thành stock
    }
    // Tích hợp ratings
    filteredProducts = filteredProducts.map((product) => {
      const productRatings = ratings.filter((r) => r.product_id === product.id);
      const avgRating = productRatings.length
        ? productRatings.reduce((sum, r) => sum + r.star, 0) /
          productRatings.length
        : 0;
      return { ...product, avgRating: parseFloat(avgRating.toFixed(1)) };
    });
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

app.get("/api/customers", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(`⚠️ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }
    const customers = await db.getAllUsers();
    res.json({
      success: true,
      customers,
      total: customers.length,
    });
  } catch (error) {
    console.error("❌ Get customers error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy danh sách khách hàng",
    });
  }
});

const orderCache = new Map();
const ORDER_CACHE_TTL = 5 * 60 * 1000;

app.get("/api/orders", authenticateToken, async (req, res) => {
  try {
    console.log("📋 Fetching orders for dashboard by user:", req.user.username);
    const { search, status } = req.query;
    const cacheKey = `orders_${search}_${status}`;
    const cached = orderCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ORDER_CACHE_TTL) {
      console.log("📦 Using cached orders");
      return res.json({
        success: true,
        orders: cached.data,
        total: cached.data.length,
      });
    }

    const orders = await db.getAllOrders();

    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        const user = await db.getUserById(order.user_id);
        return {
          id: order.id,
          user_id: order.user_id || null,
          user: {
            id: user?.id || null,
            full_name: user?.full_name || "Khách không xác định",
            email: user?.email || "N/A",
            phone: user?.phone || "N/A",
          },
          status: order.status,
          payment_status: order.payment_status || "unpaid", // Thêm payment_status
          status_text: mapOrderStatus(order.status),
          created_date: order.created_date || new Date().toISOString(),
          total_price: order.total_price || 0,
          pay_method: order.pay_method || "unknown",
          discount_applied: order.discount_applied || 0,
        };
      })
    );

    let filteredOrders = enrichedOrders;
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredOrders = filteredOrders.filter(
        (order) =>
          order.id.toString().includes(searchTerm) ||
          order.user.full_name.toLowerCase().includes(searchTerm) ||
          order.user.email.toLowerCase().includes(searchTerm)
      );
    }
    if (status) {
      filteredOrders = filteredOrders.filter(
        (order) => order.status.toLowerCase() === status.toLowerCase()
      );
    }

    orderCache.set(cacheKey, { data: filteredOrders, timestamp: Date.now() });

    res.json({
      success: true,
      orders: filteredOrders,
      total: filteredOrders.length,
    });
  } catch (error) {
    console.error("❌ Get orders error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: `Lỗi server khi lấy danh sách đơn hàng: ${error.message}`,
    });
  }
});

// Doanh thu tháng
app.get(
  "/api/statistics/revenue/monthly",
  authenticateToken,
  async (req, res) => {
    try {
      const { year } = req.query;
      if (!year || !/^\d{4}$/.test(year)) {
        return res
          .status(400)
          .json({ success: false, error: "Định dạng năm không hợp lệ" });
      }
      const [orders] = await db.pool.query(
        `SELECT DATE_FORMAT(created_date, '%Y-%m') as month, SUM(total_price) as revenue
       FROM \`order\`
       WHERE YEAR(created_date) = ? AND status != 'cancelled'
       GROUP BY DATE_FORMAT(created_date, '%Y-%m')`,
        [year]
      );
      res.json({ success: true, data: orders });
    } catch (error) {
      console.error("❌ Lỗi lấy doanh thu tháng:", error.message);
      res
        .status(500)
        .json({ success: false, error: "Lỗi server khi lấy doanh thu tháng" });
    }
  }
);

// Doanh thu năm
app.get(
  "/api/statistics/revenue/yearly",
  authenticateToken,
  async (req, res) => {
    try {
      const [orders] = await db.pool.query(
        `SELECT YEAR(created_date) as year, SUM(total_price) as revenue
       FROM \`order\`
       WHERE status != 'cancelled'
       GROUP BY YEAR(created_date)
       ORDER BY year`
      );
      res.json({ success: true, data: orders });
    } catch (error) {
      console.error("❌ Lỗi lấy doanh thu năm:", error.message);
      res
        .status(500)
        .json({ success: false, error: "Lỗi server khi lấy doanh thu năm" });
    }
  }
);

// Số lượng sản phẩm bán ra
app.get(
  "/api/statistics/products/sold",
  authenticateToken,
  async (req, res) => {
    try {
      const { year, month } = req.query;
      if (
        !year ||
        !month ||
        !/^\d{4}$/.test(year) ||
        !/^\d{4}-\d{2}$/.test(month)
      ) {
        return res.status(400).json({
          success: false,
          error: "Định dạng năm hoặc tháng không hợp lệ",
        });
      }
      const [yearNum, monthNum] = month.split("-");
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0);
      const [results] = await db.pool.query(
        `SELECT c.name as category, SUM(od.quantity) as quantity
       FROM order_detail od
       JOIN \`order\` o ON od.order_id = o.id
       JOIN product p ON od.product_id = p.id
       JOIN category c ON p.category_id = c.id
       WHERE o.created_date >= ? AND o.created_date <= ? AND o.status != 'cancelled'
       GROUP BY c.name`,
        [startDate, endDate]
      );
      res.json({ success: true, data: results });
    } catch (error) {
      console.error("❌ Lỗi lấy số lượng sản phẩm:", error.message);
      res.status(500).json({
        success: false,
        error: "Lỗi server khi lấy số lượng sản phẩm",
      });
    }
  }
);

app.get(
  "/api/orders/:id([0-9]+)?/details",
  authenticateToken,
  async (req, res) => {
    try {
      const orderId = req.params.id;
      if (!orderId) {
        return res
          .status(400)
          .json({ success: false, error: "Thiếu ID đơn hàng" });
      }

      const order = await db.getOrderWithItems(orderId);
      if (!order) {
        return res
          .status(404)
          .json({ success: false, error: "Không tìm thấy đơn hàng" });
      }

      if (!order.user_id || order.user.full_name === "Khách không xác định") {
        console.warn(
          `⚠️ Order ${orderId} lacks customer info. user_id: ${order.user_id}`
        );
      }

      res.json({
        success: true,
        order: {
          id: order.id,
          user_id: order.user_id || null,
          customer_name: order.user.full_name || "Khách không xác định",
          customer_email: order.user.email || "N/A",
          customer_phone: order.user.phone || "N/A",
          customer_address: order.user.address || "N/A",
          items: order.items || [],
          total_price: order.total_price || 0,
          created_date: order.created_date || new Date().toISOString(),
          status: order.status || "pending",
          status_text: mapOrderStatus(order.status),
          pay_method: order.pay_method || "unknown",
          discount_applied: order.discount_applied || 0,
          order_date_formatted: order.created_date
            ? new Date(order.created_date).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })
            : "N/A",
        },
      });
    } catch (error) {
      console.error(
        `❌ Error fetching order ${req.params.id} details:`,
        error.message
      );
      res.status(500).json({
        success: false,
        error: "Lỗi server khi lấy chi tiết đơn hàng",
      });
    }
  }
);

app.get("/api/customers/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(`⚠️ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }
    const customer = await db.getUserById(req.params.id);
    if (!customer) {
      console.warn(`⚠️ Customer not found: ${req.params.id}`);
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy khách hàng" });
    }
    res.json({
      success: true,
      customer,
    });
  } catch (error) {
    console.error("❌ Get customer details error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy chi tiết khách hàng",
    });
  }
});

app.get("/api/cart", authenticateToken, (req, res) => {
  try {
    const userCart = carts.filter((c) => c.user_id === req.user.id);
    res.json({
      success: true,
      cart: userCart,
      total: userCart.length,
    });
  } catch (error) {
    console.error("❌ Get cart error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy giỏ hàng",
    });
  }
});

app.get("/api/favorites", authenticateToken, (req, res) => {
  try {
    const userFavorites = favorites.filter((f) => f.user_id === req.user.id);
    res.json({
      success: true,
      favorites: userFavorites,
      total: userFavorites.length,
    });
  } catch (error) {
    console.error("❌ Get favorites error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy danh sách yêu thích",
    });
  }
});

// Thêm sản phẩm mới
app.post("/api/products", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.log(`❌ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }

    const { name, price, stock, category_id, description, image_url, hot } =
      req.body;
    if (!name || !price || stock === undefined || !category_id) {
      console.log("❌ Missing required fields:", req.body);
      return res
        .status(400)
        .json({ success: false, error: "Thiếu thông tin bắt buộc" });
    }

    const id = `pr${Date.now()}`; // Tạo ID duy nhất
    await db.pool.query(
      `INSERT INTO product (id, category_id, name, price, quantity, image_url, \`desc\`, hot, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        id,
        category_id,
        name,
        price,
        stock,
        image_url || null,
        description || null, // Giữ tên biến là description để tương thích với frontend
        hot ? 1 : 0,
      ]
    );

    // Cập nhật mảng products
    const newProduct = {
      id,
      category_id,
      name,
      price,
      stock,
      image_url: image_url || null,
      description: description || null, // Ánh xạ desc thành description
      hot: hot ? 1 : 0,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    products.push(newProduct);

    console.log(`✅ Added product ID: ${id}`);
    res.json({
      success: true,
      message: "Thêm sản phẩm thành công",
      productId: id,
    });
  } catch (error) {
    console.error("❌ Add product error:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Lỗi server khi thêm sản phẩm" });
  }
});

app.post("/api/customers", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(`⚠️ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }
    const { full_name, email, phone, address, profile_pic, password } =
      req.body;
    console.log("📥 Received customer data:", {
      full_name,
      email,
      phone,
      address,
      profile_pic,
    });

    if (!full_name || !email) {
      console.warn(
        `⚠️ Missing required fields: full_name=${full_name}, email=${email}`
      );
      return res
        .status(400)
        .json({ success: false, error: "Họ và tên và email là bắt buộc" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.warn(`⚠️ Invalid email: ${email}`);
      return res
        .status(400)
        .json({ success: false, error: "Email không hợp lệ" });
    }

    const [existing] = await db.pool.query(
      `SELECT id FROM user WHERE email = ? AND is_active = 1`,
      [email]
    );
    if (existing.length > 0) {
      console.warn(`⚠️ Email already exists: ${email}`);
      return res
        .status(400)
        .json({ success: false, error: "Email đã được sử dụng" });
    }

    const id = `us${Date.now()}`;
    const hashedPassword = await bcrypt.hash(password || "defaultPass123", 15);
    await db.pool.query(
      `INSERT INTO user (id, full_name, email, phone, address, profile_pic, password, role, is_active, create_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        full_name,
        email,
        phone || null,
        address || null,
        profile_pic || null,
        hashedPassword,
        "user",
        1,
      ]
    );

    console.log(`✅ Added customer ID: ${id}`);
    res.json({
      success: true,
      message: "Thêm khách hàng thành công",
      customerId: id,
    });
  } catch (error) {
    console.error("❌ Add customer error:", error.message);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi thêm khách hàng",
    });
  }
});

app.post("/api/orders", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }

    const { user_id, total_price, pay_method, items, discount_applied } =
      req.body;
    if (
      !user_id ||
      !total_price ||
      !pay_method ||
      !Array.isArray(items) ||
      !items.length
    ) {
      return res.status(400).json({
        success: false,
        error: "Thiếu hoặc sai định dạng thông tin bắt buộc",
      });
    }

    for (const item of items) {
      if (!item.product_id || !item.quantity || !item.price_at_purchase) {
        return res
          .status(400)
          .json({ success: false, error: "Danh sách sản phẩm không hợp lệ" });
      }
    }

    const id = `ord${Date.now()}`;
    await db.pool.query(
      `INSERT INTO orders (id, user_id, total_price, pay_method, status, discount_applied, created_date, updated_at, is_active)
       VALUES (?, ?, ?, ?, 'pending', ?, NOW(), NOW(), 1)`,
      [id, user_id, total_price, pay_method, discount_applied || 0]
    );

    for (const item of items) {
      await db.pool.query(
        `INSERT INTO order_details (order_id, product_id, quantity, price_at_purchase)
         VALUES (?, ?, ?, ?)`,
        [id, item.product_id, item.quantity, item.price_at_purchase]
      );
    }

    orders = await db.getAllOrders();
    orderCache.clear(); // Xóa cache để cập nhật đơn hàng mới

    console.log(`✅ Created order ID: ${id}`);
    res.json({
      success: true,
      message: "Tạo đơn hàng thành công",
      orderId: id,
    });
  } catch (error) {
    console.error("❌ Create order error:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Lỗi server khi tạo đơn hàng" });
  }
});

// Sửa sản phẩm
app.put("/api/products/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.log(`❌ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }

    const productId = req.params.id;
    const { name, price, stock, category_id, description, image_url, hot } =
      req.body;
    if (!name || !price || stock === undefined || !category_id) {
      console.log("❌ Missing required fields:", req.body);
      return res
        .status(400)
        .json({ success: false, error: "Thiếu thông tin bắt buộc" });
    }

    const [result] = await db.pool.query(
      `UPDATE product 
       SET name = ?, price = ?, quantity = ?, category_id = ?, image_url = ?, \`desc\` = ?, hot = ?, updated_at = NOW()
       WHERE id = ? AND is_active = 1`,
      [
        name,
        price,
        stock,
        category_id,
        image_url || null,
        description || null, // Giữ tên biến là description
        hot ? 1 : 0,
        productId,
      ]
    );

    if (result.affectedRows === 0) {
      console.log(`❌ Product not found: ${productId}`);
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy sản phẩm" });
    }

    // Cập nhật mảng products
    const productIndex = products.findIndex((p) => p.id === productId);
    if (productIndex !== -1) {
      products[productIndex] = {
        ...products[productIndex],
        name,
        price,
        stock,
        category_id,
        image_url: image_url || null,
        description: description || null, // Ánh xạ desc thành description
        hot: hot ? 1 : 0,
        updated_at: new Date().toISOString(),
      };
    }

    console.log(`✅ Updated product ID: ${productId}`);
    res.json({ success: true, message: "Cập nhật sản phẩm thành công" });
  } catch (error) {
    console.error("❌ Update product error:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Lỗi server khi cập nhật sản phẩm" });
  }
});

app.put("/api/customers/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(`⚠️ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }
    const customerId = req.params.id;
    const { full_name, email, phone, address, profile_pic } = req.body;
    console.log("📥 Received customer data:", {
      customerId,
      full_name,
      email,
      phone,
      address,
      profile_pic,
    });

    if (!full_name || !email) {
      console.warn(
        `⚠️ Missing required fields: full_name=${full_name}, email=${email}`
      );
      return res
        .status(400)
        .json({ success: false, error: "Họ và tên và email là bắt buộc" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.warn(`⚠️ Invalid email: ${email}`);
      return res
        .status(400)
        .json({ success: false, error: "Email không hợp lệ" });
    }

    const [existing] = await db.pool.query(
      `SELECT id FROM user WHERE email = ? AND id != ? AND is_active = 1`,
      [email, customerId]
    );
    if (existing.length > 0) {
      console.warn(`⚠️ Email already exists: ${email}`);
      return res
        .status(400)
        .json({ success: false, error: "Email đã được sử dụng" });
    }

    const [result] = await db.pool.query(
      `UPDATE user SET full_name = ?, email = ?, phone = ?, address = ?, profile_pic = ?, create_at = NOW()
       WHERE id = ? AND is_active = 1`,
      [
        full_name,
        email,
        phone || null,
        address || null,
        profile_pic || null,
        customerId,
      ]
    );

    if (result.affectedRows === 0) {
      console.warn(`⚠️ Customer not found or inactive: ${customerId}`);
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy khách hàng hoặc khách hàng không hoạt động",
      });
    }

    console.log(`✅ Updated customer ID: ${customerId}`);
    res.json({
      success: true,
      message: "Cập nhật khách hàng thành công",
    });
  } catch (error) {
    console.error("❌ Update customer error:", error.message);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi cập nhật khách hàng",
    });
  }
});

app.put("/api/orders/:id/payment", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }

    const orderId = req.params.id;
    const { payment_status } = req.body;

    if (!["paid", "unpaid"].includes(payment_status)) {
      return res
        .status(400)
        .json({ success: false, error: "Trạng thái thanh toán không hợp lệ" });
    }

    const [orderResult] = await db.pool.query(
      `SELECT status FROM \`order\` WHERE id = ?`,
      [orderId]
    );
    if (orderResult.length === 0) {
      console.warn(`⚠️ Order not found: ${orderId}`);
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy đơn hàng" });
    }

    if (
      orderResult[0].status === "cancelled" ||
      orderResult[0].status === "completed"
    ) {
      console.warn(
        `⚠️ Order cannot update payment status: ${orderResult[0].status}`
      );
      return res.status(400).json({
        success: false,
        error: "Đơn hàng không thể thay đổi trạng thái thanh toán",
      });
    }

    let query = `UPDATE \`order\` SET payment_status = ?, update_date = NOW()`;
    let params = [payment_status, orderId];

    if (payment_status === "paid" && orderResult[0].status === "pending") {
      query += `, status = 'completed'`;
    }

    query += ` WHERE id = ?`;
    params.push(orderId);

    const [result] = await db.pool.query(query, params);

    if (result.affectedRows === 0) {
      console.error(
        `❌ Failed to update payment status for order ID: ${orderId}`
      );
      return res.status(500).json({
        success: false,
        error: "Không thể cập nhật trạng thái thanh toán",
      });
    }

    // Xóa cache để đảm bảo dữ liệu mới
    orderCache.clear();
    console.log(`🧹 Cleared order cache`);

    console.log(
      `✅ Updated payment status for order ID: ${orderId} to ${payment_status}`
    );
    res.json({
      success: true,
      message: "Cập nhật trạng thái thanh toán thành công",
    });
  } catch (error) {
    console.error(`❌ Update payment status error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi cập nhật trạng thái thanh toán",
    });
  }
});

app.put("/api/orders/:id/cancel", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(`⚠️ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }

    const orderId = req.params.id;
    console.log(`🗑️ Attempting to cancel order ID: ${orderId}`);

    const [orderResult] = await db.pool.query(
      `SELECT status FROM orders WHERE id = ? AND is_active = 1`,
      [orderId]
    );
    if (orderResult.length === 0) {
      console.warn(`⚠️ Order not found: ${orderId}`);
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy đơn hàng" });
    }

    if (
      orderResult[0].status === "cancelled" ||
      orderResult[0].status === "completed"
    ) {
      console.warn(
        `⚠️ Order cannot be cancelled, current status: ${orderResult[0].status}`
      );
      return res
        .status(400)
        .json({ success: false, error: "Đơn hàng không thể hủy" });
    }

    const [result] = await db.pool.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [orderId]
    );

    if (result.affectedRows === 0) {
      console.error(`❌ Failed to cancel order ID: ${orderId}`);
      return res
        .status(500)
        .json({ success: false, error: "Không thể hủy đơn hàng" });
    }

    // Tải lại mảng orders từ cơ sở dữ liệu
    orders = await db.getAllOrders();

    console.log(`✅ Cancelled order ID: ${orderId}`);
    res.json({
      success: true,
      message: "Hủy đơn hàng thành công",
    });
  } catch (error) {
    console.error(`❌ Cancel order error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi hủy đơn hàng",
    });
  }
});

// Xóa sản phẩm
app.delete("/api/customers/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(`⚠️ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }
    const customerId = req.params.id;
    const [result] = await db.pool.query(
      `UPDATE user SET is_active = 0, create_at = NOW() WHERE id = ?`,
      [customerId]
    );
    if (result.affectedRows === 0) {
      console.warn(`⚠️ Customer not found: ${customerId}`);
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy khách hàng" });
    }
    console.log(`✅ Deleted customer ID: ${customerId}`);
    res.json({
      success: true,
      message: "Xóa khách hàng thành công",
    });
  } catch (error) {
    console.error("❌ Delete customer error:", error.message);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi xóa khách hàng",
    });
  }
});

app.delete("/api/customers/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      console.warn(`⚠️ Unauthorized access by user: ${req.user.username}`);
      return res
        .status(403)
        .json({ success: false, error: "Yêu cầu quyền admin" });
    }
    const customerId = req.params.id;
    const [result] = await db.pool.query(
      `UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?`,
      [customerId]
    );
    if (result.affectedRows === 0) {
      console.warn(`⚠️ Customer not found: ${customerId}`);
      return res
        .status(404)
        .json({ success: false, error: "Không tìm thấy khách hàng" });
    }
    users = users.filter((u) => u.id !== customerId); // Cập nhật mảng giả lập
    console.log(`✅ Deleted customer ID: ${customerId}`);
    res.json({
      success: true,
      message: "Xóa khách hàng thành công",
    });
  } catch (error) {
    console.error("❌ Delete customer error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi xóa khách hàng",
    });
  }
});

app.get("/api/ratings", optionalAuth, (req, res) => {
  try {
    res.json({
      success: true,
      ratings,
      total: ratings.length,
    });
  } catch (error) {
    console.error("❌ Get ratings error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy danh sách đánh giá",
    });
  }
});

app.get("/api/vouchers", optionalAuth, (req, res) => {
  try {
    const activeVouchers = vouchers.filter((v) => v.active === 1);
    res.json({
      success: true,
      vouchers: activeVouchers,
      total: activeVouchers.length,
    });
  } catch (error) {
    console.error("❌ Get vouchers error:", error);
    res.status(500).json({
      success: false,
      error: "Lỗi server khi lấy danh sách mã giảm giá",
    });
  }
});

// ===================== ERROR HANDLING =====================
app.use((err, req, res, next) => {
  console.error("❌ Application Error:", {
    message: err.message,
    url: req.url,
    method: req.method,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });
  if (err.message.includes("Missing parameter name")) {
    console.error("⚠️ Path-to-regexp error detected. Check route definitions.");
    return res.status(500).json({
      success: false,
      error: "Invalid route pattern detected",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "Something went wrong",
    });
  }
  if (err.message === "Not allowed by CORS") {
    return res
      .status(403)
      .json({ success: false, error: "CORS policy violation" });
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

app.use((req, res) => {
  console.log("❓ 404 Request:", req.method, req.url);
  if (req.url.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      error: "API endpoint not found",
      message: `${req.method} ${req.url} does not exist`,
    });
  }
  res.redirect("/login");
});

// ===================== SERVER STARTUP =====================
initializeApp().then(() => {
  app.listen(port, () => {
    console.log(
      `🚀 Store Management Server is running on http://localhost:${port}`
    );
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`🔐 Admin Login: http://localhost:${port}/admin/login`);
    console.log(
      `📊 Dashboard: http://localhost:${port}/dashboard (requires login)`
    );
    console.log("✅ Real database structure system activated");
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  if (db.pool) db.closeConnection();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Shutting down gracefully...");
  if (db.pool) db.closeConnection();
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
