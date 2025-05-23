#!/usr/bin/env bash
set -e

# 1. Tạo package.json và cài dependencies
cd src/app
npm init -y
npm install express cors body-parser pg dotenv helmet morgan compression express-rate-limit joi bcryptjs jsonwebtoken
npm install --save-dev jest nodemon eslint prettier supertest
cd ../../

# 2. Copy application code (cần có thư mục artifact/)
cp artifact/main.js      src/app/main.js
cp artifact/Dockerfile   docker/Dockerfile
cp artifact/Jenkinsfile  .
cp -r artifact/terraform/* terraform/

# 3. Tạo .env.example
cat > src/app/.env.example << 'E2O'
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=salesdb
DB_USER=salesuser
DB_PASSWORD=password123
E2O

# 4. Tạo .gitignore
cat > .gitignore << 'E2O'
node_modules/
npm-debug.log*
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
dist/
build/
*.log
.DS_Store
Thumbs.db
.vscode/settings.json
terraform/.terraform/
terraform/terraform.tfstate*
terraform/.terraform.lock.hcl
jenkins-credentials.txt
E2O

echo "Setup complete!"
