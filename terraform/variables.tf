# terraform/variables.tf

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "ap-southeast-1"
  
  validation {
    condition = can(regex("^[a-z]{2}-[a-z]+-[0-9]{1}$", var.aws_region))
    error_message = "AWS region must be in valid format (e.g., ap-southeast-1)."
  }
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "production"
  
  validation {
    condition = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "app_name" {
  description = "Application name used for resource naming"
  type        = string
  default     = "sales-management"
  
  validation {
    condition = can(regex("^[a-z][a-z0-9-]*[a-z0-9]$", var.app_name))
    error_message = "App name must start with letter, contain only lowercase letters, numbers, and hyphens."
  }
}

variable "app_version" {
  description = "Application version tag"
  type        = string
  default     = "latest"
}

variable "image_uri" {
  description = "Docker image URI from ECR"
  type        = string
}

variable "container_port" {
  description = "Port that the container listens on"
  type        = number
  default     = 3000
  
  validation {
    condition = var.container_port > 0 && var.container_port < 65536
    error_message = "Container port must be between 1 and 65535."
  }
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
  
  validation {
    condition = var.desired_count >= 1 && var.desired_count <= 100
    error_message = "Desired count must be between 1 and 100."
  }
}

variable "cpu" {
  description = "CPU units for the ECS task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
  
  validation {
    condition = contains([256, 512, 1024, 2048, 4096], var.cpu)
    error_message = "CPU must be one of: 256, 512, 1024, 2048, 4096."
  }
}

variable "memory" {
  description = "Memory (MB) for the ECS task"
  type        = number
  default     = 1024
  
  validation {
    condition = var.memory >= 512 && var.memory <= 30720
    error_message = "Memory must be between 512 MB and 30720 MB."
  }
}

variable "min_capacity" {
  description = "Minimum number of ECS tasks for auto scaling"
  type        = number
  default     = 1
  
  validation {
    condition = var.min_capacity >= 1
    error_message = "Minimum capacity must be at least 1."
  }
}

variable "max_capacity" {
  description = "Maximum number of ECS tasks for auto scaling"
  type        = number
  default     = 10
  
  validation {
    condition = var.max_capacity >= var.min_capacity
    error_message = "Maximum capacity must be greater than or equal to minimum capacity."
  }
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Initial storage allocation for RDS (GB)"
  type        = number
  default     = 20
  
  validation {
    condition = var.db_allocated_storage >= 20 && var.db_allocated_storage <= 65536
    error_message = "DB allocated storage must be between 20 GB and 65536 GB."
  }
}

variable "db_max_allocated_storage" {
  description = "Maximum storage allocation for RDS auto scaling (GB)"
  type        = number
  default     = 100
  
  validation {
    condition = var.db_max_allocated_storage >= var.db_allocated_storage
    error_message = "Maximum allocated storage must be greater than or equal to allocated storage."
  }
}

variable "backup_retention_period" {
  description = "Number of days to retain database backups"
  type        = number
  default     = 7
  
  validation {
    condition = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 0 and 35 days."
  }
}

variable "enable_container_insights" {
  description = "Enable CloudWatch Container Insights for ECS cluster"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 7
  
  validation {
    condition = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be one of the allowed CloudWatch values."
  }
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for critical resources"
  type        = bool
  default     = false
}

variable "autoscaling_cpu_target" {
  description = "Target CPU utilization percentage for auto scaling"
  type        = number
  default     = 70
  
  validation {
    condition = var.autoscaling_cpu_target >= 10 && var.autoscaling_cpu_target <= 90
    error_message = "CPU target must be between 10 and 90 percent."
  }
}

variable "autoscaling_memory_target" {
  description = "Target memory utilization percentage for auto scaling"
  type        = number
  default     = 80
  
  validation {
    condition = var.autoscaling_memory_target >= 10 && var.autoscaling_memory_target <= 90
    error_message = "Memory target must be between 10 and 90 percent."
  }
}
