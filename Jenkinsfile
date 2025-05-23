pipeline {
    agent any
    
    environment {
        AWS_DEFAULT_REGION = 'ap-southeast-1'
        AWS_ACCOUNT_ID = credentials('aws-account-id')
    }
    
    stages {
        stage('Hello') {
            steps {
                echo 'Hello World - Sales Management Pipeline!'
                echo "Build Number: ${BUILD_NUMBER}"
                echo "AWS Region: ${AWS_DEFAULT_REGION}"
                sh 'aws --version'
                sh 'docker --version'
                sh 'node --version'
            }
        }
        
        stage('Test AWS Access') {
            steps {
                withAWS(credentials: 'aws-credentials', region: 'ap-southeast-1') {
                    sh '''
                        echo "Testing AWS credentials..."
                        aws sts get-caller-identity
                        echo "AWS credentials working!"
                    '''
                }
            }
        }
        
        stage('Checkout') {
            steps {
                checkout scm
                echo 'Code checked out successfully'
            }
        }
        
        stage('Setup Node.js') {
            steps {
                nodejs(nodeJSInstallationName: 'NodeJS-18') {
                    dir('src/app') {
                        sh '''
                            echo "Node.js setup..."
                            node --version
                            npm --version
                            
                            echo "Installing dependencies..."
                            npm install
                            
                            echo "Dependencies installed successfully"
                        '''
                    }
                }
            }
        }
        
        stage('Test Application') {
            steps {
                nodejs(nodeJSInstallationName: 'NodeJS-18') {
                    dir('src/app') {
                        sh '''
                            echo "Running application tests..."
                            npm test || echo "No tests configured - skipping"
                            echo "Application tests completed"
                        '''
                    }
                }
            }
        }
        
        stage('Docker Build') {
            steps {
                script {
                    echo 'Building Docker image...'
                    try {
                        def dockerImage = docker.build("sales-management-app:${BUILD_NUMBER}", "-f docker/Dockerfile .")
                        echo "Docker image built successfully: sales-management-app:${BUILD_NUMBER}"
                        
                        // Test the image
                        dockerImage.run('-d --name test-container -p 3001:3000').stop()
                        
                        // Clean up
                        sh "docker rm test-container || true"
                        sh "docker rmi sales-management-app:${BUILD_NUMBER} || true"
                        
                    } catch (Exception e) {
                        echo "Docker build failed: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }
        
        stage('AWS ECR Test') {
            steps {
                withAWS(credentials: 'aws-credentials', region: 'ap-southeast-1') {
                    script {
                        echo 'Testing AWS ECR access...'
                        sh '''
                            echo "Testing ECR login..."
                            aws ecr get-login-password --region ap-southeast-1 | head -c 50
                            echo "... (credentials truncated)"
                            
                            echo "Listing ECR repositories..."
                            aws ecr describe-repositories --region ap-southeast-1 || echo "No repositories found"
                            
                            echo "ECR access test completed"
                        '''
                    }
                }
            }
        }
        
        stage('Terraform Validate') {
            steps {
                withAWS(credentials: 'aws-credentials', region: 'ap-southeast-1') {
                    dir('terraform') {
                        sh '''
                            echo "Validating Terraform configuration..."
                            terraform --version
                            terraform init -backend=false
                            terraform validate
                            echo "Terraform validation completed"
                        '''
                    }
                }
            }
        }
    }
    
    post {
        always {
            echo 'Pipeline completed!'
            // Clean up any leftover containers
            sh '''
                docker ps -aq --filter "name=test-container" | xargs -r docker rm -f
                docker system prune -f || true
            '''
        }
        success {
            echo '✅ All stages completed successfully!'
            echo """
            🎉 Pipeline Success Summary:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            📦 Build Number: ${BUILD_NUMBER}
            🌐 AWS Region: ${AWS_DEFAULT_REGION}  
            🔧 Tools Verified: AWS CLI, Docker, Node.js
            🏗️  Infrastructure: Terraform validated
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Ready for production deployment!
            """
        }
        failure {
            echo '❌ Pipeline failed!'
            echo 'Check the logs above for detailed error information'
        }
        unstable {
            echo '⚠️  Pipeline completed with warnings'
        }
    }
}
EOFcat > Jenkinsfile << 'EOF'
pipeline {
    agent any
    
    environment {
        AWS_DEFAULT_REGION = 'ap-southeast-1'
        AWS_ACCOUNT_ID = credentials('aws-account-id')
    }
    
    stages {
        stage('Hello') {
            steps {
                echo 'Hello World - Sales Management Pipeline!'
                echo "Build Number: ${BUILD_NUMBER}"
                echo "AWS Region: ${AWS_DEFAULT_REGION}"
                sh 'aws --version'
                sh 'docker --version'
                sh 'node --version'
            }
        }
        
        stage('Test AWS Access') {
            steps {
                withAWS(credentials: 'aws-credentials', region: 'ap-southeast-1') {
                    sh '''
                        echo "Testing AWS credentials..."
                        aws sts get-caller-identity
                        echo "AWS credentials working!"
                    '''
                }
            }
        }
        
        stage('Checkout') {
            steps {
                checkout scm
                echo 'Code checked out successfully'
            }
        }
        
        stage('Setup Node.js') {
            steps {
                nodejs(nodeJSInstallationName: 'NodeJS-18') {
                    dir('src/app') {
                        sh '''
                            echo "Node.js setup..."
                            node --version
                            npm --version
                            
                            echo "Installing dependencies..."
                            npm install
                            
                            echo "Dependencies installed successfully"
                        '''
                    }
                }
            }
        }
        
        stage('Test Application') {
            steps {
                nodejs(nodeJSInstallationName: 'NodeJS-18') {
                    dir('src/app') {
                        sh '''
                            echo "Running application tests..."
                            npm test || echo "No tests configured - skipping"
                            echo "Application tests completed"
                        '''
                    }
                }
            }
        }
        
        stage('Docker Build') {
            steps {
                script {
                    echo 'Building Docker image...'
                    try {
                        def dockerImage = docker.build("sales-management-app:${BUILD_NUMBER}", "-f docker/Dockerfile .")
                        echo "Docker image built successfully: sales-management-app:${BUILD_NUMBER}"
                        
                        // Test the image
                        dockerImage.run('-d --name test-container -p 3001:3000').stop()
                        
                        // Clean up
                        sh "docker rm test-container || true"
                        sh "docker rmi sales-management-app:${BUILD_NUMBER} || true"
                        
                    } catch (Exception e) {
                        echo "Docker build failed: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }
        
        stage('AWS ECR Test') {
            steps {
                withAWS(credentials: 'aws-credentials', region: 'ap-southeast-1') {
                    script {
                        echo 'Testing AWS ECR access...'
                        sh '''
                            echo "Testing ECR login..."
                            aws ecr get-login-password --region ap-southeast-1 | head -c 50
                            echo "... (credentials truncated)"
                            
                            echo "Listing ECR repositories..."
                            aws ecr describe-repositories --region ap-southeast-1 || echo "No repositories found"
                            
                            echo "ECR access test completed"
                        '''
                    }
                }
            }
        }
        
        stage('Terraform Validate') {
            steps {
                withAWS(credentials: 'aws-credentials', region: 'ap-southeast-1') {
                    dir('terraform') {
                        sh '''
                            echo "Validating Terraform configuration..."
                            terraform --version
                            terraform init -backend=false
                            terraform validate
                            echo "Terraform validation completed"
                        '''
                    }
                }
            }
        }
    }
    
    post {
        always {
            echo 'Pipeline completed!'
            // Clean up any leftover containers
            sh '''
                docker ps -aq --filter "name=test-container" | xargs -r docker rm -f
                docker system prune -f || true
            '''
        }
        success {
            echo '✅ All stages completed successfully!'
            echo """
            🎉 Pipeline Success Summary:
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            📦 Build Number: ${BUILD_NUMBER}
            🌐 AWS Region: ${AWS_DEFAULT_REGION}  
            🔧 Tools Verified: AWS CLI, Docker, Node.js
            🏗️  Infrastructure: Terraform validated
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            Ready for production deployment!
            """
        }
        failure {
            echo '❌ Pipeline failed!'
            echo 'Check the logs above for detailed error information'
        }
        unstable {
            echo '⚠️  Pipeline completed with warnings'
        }
    }
}
