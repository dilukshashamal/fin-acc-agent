variable "location" {
  description = "The Azure Region to deploy resources into"
  type        = string
  default     = "eastus"
}

variable "prefix" {
  description = "A prefix used for all resource names to ensure uniqueness"
  type        = string
  default     = "finagent"
}

variable "environment" {
  description = "The environment name (e.g. dev, prod)"
  type        = string
  default     = "dev"
}

variable "pg_admin_password" {
  description = "PostgreSQL Admin Password"
  type        = string
  sensitive   = true
}

variable "django_secret_key" {
  description = "Django Secret Key"
  type        = string
  sensitive   = true
}

variable "azure_openai_endpoint" {
  description = "Azure OpenAI/Studio Endpoint"
  type        = string
}

variable "azure_openai_api_key" {
  description = "Azure OpenAI/Studio API Key"
  type        = string
  sensitive   = true
}
