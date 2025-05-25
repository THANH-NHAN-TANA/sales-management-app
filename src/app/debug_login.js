const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

async function testPassword() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "salesapp",
    password: "SalesApp@123",
    database: "sales_management",
  });

  console.log("🔐 Testing password...");

  // Get user
  const [users] = await connection.execute(
    "SELECT * FROM users WHERE username = 'admin'"
  );

  if (users.length > 0) {
    const user = users[0];
    console.log("👤 User:", user.username);
    console.log("📧 Email:", user.email);
    console.log("🔐 Hash:", user.password.substring(0, 30) + "...");

    // Test password
    const isValid = await bcrypt.compare("123456", user.password);
    console.log('🧪 Password "123456":', isValid ? "✅ VALID" : "❌ INVALID");

    if (!isValid) {
      console.log("🔄 Fixing password...");
      const newHash = await bcrypt.hash("123456", 12);
      await connection.execute(
        "UPDATE users SET password = ? WHERE username = ?",
        [newHash, "admin"]
      );
      console.log("✅ Password updated!");
    }
  }

  await connection.end();
}

testPassword().catch(console.error);
