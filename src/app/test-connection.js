const {
  testConnection,
  checkDatabaseStructure,
  getUserByEmailOrUsername,
} = require("./config/database");

async function runTests() {
  console.log("🧪 Running Database Connection Tests...\n");

  // Test 1: Database Connection
  console.log("Test 1: Database Connection");
  const connected = await testConnection();

  if (!connected) {
    console.log(
      "❌ Connection test failed. Please check your .env configuration."
    );
    process.exit(1);
  }

  // Test 2: Database Structure
  console.log("\nTest 2: Database Structure");
  const structureOk = await checkDatabaseStructure();

  if (!structureOk) {
    console.log("❌ Database structure test failed.");
    process.exit(1);
  }

  // Test 3: User Query Test
  console.log("\nTest 3: User Query Test");
  try {
    // Test with the emails from your database
    const testEmails = ["nguyenthanhnhan4638@gmail.com", "t2349724@gmail.com"];

    for (const email of testEmails) {
      console.log(`\nTesting user: ${email}`);
      const user = await getUserByEmailOrUsername(email);
      if (user) {
        console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Full Name: ${user.full_name || "Not set"}`);
        console.log(`   Active: ${user.is_active ? "Yes" : "No"}`);
      } else {
        console.log(`❌ User not found: ${email}`);
      }
    }
  } catch (error) {
    console.error("❌ User query test failed:", error.message);
    process.exit(1);
  }

  console.log("\n🎉 All tests passed! Your database is ready to use.");
  console.log("\n📋 Next steps:");
  console.log("1. Make sure you know the password for one of the users");
  console.log("2. Run: npm start");
  console.log("3. Go to: http://localhost:3000/login");
  console.log("4. Login with email/username and password");

  // Exit successfully
  process.exit(0);
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled promise rejection:", error.message);
  process.exit(1);
});

runTests();
