const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");
const mysql = require("mysql2/promise");
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

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(compression());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS) || 5,
  message: { error: "Quá nhiều lần thử. Vui lòng thử lại sau 15 phút." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minute
  max: parseInt(process.env.OTP_RATE_LIMIT_MAX_ATTEMPTS) || 1,
  message: { error: "Vui lòng chờ 1 phút trước khi gửi lại OTP." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Session middleware for login tracking
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// Email configuration
let emailTransporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  try {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
    console.log("✅ Email transporter configured");
  } catch (error) {
    console.error("❌ Email configuration error:", error.message);
  }
} else {
  console.log("⚠️  Email not configured. OTP functionality will be disabled.");
}

// Database connection pool for OTP functionality
let otpPool = null;
try {
  otpPool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "salesapp",
    password: process.env.DB_PASSWORD || "SalesApp@123",
    database: process.env.DB_NAME || "sales_management",
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT) || 0,
  });
  console.log("✅ OTP database pool created");
} catch (error) {
  console.error("❌ OTP database pool creation error:", error.message);
}

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

        // Initialize additional tables for OTP functionality
        if (otpPool) {
          await initializeOTPTables();
        }
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

// Initialize OTP related tables
async function initializeOTPTables() {
  try {
    const connection = await otpPool.getConnection();

    // Create password_resets table for OTP
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_token (token),
        INDEX idx_expires (expires_at)
      )
    `);

    // Create user_sessions table for remember me functionality
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_expires (expires_at)
      )
    `);

    connection.release();
    console.log("✅ OTP tables initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing OTP tables:", error);
    throw error;
  }
}

// Utility functions for OTP
function generateOTP() {
  const length = parseInt(process.env.OTP_LENGTH) || 6;
  return Math.floor(
    Math.pow(10, length - 1) +
      Math.random() * (Math.pow(10, length) - Math.pow(10, length - 1))
  ).toString();
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function sendOTPEmail(email, otp, fullName = "") {
  if (!emailTransporter) {
    throw new Error("Email transporter not configured");
  }

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || "Sales Management System"}" <${
      process.env.SMTP_USER
    }>`,
    to: email,
    subject: "Mã OTP khôi phục mật khẩu - Sales Management System",
    html: `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">${
            process.env.APP_NAME || "Sales Management System"
          }</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; margin-bottom: 20px;">Xin chào ${
            fullName || "Quý khách"
          }!</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Bạn đã yêu cầu khôi phục mật khẩu cho tài khoản của mình. 
            Vui lòng sử dụng mã OTP bên dưới để xác thực:
          </p>
          <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; margin: 20px 0; text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${otp}</div>
          </div>
          <p style="color: #666; font-size: 14px;">
            <strong>Lưu ý:</strong> Mã OTP này sẽ hết hạn sau <strong>${
              process.env.OTP_EXPIRY_MINUTES || 5
            } phút</strong>. 
            Vui lòng không chia sẻ mã này với bất kỳ ai.
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">
            Nếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này.
          </p>
        </div>
        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
          © 2025 ${
            process.env.APP_NAME || "Sales Management System"
          }. All rights reserved.
        </div>
      </div>
    `,
  };

  return await emailTransporter.sendMail(mailOptions);
}

// Clean expired records
async function cleanExpiredRecords() {
  if (!otpPool) return;

  try {
    await otpPool.execute(
      "DELETE FROM password_resets WHERE expires_at < NOW()"
    );
    await otpPool.execute("DELETE FROM user_sessions WHERE expires_at < NOW()");
  } catch (error) {
    console.error("Error cleaning expired records:", error);
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Optional authentication middleware (for routes that work with or without auth)
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
      return res.status(401).json({ error: "Authentication required" });
    }

    if (roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ error: "Insufficient permissions" });
    }
  };
};

// Web authentication middleware for protected pages
const requireWebAuth = (req, res, next) => {
  const token =
    req.headers.authorization?.split(" ")[1] ||
    req.query.token ||
    req.session.token;

  if (!token) {
    console.log(`Unauthorized access attempt to ${req.path}`);
    return res.redirect("/login");
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log(`Invalid token for ${req.path}:`, err.message);
      return res.redirect("/login");
    }
    req.user = user;
    next();
  });
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

// Helper function to get next ID
const getNextId = (array) => Math.max(...array.map((item) => item.id), 0) + 1;

// ===================== AUTHENTICATION ROUTES =====================

// Login API (connect to sales_management database - users table)
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    console.log("Login attempt:", req.body.username);
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Email/Username and password are required" });
    }

    // Find user by email or username from users table
    const user = await getUserByEmailOrUsername(username);

    if (!user) {
      console.log("User not found:", username);
      return res
        .status(401)
        .json({ error: "Invalid email/username or password" });
    }

    // Check if account is active
    if (!user.is_active) {
      console.log("Inactive account:", username);
      return res
        .status(401)
        .json({ error: "Account is inactive. Please contact administrator." });
    }

    // Check password against hashed password from database
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log("Invalid password for user:", username);
      return res
        .status(401)
        .json({ error: "Invalid email/username or password" });
    }

    // Update last login time (optional)
    await updateUserLastLogin(user.id);

    // Generate JWT token
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

    // Save session if remember me and OTP pool available
    if (rememberMe && otpPool) {
      try {
        const sessionExpiry = new Date();
        sessionExpiry.setDate(sessionExpiry.getDate() + 30);

        await otpPool.execute(
          "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
          [user.id, token, sessionExpiry]
        );
      } catch (error) {
        console.error("Session save error:", error);
        // Continue without saving session
      }
    }

    // Store session
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.token = token;

    console.log("Login successful for user:", username);

    // Return success response
    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name || user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error during login" });
  }
});

// Token verification
app.get("/api/auth/verify", authenticateToken, async (req, res) => {
  try {
    // Get fresh user data
    const user = await getUserById(req.user.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid token" });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        gender: user.gender,
        birthDate: user.birth_date,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(403).json({ error: "Invalid or expired token" });
  }
});

// Logout API
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    // Remove session from database if OTP pool available
    if (token && otpPool) {
      try {
        await otpPool.execute("DELETE FROM user_sessions WHERE token = ?", [
          token,
        ]);
      } catch (error) {
        console.error("Session removal error:", error);
      }
    }

    // Destroy express session
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// Forgot Password - Send OTP
app.post("/api/auth/forgot-password", otpLimiter, async (req, res) => {
  if (!otpPool || !emailTransporter) {
    return res.status(503).json({
      error:
        "Chức năng quên mật khẩu chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email là bắt buộc" });
    }

    // Check if user exists
    const user = await getUserByEmailOrUsername(email);
    if (!user) {
      return res
        .status(404)
        .json({ error: "Email không tồn tại trong hệ thống" });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: "Tài khoản đã bị vô hiệu hóa" });
    }

    // Generate OTP and token
    const otp = generateOTP();
    const resetToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + (parseInt(process.env.OTP_EXPIRY_MINUTES) || 5)
    );

    // Clean old OTPs for this email
    await otpPool.execute("DELETE FROM password_resets WHERE email = ?", [
      email,
    ]);

    // Save OTP to database
    await otpPool.execute(
      "INSERT INTO password_resets (email, otp, token, expires_at) VALUES (?, ?, ?, ?)",
      [email, otp, resetToken, expiresAt]
    );

    // Send OTP email
    await sendOTPEmail(email, otp, user.full_name);

    res.json({
      success: true,
      message: "Mã OTP đã được gửi về email của bạn",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Lỗi server. Vui lòng thử lại sau." });
  }
});

// Verify OTP
app.post("/api/auth/verify-otp", async (req, res) => {
  if (!otpPool) {
    return res.status(503).json({
      error:
        "Chức năng xác thực OTP chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    });
  }

  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email và OTP là bắt buộc" });
    }

    // Find valid OTP
    const [otpRecords] = await otpPool.execute(
      "SELECT * FROM password_resets WHERE email = ? AND otp = ? AND used = false AND expires_at > NOW()",
      [email, otp]
    );

    if (otpRecords.length === 0) {
      return res.status(400).json({
        error: "Mã OTP không đúng hoặc đã hết hạn",
      });
    }

    const otpRecord = otpRecords[0];

    res.json({
      success: true,
      message: "Xác thực OTP thành công",
      token: otpRecord.token,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ error: "Lỗi server. Vui lòng thử lại sau." });
  }
});

// Reset Password
app.post("/api/auth/reset-password", async (req, res) => {
  if (!otpPool) {
    return res.status(503).json({
      error:
        "Chức năng đặt lại mật khẩu chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    });
  }

  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Mật khẩu phải có ít nhất 8 ký tự" });
    }

    // Find valid OTP
    const [otpRecords] = await otpPool.execute(
      "SELECT * FROM password_resets WHERE email = ? AND otp = ? AND used = false AND expires_at > NOW()",
      [email, otp]
    );

    if (otpRecords.length === 0) {
      return res
        .status(400)
        .json({ error: "Mã OTP không đúng hoặc đã hết hạn" });
    }

    // Check if user exists
    const user = await getUserByEmailOrUsername(email);
    if (!user) {
      return res.status(404).json({ error: "Người dùng không tồn tại" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12
    );

    // Start transaction
    const connection = await otpPool.getConnection();
    await connection.beginTransaction();

    try {
      // Update password using direct SQL (assuming users table structure)
      await connection.execute(
        "UPDATE users SET password = ?, updated_at = NOW() WHERE email = ?",
        [hashedPassword, email]
      );

      // Mark OTP as used
      await connection.execute(
        "UPDATE password_resets SET used = true WHERE email = ? AND otp = ?",
        [email, otp]
      );

      // Invalidate all user sessions (force re-login)
      await connection.execute("DELETE FROM user_sessions WHERE user_id = ?", [
        user.id,
      ]);

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: "Đặt lại mật khẩu thành công",
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Lỗi server. Vui lòng thử lại sau." });
  }
});

// Update Profile
app.put("/api/auth/update-profile", authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword, firstName, lastName, phone, address } =
      req.body;
    const userId = req.user.id;

    // If changing password, verify old password
    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({ error: "Vui lòng nhập mật khẩu cũ" });
      }

      // Get current user
      const user = await getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "Người dùng không tồn tại" });
      }

      const isValidOldPassword = await bcrypt.compare(
        oldPassword,
        user.password
      );
      if (!isValidOldPassword) {
        return res.status(400).json({ error: "Mật khẩu cũ không đúng" });
      }

      // Validate new password
      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(
        newPassword,
        parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12
      );

      // Update password
      if (otpPool) {
        await otpPool.execute(
          "UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?",
          [hashedNewPassword, userId]
        );
      }
    }

    // Update other profile fields
    const updateFields = [];
    const updateValues = [];

    if (firstName !== undefined) {
      updateFields.push("first_name = ?");
      updateValues.push(firstName);
    }
    if (lastName !== undefined) {
      updateFields.push("last_name = ?");
      updateValues.push(lastName);
    }
    if (phone !== undefined) {
      updateFields.push("phone = ?");
      updateValues.push(phone);
    }
    if (address !== undefined) {
      updateFields.push("address = ?");
      updateValues.push(address);
    }

    if (updateFields.length > 0 && otpPool) {
      updateFields.push(
        'full_name = CONCAT(IFNULL(first_name, ""), " ", IFNULL(last_name, ""))'
      );
      updateFields.push("updated_at = NOW()");
      updateValues.push(userId);

      const updateQuery = `UPDATE users SET ${updateFields.join(
        ", "
      )} WHERE id = ?`;
      await otpPool.execute(updateQuery, updateValues);
    }

    res.json({
      success: true,
      message: "Cập nhật thông tin thành công",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Lỗi server. Vui lòng thử lại sau." });
  }
});

// Get current user info (from sales_management database - users table)
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      username: user.username,
      name: user.full_name || user.username,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    });
  } catch (error) {
    console.error("Get user info error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dashboard Stats
app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    // Get sample stats (replace with your actual business logic)
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
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Transactions
app.get("/api/transactions", authenticateToken, async (req, res) => {
  try {
    // Mock transaction data based on orders
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
      .slice(0, 10); // Latest 10 transactions

    res.json(transactions);
  } catch (error) {
    console.error("Transactions error:", error);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===================== WEB INTERFACE ROUTES =====================

// Root route - redirect based on authentication
app.get("/", (req, res) => {
  console.log("Root access attempt");

  // Check if user has valid session token
  const token = req.session.token || req.headers.authorization?.split(" ")[1];

  if (token) {
    // Verify token
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.log("Invalid token in session, redirecting to login");
        return res.redirect("/login");
      } else {
        console.log("Valid token found, redirecting to dashboard");
        return res.redirect("/dashboard");
      }
    });
  } else {
    console.log("No token found, redirecting to login");
    res.redirect("/login");
  }
});

// Login page - always accessible
app.get("/login", (req, res) => {
  console.log("Login page accessed");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Dashboard - requires authentication
app.get("/dashboard", requireWebAuth, (req, res) => {
  console.log("Dashboard accessed by user:", req.user.username);
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Legacy routes for compatibility
app.get("/dashboard.html", requireWebAuth, (req, res) => {
  res.redirect("/dashboard");
});

app.get("/login.html", (req, res) => {
  res.redirect("/login");
});

// Protected pages - all require authentication
app.get("/products-page", requireWebAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/customers-page", requireWebAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/orders-page", requireWebAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===================== API ROUTES =====================

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    version: process.env.APP_VERSION || "1.0.0",
    database: "connected",
    email: emailTransporter ? "configured" : "not configured",
    otp: otpPool && emailTransporter ? "enabled" : "disabled",
  });
});

// API Info endpoint (for programmatic access)
app.get("/api", (req, res) => {
  res.json({
    message: "Sales Management System API",
    version: process.env.APP_VERSION || "1.0.0",
    description:
      process.env.APP_DESCRIPTION ||
      "Complete REST API for Sales Management with Products, Customers, and Orders",
    endpoints: {
      auth: {
        login: "POST /api/auth/login",
        verify: "GET /api/auth/verify",
        logout: "POST /api/auth/logout",
        forgotPassword: "POST /api/auth/forgot-password",
        verifyOtp: "POST /api/auth/verify-otp",
        resetPassword: "POST /api/auth/reset-password",
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
    authentication: "Bearer token required for protected endpoints",
    rateLimit: {
      auth: "5 requests per 15 minutes",
      otp: "1 request per minute",
    },
  });
});

// Products API (with authentication)
app.get("/api/products", optionalAuth, (req, res) => {
  const { category, minPrice, maxPrice, inStock } = req.query;
  let filteredProducts = [...products];

  // Filter by category
  if (category) {
    filteredProducts = filteredProducts.filter((p) =>
      p.category.toLowerCase().includes(category.toLowerCase())
    );
  }

  // Filter by price range
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

  // Filter by stock availability
  if (inStock === "true") {
    filteredProducts = filteredProducts.filter((p) => p.stock > 0);
  }

  // Return filtered products
  res.json({
    products: filteredProducts,
    total: filteredProducts.length,
    filters: { category, minPrice, maxPrice, inStock },
  });
});

app.get("/api/products/:id", (req, res) => {
  const productId = parseInt(req.params.id);
  const product = products.find((p) => p.id === productId);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json(product);
});

app.post(
  "/api/products",
  authenticateToken,
  requireRole(["admin", "manager"]),
  (req, res) => {
    const { name, price, stock, category, description } = req.body;

    if (!name || !price || stock === undefined) {
      return res
        .status(400)
        .json({ error: "Name, price, and stock are required" });
    }

    const newProduct = {
      id: getNextId(products),
      name,
      description: description || "",
      price: parseFloat(price),
      stock: parseInt(stock),
      category: category || "General",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    products.push(newProduct);
    res.status(201).json(newProduct);
  }
);

app.put(
  "/api/products/:id",
  authenticateToken,
  requireRole(["admin", "manager"]),
  (req, res) => {
    const productId = parseInt(req.params.id);
    const productIndex = products.findIndex((p) => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).json({ error: "Product not found" });
    }

    const { name, price, stock, category, description } = req.body;
    const updatedProduct = {
      ...products[productIndex],
      name: name || products[productIndex].name,
      description:
        description !== undefined
          ? description
          : products[productIndex].description,
      price:
        price !== undefined ? parseFloat(price) : products[productIndex].price,
      stock:
        stock !== undefined ? parseInt(stock) : products[productIndex].stock,
      category: category || products[productIndex].category,
      updated_at: new Date().toISOString(),
    };

    products[productIndex] = updatedProduct;
    res.json(updatedProduct);
  }
);

app.delete(
  "/api/products/:id",
  authenticateToken,
  requireRole(["admin"]),
  (req, res) => {
    const productId = parseInt(req.params.id);
    const productIndex = products.findIndex((p) => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).json({ error: "Product not found" });
    }

    const deletedProduct = products.splice(productIndex, 1)[0];
    res.json({
      message: "Product deleted successfully",
      product: deletedProduct,
    });
  }
);

// Customers API
app.get("/api/customers", (req, res) => {
  const { search } = req.query;
  let filteredCustomers = [...customers];

  if (search) {
    filteredCustomers = filteredCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase())
    );
  }

  res.json({
    customers: filteredCustomers,
    total: filteredCustomers.length,
  });
});

app.get("/api/customers/:id", (req, res) => {
  const customerId = parseInt(req.params.id);
  const customer = customers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }

  // Get customer's orders
  const customerOrders = orders.filter((o) => o.customer_id === customerId);

  res.json({
    ...customer,
    orders: customerOrders,
    total_orders: customerOrders.length,
    total_spent: customerOrders.reduce(
      (sum, order) => sum + order.total_amount,
      0
    ),
  });
});

app.post("/api/customers", (req, res) => {
  const { name, email, phone, address } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  // Check if email already exists
  const existingCustomer = customers.find((c) => c.email === email);
  if (existingCustomer) {
    return res
      .status(409)
      .json({ error: "Customer with this email already exists" });
  }

  const newCustomer = {
    id: getNextId(customers),
    name,
    email,
    phone: phone || "",
    address: address || "",
    created_at: new Date().toISOString(),
  };

  customers.push(newCustomer);
  res.status(201).json(newCustomer);
});

app.delete("/api/customers/:id", (req, res) => {
  const customerId = parseInt(req.params.id);
  const customerIndex = customers.findIndex((c) => c.id === customerId);

  if (customerIndex === -1) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const deletedCustomer = customers.splice(customerIndex, 1)[0];
  res.json({
    message: "Customer deleted successfully",
    customer: deletedCustomer,
  });
});

// Orders API
app.get("/api/orders", (req, res) => {
  const { status, customer_id } = req.query;
  let filteredOrders = [...orders];

  // Filter by status
  if (status) {
    filteredOrders = filteredOrders.filter((o) => o.status === status);
  }

  // Filter by customer
  if (customer_id) {
    filteredOrders = filteredOrders.filter(
      (o) => o.customer_id === parseInt(customer_id)
    );
  }

  // Add customer info and order items to each order
  const ordersWithDetails = filteredOrders.map((order) => {
    const customer = customers.find((c) => c.id === order.customer_id);
    const items = orderItems
      .filter((item) => item.order_id === order.id)
      .map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        return {
          ...item,
          product_name: product ? product.name : "Unknown Product",
          product_category: product ? product.category : "Unknown",
        };
      });

    return {
      ...order,
      customer_name: customer ? customer.name : "Unknown Customer",
      customer_email: customer ? customer.email : "Unknown Email",
      items: items,
      items_count: items.length,
    };
  });

  res.json({
    orders: ordersWithDetails,
    total: ordersWithDetails.length,
    filters: { status, customer_id },
  });
});

app.get("/api/orders/:id", (req, res) => {
  const orderId = parseInt(req.params.id);
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  const customer = customers.find((c) => c.id === order.customer_id);
  const items = orderItems
    .filter((item) => item.order_id === orderId)
    .map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      return {
        ...item,
        product_name: product ? product.name : "Unknown Product",
        product_price: product ? product.price : 0,
        product_category: product ? product.category : "Unknown",
      };
    });

  res.json({
    ...order,
    customer: customer || null,
    items: items,
    items_count: items.length,
  });
});

app.post("/api/orders", (req, res) => {
  const { customer_id, items, customerId, productId, quantity } = req.body;

  // Handle both formats: detailed order with items array, or simple single-product order
  let orderCustomerId, orderItems;

  if (items && Array.isArray(items)) {
    // Detailed order format
    orderCustomerId = customer_id;
    orderItems = items;
  } else if (customerId && productId && quantity) {
    // Simple order format (for web interface)
    orderCustomerId = customerId;
    orderItems = [{ product_id: productId, quantity: quantity }];
  } else {
    return res.status(400).json({ error: "Invalid order format" });
  }

  if (!orderCustomerId || !orderItems || orderItems.length === 0) {
    return res
      .status(400)
      .json({ error: "Customer ID and items are required" });
  }

  // Validate customer exists
  const customer = customers.find((c) => c.id === parseInt(orderCustomerId));
  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }

  // Calculate total and validate products
  let totalAmount = 0;
  const validatedItems = [];

  for (const item of orderItems) {
    const product = products.find((p) => p.id === parseInt(item.product_id));
    if (!product) {
      return res
        .status(404)
        .json({ error: `Product with ID ${item.product_id} not found` });
    }

    if (product.stock < parseInt(item.quantity)) {
      return res
        .status(400)
        .json({ error: `Insufficient stock for ${product.name}` });
    }

    const itemTotal = product.price * parseInt(item.quantity);
    totalAmount += itemTotal;

    validatedItems.push({
      product_id: parseInt(item.product_id),
      quantity: parseInt(item.quantity),
      unit_price: product.price,
    });
  }

  // Create order
  const newOrder = {
    id: getNextId(orders),
    customer_id: parseInt(orderCustomerId),
    total_amount: totalAmount,
    status: "pending",
    order_date: new Date().toISOString(),
  };

  orders.push(newOrder);

  // Create order items
  validatedItems.forEach((item) => {
    orderItems.push({
      id: getNextId(orderItems),
      order_id: newOrder.id,
      ...item,
    });

    // Update product stock
    const productIndex = products.findIndex((p) => p.id === item.product_id);
    products[productIndex].stock -= item.quantity;
  });

  res.status(201).json({
    ...newOrder,
    items: validatedItems,
  });
});

app.delete("/api/orders/:id", (req, res) => {
  const orderId = parseInt(req.params.id);
  const orderIndex = orders.findIndex((o) => o.id === orderId);

  if (orderIndex === -1) {
    return res.status(404).json({ error: "Order not found" });
  }

  // Remove order items
  const orderItemsToRemove = orderItems.filter(
    (item) => item.order_id === orderId
  );
  orderItemsToRemove.forEach((item) => {
    // Restore product stock
    const productIndex = products.findIndex((p) => p.id === item.product_id);
    if (productIndex !== -1) {
      products[productIndex].stock += item.quantity;
    }
  });

  // Remove order items from array
  for (let i = orderItems.length - 1; i >= 0; i--) {
    if (orderItems[i].order_id === orderId) {
      orderItems.splice(i, 1);
    }
  }

  const deletedOrder = orders.splice(orderIndex, 1)[0];
  res.json({ message: "Order deleted successfully", order: deletedOrder });
});

// Statistics API
app.get("/api/stats", (req, res) => {
  // Calculate various statistics
  const totalProducts = products.length;
  const totalCustomers = customers.length;
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce(
    (sum, order) => sum + order.total_amount,
    0
  );

  // Order status breakdown
  const ordersByStatus = orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  // Top selling products
  const productSales = orderItems.reduce((acc, item) => {
    acc[item.product_id] = (acc[item.product_id] || 0) + item.quantity;
    return acc;
  }, {});

  const topProducts = Object.entries(productSales)
    .map(([productId, quantity]) => {
      const product = products.find((p) => p.id === parseInt(productId));
      return {
        product_id: parseInt(productId),
        product_name: product ? product.name : "Unknown",
        total_sold: quantity,
        revenue: orderItems
          .filter((item) => item.product_id === parseInt(productId))
          .reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
      };
    })
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, 5);

  // Products running low on stock
  const lowStockProducts = products
    .filter((p) => p.stock <= 10)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock }));

  // Recent orders
  const recentOrders = orders
    .sort((a, b) => new Date(b.order_date) - new Date(a.order_date))
    .slice(0, 5)
    .map((order) => {
      const customer = customers.find((c) => c.id === order.customer_id);
      return {
        id: order.id,
        customer_name: customer ? customer.name : "Unknown",
        total_amount: order.total_amount,
        status: order.status,
        order_date: order.order_date,
      };
    });

  res.json({
    overview: {
      total_products: totalProducts,
      total_customers: totalCustomers,
      total_orders: totalOrders,
      total_revenue: parseFloat(totalRevenue.toFixed(2)),
      average_order_value:
        totalOrders > 0
          ? parseFloat((totalRevenue / totalOrders).toFixed(2))
          : 0,
    },
    orders_by_status: ordersByStatus,
    top_products: topProducts,
    low_stock_products: lowStockProducts,
    recent_orders: recentOrders,
    generated_at: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// 404 handler for API routes
app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found",
    path: req.path,
    method: req.method,
  });
});

// 404 handler for web routes
app.use((req, res) => {
  console.log("404 for path:", req.path);
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// Start server with database initialization
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
    console.log(
      `📧 Email SMTP: ${emailTransporter ? "Configured" : "Not configured"}`
    );
    console.log(
      `🔑 OTP Feature: ${otpPool && emailTransporter ? "Enabled" : "Disabled"}`
    );

    if (!emailTransporter) {
      console.log(
        `⚠️  Configure SMTP_USER and SMTP_PASS in .env to enable OTP emails`
      );
    }

    console.log("\n🎯 Authentication Flow:");
    console.log("  1. Access http://localhost:3000 → Redirects to /login");
    console.log("  2. Login successfully → Redirects to /dashboard");
    console.log("  3. All protected routes require valid JWT token");
  });

  // Clean expired records every hour
  if (otpPool) {
    setInterval(cleanExpiredRecords, 60 * 60 * 1000);
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  if (otpPool) {
    otpPool.end();
  }
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Shutting down gracefully...");
  if (otpPool) {
    otpPool.end();
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

module.exports = app;
