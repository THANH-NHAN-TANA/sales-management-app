const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Session middleware for login tracking
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
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

// Login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Login API (connect to sales_management database - users table)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Email/Username and password are required" });
    }

    // Find user by email or username from users table
    const user = await getUserByEmailOrUsername(username);

    if (!user) {
      return res
        .status(401)
        .json({ error: "Invalid email/username or password" });
    }

    // Check if account is active
    if (!user.is_active) {
      return res
        .status(401)
        .json({ error: "Account is inactive. Please contact administrator." });
    }

    // Check password against hashed password from database
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
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

    // Store session
    req.session.userId = user.id;
    req.session.userRole = user.role;

    // Return success response
    res.json({
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
app.get("/api/auth/verify", authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

// Logout API
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not log out" });
    }
    res.json({ message: "Logged out successfully" });
  });
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

// ===================== WEB INTERFACE ROUTES =====================

// Protected dashboard route
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve other pages (all protected)
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    version: "1.0.0",
  });
});

// API Info endpoint (for programmatic access)
app.get("/api", (req, res) => {
  res.json({
    message: "Sales Management System API",
    version: "1.0.0",
    description:
      "Complete REST API for Sales Management with Products, Customers, and Orders",
    endpoints: {
      products: "/api/products",
      customers: "/api/customers",
      orders: "/api/orders",
      stats: "/api/stats",
      health: "/health",
    },
    documentation: {
      swagger: "/api/docs",
      postman: "/api/postman",
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

  // Return simplified format for web interface
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

  // Return simplified format for web interface
  if (req.headers.accept === "application/json") {
    res.json(filteredCustomers);
  } else {
    res.json({
      customers: filteredCustomers,
      total: filteredCustomers.length,
    });
  }
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

  // Return simplified format for web interface
  if (req.headers.accept === "application/json") {
    res.json(ordersWithDetails);
  } else {
    res.json({
      orders: ordersWithDetails,
      total: ordersWithDetails.length,
      filters: { status, customer_id },
    });
  }
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

  // For simple web interface format
  if (req.headers.accept === "application/json") {
    res.json({
      totalProducts,
      totalCustomers,
      totalOrders,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    });
    return;
  }

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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    available_endpoints: {
      root: "/",
      health: "/health",
      products: "/api/products",
      customers: "/api/customers",
      orders: "/api/orders",
      stats: "/api/stats",
    },
  });
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
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

module.exports = app;
