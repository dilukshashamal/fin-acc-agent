# PostgreSQL Flexible Server (Burstable B1ms for Cost Optimization)
resource "azurerm_postgresql_flexible_server" "postgres" {
  name                   = "psql-${var.prefix}-${var.environment}"
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  version                = "16" # Latest stable for pgvector
  delegated_subnet_id    = azurerm_subnet.pg_snet.id
  private_dns_zone_id    = azurerm_private_dns_zone.pg_dns.id
  administrator_login    = "pgadmin"
  administrator_password = var.pg_admin_password
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
  backup_retention_days  = 7

  depends_on = [azurerm_private_dns_zone_virtual_network_link.pg_dns_link]
}

# Enable pgvector extension
resource "azurerm_postgresql_flexible_server_configuration" "pgvector" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.postgres.id
  value     = "VECTOR"
}

# saas_db
resource "azurerm_postgresql_flexible_server_database" "saas_db" {
  name      = "saas_db"
  server_id = azurerm_postgresql_flexible_server.postgres.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# vector_db
resource "azurerm_postgresql_flexible_server_database" "vector_db" {
  name      = "vector_db"
  server_id = azurerm_postgresql_flexible_server.postgres.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Azure Cache for Redis (Basic C0 for cost optimization)
resource "azurerm_redis_cache" "redis" {
  name                = "redis-${var.prefix}-${var.environment}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  enable_non_ssl_port = true
}
