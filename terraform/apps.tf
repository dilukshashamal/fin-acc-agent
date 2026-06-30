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

# 0. Redis (Internal Cache/Broker via Container Apps to avoid Azure Cache retirement/cost)
resource "azurerm_container_app" "redis" {
  name                         = "ca-redis"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.rg.name
  revision_mode                = "Single"

  template {
    container {
      name   = "redis"
      image  = "redis:7-alpine"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = false
    target_port      = 6379
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
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
      # Dummy image for initial terraform apply. CI/CD will push real image to ACR and update.
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
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
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  ingress {
    external_enabled = false
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
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.5
      memory = "1Gi"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://pgadmin:${var.pg_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/saas_db?sslmode=require"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${azurerm_container_app.redis.latest_revision_fqdn}:6379/0"
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
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.5
      memory = "1Gi"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://pgadmin:${var.pg_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/vector_db?sslmode=require"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${azurerm_container_app.redis.latest_revision_fqdn}:6379/0"
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
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.5
      memory = "1Gi"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://pgadmin:${var.pg_admin_password}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/vector_db?sslmode=require"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${azurerm_container_app.redis.latest_revision_fqdn}:6379/0"
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
