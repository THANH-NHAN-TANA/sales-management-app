const bcrypt = require("bcryptjs");

const newPassword = "123456";
bcrypt.hash(newPassword, 10, (err, hash) => {
  if (err) {
    console.error("Lỗi tạo hash:", err);
  } else {
    console.log("Hash mới:", hash);
  }
});
