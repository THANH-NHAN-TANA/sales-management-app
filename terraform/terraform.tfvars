# AWS Configuration
aws_region = "ap-southeast-1"
environment = "production"
app_name = "sales-management"

# Container Configuration
image_uri = "855018999946.dkr.ecr.ap-southeast-1.amazonaws.com/sales-management-app:latest"
container_port = 3000
desired_count = 2
cpu = 512
memory = 1024

# Database Configuration
db_instance_class = "db.t3.micro"
db_allocated_storage = 20
db_max_allocated_storage = 100
backup_retention_period = 7

# Auto Scaling
min_capacity = 1
max_capacity = 10
autoscaling_cpu_target = 70
autoscaling_memory_target = 80

# Monitoring
enable_container_insights = true
log_retention_days = 7
enable_deletion_protection = false
