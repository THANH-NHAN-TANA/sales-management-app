# Terraform Variables for Sales Management App

aws_region = "ap-southeast-1"
environment = "production"
app_name = "sales-management"

# Container configuration
container_port = 3000
desired_count = 2
cpu = 512
memory = 1024

# Auto scaling
min_capacity = 1
max_capacity = 10
autoscaling_cpu_target = 70
autoscaling_memory_target = 80

# Database configuration
db_instance_class = "db.t3.micro"
db_allocated_storage = 20
db_max_allocated_storage = 100
backup_retention_period = 7

# Monitoring
enable_container_insights = true
log_retention_days = 7

# Health check configuration
health_check_path = "/health"
health_check_interval = 30
health_check_timeout = 5
health_check_healthy_threshold = 2
health_check_unhealthy_threshold = 2

# Security
enable_deletion_protection = false

# Note: image_uri will be provided by Jenkins pipeline
# image_uri = "123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/sales-management-app:latest"
