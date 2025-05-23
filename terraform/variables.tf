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
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_warning "Node.js is not installed. It's recommended for local development."
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
    cat > jenkins-policy.json << 'EOF'
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
