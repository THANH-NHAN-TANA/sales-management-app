const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Sales Management API is running'
  });
});

// Basic API endpoint
app.get('/api/products', (req, res) => {
  res.json({
    products: [
      { id: 1, name: "Sample Product", price: 99.99 },
      { id: 2, name: "Test Item", price: 49.99 }
    ],
    message: "This is a test response"
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Sales Management API running on port ${port}`);
  console.log(`📱 Health Check: http://localhost:${port}/health`);
  console.log(`📊 API: http://localhost:${port}/api/products`);
});

module.exports = app;
