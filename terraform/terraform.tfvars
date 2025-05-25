# terraform/terraform.tfvars.example
# Copy this file to terraform.tfvars and update the values

# AWS Configuration
aws_region     = "ap-southeast-1"
aws_account_id = "855018999946"  # Replace with your actual AWS Account ID

# Project Configuration
app_name        = "sales-management"
environment     = "production"
project_name    = "sales-management-production"

# ECR Configuration
ecr_repository_name      = "sales-management-app"
ecr_image_tag_mutability = "MUTABLE"
ecr_scan_on_push        = true

# VPC Configuration
vpc_cidr               = "10.0.0.0/16"
public_subnet_cidrs    = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs   = ["10.0.10.0/24", "10.0.11.0/24"]
availability_zones     = ["ap-southeast-1a", "ap-southeast-1b"]

# ECS Configuration
ecs_cluster_name = "sales-management-production-cluster"
task_cpu         = "512"
task_memory      = "1024"
desired_count    = 2
min_capacity     = 1
max_capacity     = 5
container_port   = 3000

# Database Configuration
db_instance_class          = "db.t3.micro"
db_engine_version         = "15.4"
db_allocated_storage      = 20
db_max_allocated_storage  = 100
db_name                   = "salesdb"
db_username               = "salesuser"
db_password               = "YourSecurePassword123!"  # Change this!
db_backup_retention_period = 7
db_backup_window          = "03:00-04:00"
db_maintenance_window     = "Sun:04:00-Sun:05:00"
db_deletion_protection    = false
db_skip_final_snapshot    = true

# Load Balancer Configuration
alb_name              = "sales-management-production-alb"
health_check_path     = "/health"
health_check_interval = 30
health_check_timeout  = 5
healthy_threshold     = 2
unhealthy_threshold   = 2

# Auto Scaling Configuration
scale_up_threshold   = 80
scale_down_threshold = 20
scale_up_cooldown    = 300
scale_down_cooldown  = 300

# Monitoring Configuration
cloudwatch_log_retention_days = 30

# Security Configuration
allowed_cidr_blocks = ["0.0.0.0/0"]
enable_ssl         = false
ssl_certificate_arn = ""

# Feature Flags
enable_database     = true
enable_auto_scaling = true
enable_monitoring   = true
enable_backup      = true

# Tags
common_tags = {
  Project     = "SalesManagement"
  Environment = "production"
  Owner       = "DevOps-Team"
  Terraform   = "true"
  CreatedBy   = "terraform"
}

additional_tags = {
  Application = "sales-management-api"
  Version     = "1.0.0"
}