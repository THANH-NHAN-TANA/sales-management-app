#!/usr/bin/env node

// Test Connection Script
// Chạy: node test-connection.js

async function testDatabaseConnection() {
  try {
    console.log('🧪 TESTING DATABASE CONNECTION WITH SALESAPP USER');
    console.log('='.repeat(55));
    console.log('');

    // Test import config
    console.log('📁 Testing config import...');
    const { testConnection, checkDatabaseStructure } = require('./config/database');
    console.log('✅ Config imported successfully');
    console.log('');

    // Test connection
    console.log('🔗 Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.log('❌ Connection failed - cannot proceed');
      process.exit(1);
    }

    console.log('');

    // Test database structure
    console.log('🏗️  Testing database structure...');
    const structure = await checkDatabaseStructure();
    
    console.log('');

    if (connected && structure) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ Database connection working');
      console.log('✅ Database structure verified');
      console.log('✅ Ready to run: npm start');
    } else if (connected) {
      console.log('⚠️  CONNECTION OK but some tables missing');
      console.log('💡 App can still run but may have limited functionality');
      console.log('✅ You can try: npm start');
    } else {
      console.log('❌ Connection failed - check your configuration');
    }

    console.log('');
    console.log('🔑 AFTER npm start, login with:');
    console.log('   Username: admin');
    console.log('   Password: 123456');
    console.log('   URL: http://localhost:3000/login');

  } catch (error) {
    console.log('');
    console.log('❌ TEST FAILED:', error.message);
    
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('');
      console.log('🔧 SOLUTION:');
      console.log('1. Create config directory: mkdir config');
      console.log('2. Create config/database.js file');
      console.log('3. Make sure .env file exists');
    } else {
      console.log('');
      console.log('🔧 Check your:');
      console.log('- .env file configuration');
      console.log('- MySQL server is running');
      console.log('- User salesapp exists and has permissions');
    }
    
    process.exit(1);
  }
}

// Run test
testDatabaseConnection();
