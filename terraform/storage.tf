# Azure Storage Account (For Django Media / PDF Document Uploads)
resource "azurerm_storage_account" "storage" {
  name                     = "st${var.prefix}${var.environment}"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

# Blob Container for Media
resource "azurerm_storage_container" "media" {
  name                  = "media"
  storage_account_name  = azurerm_storage_account.storage.name
  container_access_type = "private"
}

# Azure Container Registry (For Docker Images)
resource "azurerm_container_registry" "acr" {
  name                = "acr${var.prefix}${var.environment}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = true
}
