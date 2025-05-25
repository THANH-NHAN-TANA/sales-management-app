// Global variables
let currentPage = "dashboard";
let productsData = [];
let customersData = [];
let ordersData = [];

// Utility functions
function showLoading() {
  document.getElementById("loading").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loading").style.display = "none";
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("vi-VN");
}

// API functions
async function fetchData(endpoint) {
  try {
    showLoading();
    const response = await fetch(`/api/${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    alert(`Lỗi khi tải dữ liệu ${endpoint}: ${error.message}`);
    return [];
  } finally {
    hideLoading();
  }
}

async function postData(endpoint, data) {
  try {
    showLoading();
    const response = await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error posting to ${endpoint}:`, error);
    alert(`Lỗi khi thêm dữ liệu: ${error.message}`);
    return null;
  } finally {
    hideLoading();
  }
}

async function deleteData(endpoint, id) {
  try {
    showLoading();
    const response = await fetch(`/api/${endpoint}/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error deleting from ${endpoint}:`, error);
    alert(`Lỗi khi xóa dữ liệu: ${error.message}`);
    return null;
  } finally {
    hideLoading();
  }
}

// Load stats for dashboard
async function loadStats() {
  try {
    const stats = await fetchData("stats");
    if (stats) {
      document.getElementById("total-products").textContent =
        stats.totalProducts || 0;
      document.getElementById("total-customers").textContent =
        stats.totalCustomers || 0;
      document.getElementById("total-orders").textContent =
        stats.totalOrders || 0;
      document.getElementById("total-revenue").textContent = formatCurrency(
        stats.totalRevenue || 0
      );
    }
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

// Navigation functions
function setActiveNav(pageName) {
  // Remove active class from all nav links
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.remove("active");
  });

  // Add active class to current page
  const currentLink =
    document.querySelector(`[onclick="loadPage('${pageName}')"]`) ||
    document.querySelector('a[href="/"]');
  if (currentLink) {
    currentLink.classList.add("active");
  }
}

function updatePageTitle(title) {
  document.getElementById("page-title").textContent = title;
}

// Page loading functions
async function loadPage(pageName) {
  currentPage = pageName;
  setActiveNav(pageName);

  const contentArea = document.querySelector(".content-area");
  const statsSection = document.getElementById("stats-section");

  switch (pageName) {
    case "products":
      updatePageTitle("Quản lý Sản phẩm");
      statsSection.style.display = "none";
      await loadProductsPage(contentArea);
      break;
    case "customers":
      updatePageTitle("Quản lý Khách hàng");
      statsSection.style.display = "none";
      await loadCustomersPage(contentArea);
      break;
    case "orders":
      updatePageTitle("Quản lý Đơn hàng");
      statsSection.style.display = "none";
      await loadOrdersPage(contentArea);
      break;
    default:
      updatePageTitle("Dashboard Overview");
      statsSection.style.display = "grid";
      loadDashboardPage(contentArea);
      await loadStats();
  }
}

function loadDashboardPage(container) {
  container.innerHTML = `
        <div class="welcome-section">
            <h3>Chào mừng đến với Hệ thống Quản lý Bán hàng</h3>
            <p>Hệ thống giúp bạn quản lý sản phẩm, khách hàng và đơn hàng một cách hiệu quả.</p>
            
            <div class="quick-actions">
                <h4>Thao tác nhanh:</h4>
                <div class="action-buttons">
                    <button class="action-btn" onclick="loadPage('products')">
                        <i class="fas fa-plus"></i> Thêm Sản phẩm
                    </button>
                    <button class="action-btn" onclick="loadPage('customers')">
                        <i class="fas fa-user-plus"></i> Thêm Khách hàng
                    </button>
                    <button class="action-btn" onclick="loadPage('orders')">
                        <i class="fas fa-cart-plus"></i> Tạo Đơn hàng
                    </button>
                </div>
            </div>

            <div class="api-info">
                <h4>API Endpoints:</h4>
                <ul>
                    <li><strong>Products:</strong> /api/products</li>
                    <li><strong>Customers:</strong> /api/customers</li>
                    <li><strong>Orders:</strong> /api/orders</li>
                    <li><strong>Stats:</strong> /api/stats</li>
                    <li><strong>Health:</strong> /health</li>
                </ul>
            </div>
        </div>
    `;
}

async function loadProductsPage(container) {
  productsData = await fetchData("products");

  container.innerHTML = `
        <div class="page-header">
            <button class="btn btn-primary" onclick="showAddProductForm()">
                <i class="fas fa-plus"></i> Thêm Sản phẩm mới
            </button>
        </div>
        
        <div id="product-form-container" style="display: none;"></div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Tên sản phẩm</th>
                        <th>Giá</th>
                        <th>Danh mục</th>
                        <th>Số lượng</th>
                        <th>Thao tác</th>
                    </tr>
                </thead>
                <tbody id="products-tbody">
                    ${productsData
                      .map(
                        (product) => `
                        <tr>
                            <td>${product.id}</td>
                            <td>${product.name}</td>
                            <td>${formatCurrency(product.price)}</td>
                            <td>${product.category}</td>
                            <td>${product.stock}</td>
                            <td>
                                <button class="btn btn-danger" onclick="deleteProduct(${
                                  product.id
                                })">
                                    <i class="fas fa-trash"></i> Xóa
                                </button>
                            </td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function loadCustomersPage(container) {
  customersData = await fetchData("customers");

  container.innerHTML = `
        <div class="page-header">
            <button class="btn btn-primary" onclick="showAddCustomerForm()">
                <i class="fas fa-plus"></i> Thêm Khách hàng mới
            </button>
        </div>
        
        <div id="customer-form-container" style="display: none;"></div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Tên khách hàng</th>
                        <th>Email</th>
                        <th>Số điện thoại</th>
                        <th>Thao tác</th>
                    </tr>
                </thead>
                <tbody id="customers-tbody">
                    ${customersData
                      .map(
                        (customer) => `
                        <tr>
                            <td>${customer.id}</td>
                            <td>${customer.name}</td>
                            <td>${customer.email}</td>
                            <td>${customer.phone}</td>
                            <td>
                                <button class="btn btn-danger" onclick="deleteCustomer(${customer.id})">
                                    <i class="fas fa-trash"></i> Xóa
                                </button>
                            </td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function loadOrdersPage(container) {
  ordersData = await fetchData("orders");

  container.innerHTML = `
        <div class="page-header">
            <button class="btn btn-primary" onclick="showAddOrderForm()">
                <i class="fas fa-plus"></i> Tạo Đơn hàng mới
            </button>
        </div>
        
        <div id="order-form-container" style="display: none;"></div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Khách hàng</th>
                        <th>Sản phẩm</th>
                        <th>Số lượng</th>
                        <th>Tổng tiền</th>
                        <th>Ngày đặt</th>
                        <th>Thao tác</th>
                    </tr>
                </thead>
                <tbody id="orders-tbody">
                    ${ordersData
                      .map(
                        (order) => `
                        <tr>
                            <td>${order.id}</td>
                            <td>Khách hàng #${order.customerId}</td>
                            <td>Sản phẩm #${order.productId}</td>
                            <td>${order.quantity}</td>
                            <td>${formatCurrency(order.total)}</td>
                            <td>${formatDate(order.date)}</td>
                            <td>
                                <button class="btn btn-danger" onclick="deleteOrder(${
                                  order.id
                                })">
                                    <i class="fas fa-trash"></i> Xóa
                                </button>
                            </td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `;
}

// Form functions
function showAddProductForm() {
  const container = document.getElementById("product-form-container");
  container.style.display = "block";
  container.innerHTML = `
        <div class="form-card">
            <h3>Thêm Sản phẩm mới</h3>
            <form onsubmit="addProduct(event)">
                <div class="form-group">
                    <label>Tên sản phẩm:</label>
                    <input type="text" name="name" required>
                </div>
                <div class="form-group">
                    <label>Giá:</label>
                    <input type="number" name="price" required>
                </div>
                <div class="form-group">
                    <label>Danh mục:</label>
                    <input type="text" name="category" required>
                </div>
                <div class="form-group">
                    <label>Số lượng:</label>
                    <input type="number" name="stock" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-success">Thêm sản phẩm</button>
                    <button type="button" class="btn btn-secondary" onclick="hideProductForm()">Hủy</button>
                </div>
            </form>
        </div>
    `;
}

function hideProductForm() {
  document.getElementById("product-form-container").style.display = "none";
}

async function addProduct(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const productData = {
    name: formData.get("name"),
    price: parseInt(formData.get("price")),
    category: formData.get("category"),
    stock: parseInt(formData.get("stock")),
  };

  const result = await postData("products", productData);
  if (result) {
    hideProductForm();
    loadPage("products"); // Reload the page
  }
}

async function deleteProduct(id) {
  if (confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) {
    const result = await deleteData("products", id);
    if (result) {
      loadPage("products"); // Reload the page
    }
  }
}

// Similar functions for customers and orders...
function showAddCustomerForm() {
  const container = document.getElementById("customer-form-container");
  container.style.display = "block";
  container.innerHTML = `
        <div class="form-card">
            <h3>Thêm Khách hàng mới</h3>
            <form onsubmit="addCustomer(event)">
                <div class="form-group">
                    <label>Tên khách hàng:</label>
                    <input type="text" name="name" required>
                </div>
                <div class="form-group">
                    <label>Email:</label>
                    <input type="email" name="email" required>
                </div>
                <div class="form-group">
                    <label>Số điện thoại:</label>
                    <input type="tel" name="phone" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-success">Thêm khách hàng</button>
                    <button type="button" class="btn btn-secondary" onclick="hideCustomerForm()">Hủy</button>
                </div>
            </form>
        </div>
    `;
}

function hideCustomerForm() {
  document.getElementById("customer-form-container").style.display = "none";
}

async function addCustomer(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const customerData = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  };

  const result = await postData("customers", customerData);
  if (result) {
    hideCustomerForm();
    loadPage("customers"); // Reload the page
  }
}

async function deleteCustomer(id) {
  if (confirm("Bạn có chắc chắn muốn xóa khách hàng này?")) {
    const result = await deleteData("customers", id);
    if (result) {
      loadPage("customers"); // Reload the page
    }
  }
}

// Order functions
function showAddOrderForm() {
  const container = document.getElementById("order-form-container");
  container.style.display = "block";
  container.innerHTML = `
        <div class="form-card">
            <h3>Tạo Đơn hàng mới</h3>
            <form onsubmit="addOrder(event)">
                <div class="form-group">
                    <label>Khách hàng:</label>
                    <select name="customerId" required>
                        <option value="">Chọn khách hàng</option>
                        ${customersData
                          .map(
                            (customer) =>
                              `<option value="${customer.id}">${customer.name}</option>`
                          )
                          .join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label>Sản phẩm:</label>
                    <select name="productId" required onchange="updateOrderTotal()">
                        <option value="">Chọn sản phẩm</option>
                        ${productsData
                          .map(
                            (product) =>
                              `<option value="${product.id}" data-price="${
                                product.price
                              }">${product.name} - ${formatCurrency(
                                product.price
                              )}</option>`
                          )
                          .join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label>Số lượng:</label>
                    <input type="number" name="quantity" min="1" required onchange="updateOrderTotal()">
                </div>
                <div class="form-group">
                    <label>Tổng tiền:</label>
                    <input type="text" id="order-total" readonly>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-success">Tạo đơn hàng</button>
                    <button type="button" class="btn btn-secondary" onclick="hideOrderForm()">Hủy</button>
                </div>
            </form>
        </div>
    `;
}

function hideOrderForm() {
  document.getElementById("order-form-container").style.display = "none";
}

function updateOrderTotal() {
  const productSelect = document.querySelector('select[name="productId"]');
  const quantityInput = document.querySelector('input[name="quantity"]');
  const totalInput = document.getElementById("order-total");

  if (productSelect.value && quantityInput.value) {
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const price = parseInt(selectedOption.dataset.price);
    const quantity = parseInt(quantityInput.value);
    const total = price * quantity;
    totalInput.value = formatCurrency(total);
  } else {
    totalInput.value = "";
  }
}

async function addOrder(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const productSelect = document.querySelector('select[name="productId"]');
  const selectedOption = productSelect.options[productSelect.selectedIndex];
  const price = parseInt(selectedOption.dataset.price);
  const quantity = parseInt(formData.get("quantity"));

  const orderData = {
    customerId: parseInt(formData.get("customerId")),
    productId: parseInt(formData.get("productId")),
    quantity: quantity,
    total: price * quantity,
  };

  const result = await postData("orders", orderData);
  if (result) {
    hideOrderForm();
    loadPage("orders"); // Reload the page
  }
}

async function deleteOrder(id) {
  if (confirm("Bạn có chắc chắn muốn xóa đơn hàng này?")) {
    const result = await deleteData("orders", id);
    if (result) {
      loadPage("orders"); // Reload the page
    }
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", function () {
  // Load initial data
  loadStats();

  // Set up event listeners
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (href && href.startsWith("#")) {
        e.preventDefault();
        const pageName = href.substring(1);
        loadPage(pageName);
      }
    });
  });

  // Auto refresh stats every 30 seconds
  setInterval(loadStats, 30000);

  console.log("Sales Management System initialized successfully!");
});

// Export functions for global access
window.loadPage = loadPage;
window.loadStats = loadStats;
window.showAddProductForm = showAddProductForm;
window.hideProductForm = hideProductForm;
window.addProduct = addProduct;
window.deleteProduct = deleteProduct;
window.showAddCustomerForm = showAddCustomerForm;
window.hideCustomerForm = hideCustomerForm;
window.addCustomer = addCustomer;
window.deleteCustomer = deleteCustomer;
window.showAddOrderForm = showAddOrderForm;
window.hideOrderForm = hideOrderForm;
window.addOrder = addOrder;
window.deleteOrder = deleteOrder;
window.updateOrderTotal = updateOrderTotal;
