#!/bin/bash

# Sales Management App - Automated Setup Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
APP_NAME="${APP_NAME:-sales-management}"
ENVIRONMENT="${ENVIRONMENT:-production}"
TERRAFORM_STATE_BUCKET="${APP_NAME}-terraform-state-${RANDOM}"
ECR_REPOSITORY="${APP_NAME}-app"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install it first."
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    
    log_success "All prerequisites are met!"
}

check_aws_account() {
    log_info "Checking AWS account information..."
    
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER=$(aws sts get-caller-identity --query Arn --output text)
    
    log_info "AWS Account ID: $AWS_ACCOUNT_ID"
    log_info "AWS User/Role: $AWS_USER"
    log_info "AWS Region: $AWS_REGION"
    
    read -p "Is this correct? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Please configure the correct AWS credentials and region."
        exit 1
    fi
}

create_iam_user() {
    log_info "Creating IAM user for Jenkins..."
    
    # Check if user already exists
    if aws iam get-user --user-name jenkins-ci-user &> /dev/null; then
        log_warning "IAM user 'jenkins-ci-user' already exists. Skipping creation."
        return
    fi
    
    # Create IAM user
    aws iam create-user --user-name jenkins-ci-user
    
    # Create and attach policy
    cat > jenkins-policy.json << 'POLICY_EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecr:*",
                "ecs:*",
                "elbv2:*",
                "ec2:*",
                "rds:*",
                "iam:PassRole",
                "iam:GetRole",
                "logs:*",
                "application-autoscaling:*",
                "s3:*",
                "dynamodb:*",
                "cloudwatch:*"
            ],
            "Resource": "*"
        }
    ]
}
POLICY_EOF
    
    POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/JenkinsECRPolicy"
    
    # Create policy if it doesn't exist
    if ! aws iam get-policy --policy-arn "$POLICY_ARN" &> /dev/null; then
        aws iam create-policy --policy-name JenkinsECRPolicy --policy-document file://jenkins-policy.json
    fi
    
    # Attach policy to user
    aws iam attach-user-policy --user-name jenkins-ci-user --policy-arn "$POLICY_ARN"
    
    # Create access key
    ACCESS_KEY_OUTPUT=$(aws iam create-access-key --user-name jenkins-ci-user --output json)
    ACCESS_KEY_ID=$(echo "$ACCESS_KEY_OUTPUT" | jq -r '.AccessKey.AccessKeyId')
    SECRET_ACCESS_KEY=$(echo "$ACCESS_KEY_OUTPUT" | jq -r '.AccessKey.SecretAccessKey')
    
    log_success "IAM user created successfully!"
    log_info "Access Key ID: $ACCESS_KEY_ID"
    log_warning "Secret Access Key: $SECRET_ACCESS_KEY"
    log_warning "Please save these credentials securely for Jenkins configuration!"
    
    # Save to file
    cat > jenkins-credentials.txt << CRED_EOF
AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY
AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID
AWS_REGION=$AWS_REGION
CRED_EOF
    
    log_info "Credentials saved to jenkins-credentials.txt"
    
    # Clean up policy file
    rm -f jenkins-policy.json
}

create_s3_terraform_backend() {
    log_info "Creating S3 bucket for Terraform state..."
    
    # Check if bucket exists
    if aws s3 ls "s3://$TERRAFORM_STATE_BUCKET" &> /dev/null; then
        log_warning "S3 bucket '$TERRAFORM_STATE_BUCKET' already exists. Skipping creation."
    else
        # Create S3 bucket
        if [ "$AWS_REGION" = "us-east-1" ]; then
            aws s3 mb "s3://$TERRAFORM_STATE_BUCKET"
        else
            aws s3 mb "s3://$TERRAFORM_STATE_BUCKET" --region "$AWS_REGION"
        fi
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "$TERRAFORM_STATE_BUCKET" \
            --versioning-configuration Status=Enabled
        
        log_success "S3 bucket created: $TERRAFORM_STATE_BUCKET"
    fi
    
    # Create DynamoDB table for state locking
    log_info "Creating DynamoDB table for Terraform state locking..."
    
    if aws dynamodb describe-table --table-name terraform-state-lock --region "$AWS_REGION" &> /dev/null; then
        log_warning "DynamoDB table 'terraform-state-lock' already exists. Skipping creation."
    else
        aws dynamodb create-table \
            --table-name terraform-state-lock \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
            --region "$AWS_REGION"
        
        log_success "DynamoDB table created: terraform-state-lock"
    fi
}

create_ecr_repository() {
    log_info "Creating ECR repository..."
    
    if aws ecr describe-repositories --repository-names "$ECR_REPOSITORY" --region "$AWS_REGION" &> /dev/null; then
        log_warning "ECR repository '$ECR_REPOSITORY' already exists. Skipping creation."
    else
        aws ecr create-repository --repository-name "$ECR_REPOSITORY" --region "$AWS_REGION"
        log_success "ECR repository created: $ECR_REPOSITORY"
    fi
    
    # Get ECR URI
    ECR_URI=$(aws ecr describe-repositories --repository-names "$ECR_REPOSITORY" --region "$AWS_REGION" --query 'repositories[0].repositoryUri' --output text)
    log_info "ECR Repository URI: $ECR_URI"
}

update_terraform_backend() {
    log_info "Updating Terraform backend configuration..."
    
    # Update main.tf with correct S3 bucket name
    if [ -f "terraform/main.tf" ]; then
        sed -i.bak "s/sales-management-terraform-state/$TERRAFORM_STATE_BUCKET/g" terraform/main.tf
        rm -f terraform/main.tf.bak
        log_success "Terraform backend updated with bucket: $TERRAFORM_STATE_BUCKET"
    else
        log_error "terraform/main.tf not found. Please ensure the Terraform files are in place."
    fi
}

print_summary() {
    log_success "Setup completed successfully!"
    echo
    echo "=================================================="
    echo "           DEPLOYMENT SUMMARY"
    echo "=================================================="
    echo "AWS Account ID: $AWS_ACCOUNT_ID"
    echo "AWS Region: $AWS_REGION"
    echo "App Name: $APP_NAME"
    echo "Environment: $ENVIRONMENT"
    echo
    echo "Created Resources:"
    echo "- IAM User: jenkins-ci-user"
    echo "- S3 Bucket: $TERRAFORM_STATE_BUCKET"
    echo "- DynamoDB Table: terraform-state-lock"
    echo "- ECR Repository: $ECR_REPOSITORY"
    echo
    echo "ECR Repository URI: $ECR_URI"
    echo
    echo "Next Steps:"
    echo "1. Review jenkins-credentials.txt for AWS credentials"
    echo "2. Setup Jenkins server"
    echo "3. Configure Jenkins with AWS credentials"
    echo "4. Add Git remote repository"
    echo "5. Push code to repository"
    echo "6. Create and run Jenkins pipeline"
    echo
    echo "Happy deploying! 🚀"
}

# Main execution
main() {
    echo "==============================================="
    echo "    Sales Management App - Setup Script"
    echo "==============================================="
    echo
    
    check_prerequisites
    check_aws_account
    create_iam_user
    create_s3_terraform_backend
    create_ecr_repository
    update_terraform_backend
    print_summary
}

# Run main function
main "$@"
