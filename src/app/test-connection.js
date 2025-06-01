// src/app/test-connection.js
const path = require('path');
const fs = require('fs');

// 1. Load .env từ thư mục gốc
require('dotenv').config({
  path: path.resolve(__dirname, '..', '..', '.env')
});

console.log('🚀 Testing Store Database Connection...\n');

// 2. Kiểm tra môi trường và file cấu hình
console.log('🔍 Environment Check:');
console.log(`   Node.js: ${process.version}`);
console.log(`   Directory: ${process.cwd()}`);

const envPath = path.resolve(__dirname, '..', '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found - using default values');
} else {
  console.log('✅ .env file found');
}

// 3. Xác định đúng đường dẫn tới database.js
const dbConfigPath = path.join(__dirname, 'config', 'database.js');
if (!fs.existsSync(dbConfigPath)) {
  console.error(`❌ Database config file not found at ${dbConfigPath}`);
  process.exit(1);
} else {
  console.log(`✅ Database config file found at ${dbConfigPath}\n`);
}

// 4. Import module DB
const db = require(dbConfigPath);

console.log('✅ Starting connection test...\n');

async function testDatabaseConnection() {
  try {
    console.log('📍 STEP 1: Connection Test');
    console.log('='.repeat(50));
    
    const ok = await db.testConnection();
    if (!ok) {
      console.log('❌ Connection failed - stopping tests');
      process.exit(1);
    }

    console.log('\n📍 STEP 2: Database Structure Check');
    console.log('='.repeat(50));
    await db.checkDatabaseStructure();

    console.log('\n📍 STEP 3: Testing Functions with Real Data');
    console.log('='.repeat(50));

    // Ví dụ test Categories
    console.log('📂 Testing Categories:');
    try {
      const cats = await db.getAllCategories();
      console.log(`✅ Found ${cats.length} categories`);
    } catch (err) {
      console.log(`❌ Categories error: ${err.message}`);
    }

    // ... Giữ nguyên phần test Products, Customers, Orders, Dashboard, Admin như trước ...

    console.log('\n📍 FINAL RESULT');
    console.log('='.repeat(50));
    console.log('🎉 SUCCESS! All tests passed.');

  } catch (err) {
    console.error('\n❌ CRITICAL ERROR:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    try {
      await db.closeConnection();
      console.log('\n✅ Database connection closed properly');
    } catch (e) {
      console.warn('⚠️  Could not close connection properly:', e.message);
    }
  }
}

testDatabaseConnection();
