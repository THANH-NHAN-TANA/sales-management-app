pipeline {
    agent any
    
    environment {
        AWS_REGION = 'us-west-2'
        AWS_ACCOUNT_ID = '855018999946'
        ECR_REPOSITORY = 'sales-app'
        DOCKER_REGISTRY = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        IMAGE_TAG = "${BUILD_NUMBER}"
        JOB_NAME = 'sales-app-pipeline'
        BUILD_URL = "http://52.77.220.98:8080/job/sales-app-pipeline/${BUILD_NUMBER}/"
    }
    
    stages {
        stage('Start') {
            steps {
                script {
                    echo "🚀 Starting Sales App CI/CD Pipeline - Build #${BUILD_NUMBER}"
                    echo "Repository: ${ECR_REPOSITORY}"
                    echo "Image Tag: ${IMAGE_TAG}"
                }
            }
        }
        
        stage('Checkout & Setup') {
            steps {
                script {
                    echo "📥 Checking out source code..."
                    // Code checkout happens automatically in declarative pipeline
                    
                    echo "🔧 Setting up environment..."
                    sh '''
                        echo "Node.js version:"
                        node --version || echo "Node.js not installed"
                        echo "Docker version:"
                        docker --version
                    '''
                }
            }
        }
        
        stage('Environment Check') {
            steps {
                script {
                    echo "🔍 Environment Variables Check:"
                    sh '''
                        echo "AWS_REGION: $AWS_REGION"
                        echo "AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID"
                        echo "ECR_REPOSITORY: $ECR_REPOSITORY"
                        echo "DOCKER_REGISTRY: $DOCKER_REGISTRY"
                        echo "IMAGE_TAG: $IMAGE_TAG"
                        echo "JOB_NAME: $JOB_NAME"
                        echo "BUILD_URL: $BUILD_URL"
                    '''
                }
            }
        }
        
        stage('Build Application') {
            steps {
                script {
                    echo "🔨 Building Sales App Application..."
                    sh '''
                        # Install dependencies if package.json exists
                        if [ -f "package.json" ]; then
                            echo "📦 Installing Node.js dependencies..."
                            npm install
                            
                            # Run tests if available
                            if [ -f "test/test.js" ]; then
                                echo "🧪 Running application tests..."
                                npm test
                            fi
                            
                            # Build application if build script exists
                            if npm run | grep -q "build"; then
                                echo "🏗️ Building application..."
                                npm run build
                            fi
                        fi
                        
                        # Copy admin login page to build directory
                        echo "📋 Copying admin login page..."
                        mkdir -p dist/admin
                        cp admin-login.html dist/admin/ || echo "admin-login.html not found, will create it"
                        
                        # Create admin login if not exists
                        if [ ! -f "dist/admin/admin-login.html" ]; then
                            echo "🔐 Creating admin login page..."
                            cat > dist/admin/admin-login.html << 'EOF'
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sales App Admin - Login</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 400px; margin: 100px auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo h1 { color: #4CAF50; margin: 0; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 5px; color: #333; }
        .form-group input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
        .btn { width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
        .btn:hover { background: #45a049; }
        .links { text-align: center; margin-top: 20px; }
        .links a { color: #4CAF50; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>Sales App Admin</h1>
            <p>CI/CD Pipeline Management</p>
        </div>
        <form id="loginForm">
            <div class="form-group">
                <label>Email Admin:</label>
                <input type="email" placeholder="admin@salesapp.com" required>
            </div>
            <div class="form-group">
                <label>Mật khẩu:</label>
                <input type="password" placeholder="Nhập mật khẩu" required>
            </div>
            <button type="submit" class="btn">Đăng nhập</button>
        </form>
        <div class="links">
            <a href="#" onclick="alert('Liên hệ DevOps team để khôi phục mật khẩu')">Quên mật khẩu?</a>
        </div>
        <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
            Build #${BUILD_NUMBER} | Jenkins Pipeline
        </div>
    </div>
    <script>
        document.getElementById('loginForm').addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Demo login page - Tích hợp với authentication system!');
        });
    </script>
</body>
</html>
EOF
        fi
                        
                        echo "✅ Application build completed"
                    '''
                }
            }
        }
        
        stage('AWS Connection Test') {
            steps {
                script {
                    echo "🔐 Testing AWS Connection..."
                    sh '''
                        # Test AWS CLI
                        aws --version
                        
                        # Test ECR access
                        aws ecr describe-repositories --region $AWS_REGION --repository-names $ECR_REPOSITORY || {
                            echo "❌ ECR repository not found, creating..."
                            aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION
                        }
                        
                        echo "✅ AWS connection successful"
                    '''
                }
            }
        }
        
        stage('Docker Build') {
            steps {
                script {
                    echo "🐳 Building Docker image with admin login..."
                    sh '''
                        # Create enhanced Dockerfile if not exists
                        if [ ! -f "Dockerfile" ]; then
                            echo "📝 Creating Dockerfile with nginx and admin login..."
                            cat > Dockerfile << 'EOF'
FROM nginx:alpine

# Copy application files
COPY dist/ /usr/share/nginx/html/

# Copy admin login page
COPY dist/admin/admin-login.html /usr/share/nginx/html/admin/
COPY dist/admin/admin-login.html /usr/share/nginx/html/login.html

# Create nginx config for admin routes
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name localhost;
    
    # Root location
    location / {
        root /usr/share/nginx/html;
        index index.html login.html;
        try_files $uri $uri/ /login.html;
    }
    
    # Admin login routes
    location /admin {
        root /usr/share/nginx/html;
        index admin-login.html;
        try_files $uri $uri/ /admin/admin-login.html;
    }
    
    location /login {
        root /usr/share/nginx/html;
        try_files /login.html =404;
    }
    
    # Health check
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
    
    # Pipeline status endpoint
    location /status {
        access_log off;
        return 200 "Sales App Pipeline - Build #${BUILD_NUMBER} - Running\\n";
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

# Set proper permissions
RUN chmod -R 755 /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
EOF
                        fi
                        
                        # Build Docker image
                        echo "🔨 Building Docker image: $DOCKER_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"
                        docker build -t $ECR_REPOSITORY:$IMAGE_TAG .
                        docker tag $ECR_REPOSITORY:$IMAGE_TAG $DOCKER_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
                        docker tag $ECR_REPOSITORY:$IMAGE_TAG $DOCKER_REGISTRY/$ECR_REPOSITORY:latest
                        
                        echo "✅ Docker build completed"
                        docker images | grep $ECR_REPOSITORY
                    '''
                }
            }
        }
        
        stage('Docker Test') {
            steps {
                script {
                    echo "🧪 Testing Docker container with admin login..."
                    sh '''
                        # Test container startup
                        echo "🔄 Starting test container..."
                        docker run -d --name sales-app-test -p 8081:80 $ECR_REPOSITORY:$IMAGE_TAG
                        
                        # Wait for container to be ready
                        sleep 10
                        
                        # Test endpoints
                        echo "🌐 Testing application endpoints..."
                        curl -f http://localhost:8081/health || exit 1
                        curl -f http://localhost:8081/status || exit 1
                        curl -f http://localhost:8081/login || exit 1
                        curl -f http://localhost:8081/admin/ || exit 1
                        
                        # Cleanup test container
                        docker stop sales-app-test
                        docker rm sales-app-test
                        
                        echo "✅ Docker container test passed"
                    '''
                }
            }
        }
        
        stage('Push to ECR') {
            steps {
                script {
                    echo "📤 Pushing to Amazon ECR..."
                    sh '''
                        # Login to ECR
                        aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $DOCKER_REGISTRY
                        
                        # Push images
                        echo "⬆️ Pushing image with tag: $IMAGE_TAG"
                        docker push $DOCKER_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
                        
                        echo "⬆️ Pushing latest tag"
                        docker push $DOCKER_REGISTRY/$ECR_REPOSITORY:latest
                        
                        echo "✅ Successfully pushed to ECR"
                        
                        # Display image info
                        aws ecr describe-images --repository-name $ECR_REPOSITORY --region $AWS_REGION --image-ids imageTag=$IMAGE_TAG
                    '''
                }
            }
        }
        
        stage('Deploy Application') {
            steps {
                script {
                    echo "🚀 Deploying Sales App with Admin Login..."
                    sh '''
                        # Stop existing container if running
                        docker stop sales-app-prod 2>/dev/null || true
                        docker rm sales-app-prod 2>/dev/null || true
                        
                        # Deploy new version
                        echo "🔄 Starting production container..."
                        docker run -d \
                            --name sales-app-prod \
                            --restart unless-stopped \
                            -p 3000:80 \
                            -e BUILD_NUMBER=$BUILD_NUMBER \
                            -e DEPLOY_TIME="$(date)" \
                            $DOCKER_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
                        
                        # Wait for deployment
                        sleep 15
                        
                        # Verify deployment
                        echo "🔍 Verifying deployment..."
                        curl -f http://localhost:3000/health || exit 1
                        curl -f http://localhost:3000/status || exit 1
                        curl -f http://localhost:3000/login || exit 1
                        curl -f http://localhost:3000/admin/ || exit 1
                        
                        echo "✅ Deployment successful!"
                        echo "🌐 Application URLs:"
                        echo "   - Main App: http://localhost:3000/"
                        echo "   - Admin Login: http://localhost:3000/login"
                        echo "   - Admin Panel: http://localhost:3000/admin/"
                        echo "   - Health Check: http://localhost:3000/health"
                        echo "   - Status: http://localhost:3000/status"
                    '''
                }
            }
        }
        
        stage('Environment Variables') {
            steps {
                script {
                    echo "📋 Final Environment Summary:"
                    sh '''
                        echo "=================================="
                        echo "🏗️ BUILD INFORMATION"
                        echo "=================================="
                        echo "Build Number: $BUILD_NUMBER"
                        echo "Job Name: $JOB_NAME"
                        echo "Build URL: $BUILD_URL"
                        echo "Build Time: $(date)"
                        echo ""
                        echo "=================================="
                        echo "🐳 DOCKER INFORMATION"
                        echo "=================================="
                        echo "Image Tag: $IMAGE_TAG"
                        echo "Docker Registry: $DOCKER_REGISTRY"
                        echo "ECR Repository: $ECR_REPOSITORY"
                        echo "Full Image Name: $DOCKER_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"
                        echo ""
                        echo "=================================="
                        echo "🌐 APPLICATION ENDPOINTS"
                        echo "=================================="
                        echo "Main Application: http://localhost:3000/"
                        echo "Admin Login: http://localhost:3000/login"
                        echo "Admin Panel: http://localhost:3000/admin/"
                        echo "Health Check: http://localhost:3000/health"
                        echo "Pipeline Status: http://localhost:3000/status"
                        echo ""
                        echo "=================================="
                        echo "🔐 ADMIN CREDENTIALS (Demo)"
                        echo "=================================="
                        echo "Email: admin@salesapp.com"
                        echo "Password: admin123!@#"
                        echo ""
                        echo "Alternative Admins:"
                        echo "- devops@salesapp.com / devops2025!"
                        echo "- jenkins@salesapp.com / jenkins123!"
                    '''
                }
            }
        }
        
        stage('End') {
            steps {
                script {
                    echo "🎉 Pipeline execution completed!"
                    echo "✅ Status: Pipeline finished successfully"
                    echo "🏗️ Build: #${BUILD_NUMBER}"
                    sh '''
                        echo "Duration: $(date)"
                        echo "All stages passed without errors"
                        echo ""
                        echo "🚀 Sales App with Admin Login is now running!"
                        echo "📱 Access your application at: http://localhost:3000/"
                        echo "🔐 Admin login at: http://localhost:3000/login"
                    '''
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "🧹 Cleaning up..."
                sh '''
                    # Clean up old images (keep last 5 builds)
                    docker images | grep $ECR_REPOSITORY | tail -n +6 | awk '{print $3}' | xargs -r docker rmi || true
                    
                    # Clean up dangling images
                    docker image prune -f || true
                '''
            }
        }
        
        success {
            script {
                echo "✅ 🎉 PIPELINE SUCCESS! 🎉"
                echo "Sales App deployed successfully with Admin Login functionality"
                echo "Build #${BUILD_NUMBER} completed at $(date)"
            }
        }
        
        failure {
            script {
                echo "❌ Pipeline failed at Build #${BUILD_NUMBER}"
                echo "Please check the logs above for error details"
            }
        }
    }
}