resource "azurerm_log_analytics_workspace" "law" {
  name                = "law-${var.prefix}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "env" {
  name                       = "cae-${var.prefix}-${var.environment}"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id
  infrastructure_subnet_id   = azurerm_subnet.aca_snet.id
}

# 1. API Gateway (Public Ingress)
resource "azurerm_container_app" "gateway" {
  name                         = "ca-gateway"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  template {
    container {
      name   = "api-gateway"
      image  = "${azurerm_container_registry.acr.login_server}/api-gateway:latest"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 80
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  # Depends on ACR so the image can be pulled (in a real CI/CD pipeline, this would be pushed first)
  # We will use dummy images or comment this block out if pushing via CI/CD later.
  # For now, it assumes the image exists.
}

# 2. Frontend (React/Vite)
resource "azurerm_container_app" "frontend" {
  name                         = "ca-frontend"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  template {
    container {
      name   = "frontend"
      image  = "${azurerm_container_registry.acr.login_server}/frontend:latest"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = false # Internal only, accessed via gateway
    target_port      = 80
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

# 3. Workspace Ops (Django)
resource "azurerm_container_app" "workspace_ops" {
  name                         = "ca-workspace-ops"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  template {
    container {
      name   = "workspace-ops"
      image  = "${azurerm_container_registry.acr.login_server}/workspace-ops:latest"
      cpu    = 0.5
      memory = "1Gi"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://pgadmin:${var.pg_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/saas_db?sslmode=require"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://:${azurerm_redis_cache.redis.primary_access_key}@${azurerm_redis_cache.redis.hostname}:${azurerm_redis_cache.redis.ssl_port}/0"
      }
      env {
        name  = "SECRET_KEY"
        value = var.django_secret_key
      }
      env {
        name  = "AZURE_ACCOUNT_NAME"
        value = azurerm_storage_account.storage.name
      }
      env {
        name  = "AZURE_ACCOUNT_KEY"
        value = azurerm_storage_account.storage.primary_access_key
      }
    }
  }

  ingress {
    external_enabled = false
    target_port      = 8000
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

# 4. AI Agent (FastAPI)
resource "azurerm_container_app" "ai_agent" {
  name                         = "ca-ai-agent"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  template {
    container {
      name   = "ai-agent"
      image  = "${azurerm_container_registry.acr.login_server}/ai-agent:latest"
      cpu    = 0.5
      memory = "1Gi"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://pgadmin:${var.pg_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/vector_db?sslmode=require"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://:${azurerm_redis_cache.redis.primary_access_key}@${azurerm_redis_cache.redis.hostname}:${azurerm_redis_cache.redis.ssl_port}/0"
      }
      env {
        name  = "AZURE_OPENAI_ENDPOINT"
        value = var.azure_openai_endpoint
      }
      env {
        name  = "AZURE_OPENAI_API_KEY"
        value = var.azure_openai_api_key
      }
    }
  }

  ingress {
    external_enabled = false
    target_port      = 8080
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

# 5. AI Worker (Celery)
resource "azurerm_container_app" "ai_worker" {
  name                         = "ca-ai-worker"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  template {
    container {
      name   = "ai-worker"
      image  = "${azurerm_container_registry.acr.login_server}/ai-worker:latest"
      cpu    = 0.5
      memory = "1Gi"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://pgadmin:${var.pg_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/vector_db?sslmode=require"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://:${azurerm_redis_cache.redis.primary_access_key}@${azurerm_redis_cache.redis.hostname}:${azurerm_redis_cache.redis.ssl_port}/0"
      }
      env {
        name  = "AZURE_OPENAI_ENDPOINT"
        value = var.azure_openai_endpoint
      }
      env {
        name  = "AZURE_OPENAI_API_KEY"
        value = var.azure_openai_api_key
      }
      env {
        name  = "AZURE_ACCOUNT_NAME"
        value = azurerm_storage_account.storage.name
      }
      env {
        name  = "AZURE_ACCOUNT_KEY"
        value = azurerm_storage_account.storage.primary_access_key
      }
    }
  }
}
