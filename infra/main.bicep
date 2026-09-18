metadata description = '''
Scout Orders: a Static Web App (Free) that serves the app and its API, and a storage account
whose Orders table holds every order.

  az deployment group create -g <rg> -f infra/main.bicep -p accessCode=<code>
'''

@description('Short name used as the prefix for every resource.')
@minLength(3)
@maxLength(12)
param name string = 'scoutorders'

@description('Static Web Apps is only offered in a few regions; this is where its API runs.')
@allowed(['centralus', 'eastus2', 'westus2', 'westeurope', 'eastasia'])
param swaLocation string = 'centralus'

@description('Region for the storage account. Defaults to the resource group\'s region.')
param location string = resourceGroup().location

@secure()
@minLength(4)
@description('The code Scouts type into Settings so their phones can upload orders.')
param accessCode string

var tags = { project: 'scout-orders', managedBy: 'bicep' }
var tableName = 'orders'

// ── Order storage ──────────────────────────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('${toLower(replace(name, '-', ''))}${uniqueString(resourceGroup().id)}', 24)
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    // Static Web Apps' managed functions cannot use a managed identity, so the API
    // reaches the table with the account key, held as an app setting.
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource ordersTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: tableName
}

// ── The app and its API ────────────────────────────────────────────────────
resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${name}-web'
  location: swaLocation
  tags: tags
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    // Deployed by GitHub Actions with the site's deployment token, not linked to the repo here.
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Disabled'
  }
}

resource siteSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: site
  name: 'appsettings'
  properties: {
    TABLES_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
    ORDERS_TABLE: tableName
    ACCESS_CODE: accessCode
  }
  dependsOn: [ordersTable]
}

output siteName string = site.name
output siteUrl string = 'https://${site.properties.defaultHostname}'
output storageAccountName string = storage.name
