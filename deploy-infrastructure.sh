#!/bin/bash
set -e

echo "🚀 Deploying Sales Management Infrastructure..."

# Variables
REGION="ap-southeast-1"
BUCKET_NAME="sales-management-terraform-state-22000"
APP_NAME="sales-management-app"

# Get ECR URI
ECR_URI=$(aws ecr describe-repositories --repository-names $APP_NAME --region $REGION --query 'repositories[0].repositoryUri' --output text)

# Build and push Docker image
echo "🐳 Building Docker image..."
docker build -f docker/Dockerfile -t $APP_NAME:latest .

echo "📤 Pushing to ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_URI
docker tag $APP_NAME:latest $ECR_URI:latest
docker push $ECR_URI:latest

# Deploy with Terraform
echo "🏗️ Deploying infrastructure..."
cd terraform
terraform apply -var="image_uri=$ECR_URI:latest" -auto-approve

# Get application URL
LB_DNS=$(aws elbv2 describe-load-balancers --names sales-management-production-alb --query 'LoadBalancers[0].DNSName' --output text --region $REGION)

echo "✅ Deployment completed!"
echo "🌐 Application URL: http://$LB_DNS"
echo "🏥 Health Check: http://$LB_DNS/health"
