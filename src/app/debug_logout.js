// debug_logout.js - Test logout functionality
console.log("🔍 DEBUGGING LOGOUT FUNCTION");

// Test function to check if logout works
function testLogout() {
  console.log("🔄 Testing logout process...");

  // Check if we're on dashboard page
  if (window.location.pathname !== "/dashboard") {
    console.log("❌ Not on dashboard page");
    return;
  }

  // Check if logout function exists
  if (typeof logout === "function") {
    console.log("✅ Logout function exists");

    // Override confirm to auto-accept for testing
    const originalConfirm = window.confirm;
    window.confirm = () => true;

    // Call logout
    logout()
      .then(() => {
        console.log("✅ Logout completed");
      })
      .catch((error) => {
        console.error("❌ Logout error:", error);
      })
      .finally(() => {
        // Restore original confirm
        window.confirm = originalConfirm;
      });
  } else {
    console.log("❌ Logout function not found");
  }
}

// Check authentication state
function checkAuthState() {
  console.log("🔍 Current auth state:");
  console.log(
    "  authToken:",
    localStorage.getItem("authToken") ? "exists" : "null"
  );
  console.log("  currentUser:", window.currentUser || "null");
  console.log("  URL:", window.location.href);
}

// Run tests
checkAuthState();

// Export for console use
window.testLogout = testLogout;
window.checkAuthState = checkAuthState;

console.log("💡 Use testLogout() to test logout function");
console.log("💡 Use checkAuthState() to check current state");
