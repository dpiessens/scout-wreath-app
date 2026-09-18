# Azure setup

Everything lives in one resource group:

| Resource | What it is | Rough monthly cost |
|---|---|---|
| `scoutorders-web` | Static Web App, **Free** tier. Serves the app, runs the API (`api/`) and handles admin sign-in | $0 |
| `scoutorders<random>` | Storage account. The `orders` table holds every order (one partition per season) | Pennies |

[main.bicep](main.bicep) creates both and writes the API's settings (`TABLES_CONNECTION_STRING`,
`ORDERS_TABLE`, `ACCESS_CODE`). [deploy.yml](../.github/workflows/deploy.yml) runs it on every push
to `main`, then uploads `app/` and `api/`.

## One-time setup

Run these once, signed in as yourself (`az login`, `gh auth login`). They are the same steps as
FlowerApp's, pointed at this repo.

**1. Register the Static Web Apps provider** (Storage is already registered for FlowerApp):

```bash
az provider register --namespace Microsoft.Web --wait
```

**2. Create the resource group.** Central US matches FlowerApp:

```bash
az group create -n scout-orders -l centralus
```

**3. Let GitHub Actions deploy to it.** The simplest route is to reuse FlowerApp's deploy identity
(`cutlist-deploy`): give it a second federated credential for this repo and Contributor on the new
group.

```bash
appId=$(az ad app list --display-name cutlist-deploy --query "[0].appId" -o tsv)
az ad app federated-credential create --id $appId --parameters @infra/federated-credential.json
az role assignment create --assignee $appId --role Contributor \
  --scope $(az group show -n scout-orders --query id -o tsv)
```

In PowerShell, quote the file argument: `--parameters '@infra/federated-credential.json'`.

[federated-credential.json](federated-credential.json) already has this repo's subject, with the
immutable numeric ids your account uses:
`repo:dpiessens@64921/scout-wreath-app@1375889641:environment:production`.

**4. Create the `production` environment and fill it in:**

```bash
gh api -X PUT repos/dpiessens/scout-wreath-app/environments/production
gh variable set AZURE_CLIENT_ID       --env production --body "$appId"
gh variable set AZURE_TENANT_ID       --env production --body "$(az account show --query tenantId -o tsv)"
gh variable set AZURE_SUBSCRIPTION_ID --env production --body "$(az account show --query id -o tsv)"
gh variable set AZURE_RESOURCE_GROUP  --env production --body scout-orders
gh secret set ACCESS_CODE --env production     # prompts; this is the code Scouts type in
```

Pick an access code that's easy to type on a phone but not guessable, e.g. `pinecone-2026`. Case
and spaces don't matter. **The repo is public**, so the code lives only in this secret, never in a file.

**5. Deploy.** Push to `main`, or run the workflow by hand:

```bash
gh workflow run "Test and deploy"
```

The run summary prints the app URL (`https://<name>.azurestaticapps.net`).

**6. Make yourself an admin** so you can open the report at `/admin.html`. This creates an
invitation link; open it while signed in to GitHub as `dpiessens`:

```bash
az staticwebapp users invite -g scout-orders -n scoutorders-web \
  --authentication-provider GitHub --user-details dpiessens --roles admin \
  --domain $(az staticwebapp show -g scout-orders -n scoutorders-web --query defaultHostname -o tsv) \
  --invitation-expiration-in-hours 24
```

The Free tier allows up to 25 invited users, if another leader needs the report too.

## Changing the access code

Update the secret and redeploy. Scouts then type the new code into ⚙️ Settings; orders taken
in the meantime wait on their phones and upload once the code is right.

```bash
gh secret set ACCESS_CODE --env production
gh workflow run "Test and deploy"
```

## Looking at the data directly

The report page and its CSV export cover normal use. To see the raw rows, open the storage account
in the Azure portal → **Storage browser** → **Tables** → `orders`, or use Azure Storage Explorer.
Deleted orders are kept with `deleted = true` and hidden from the report.

**Backups:** Table Storage keeps three copies inside the data center but has no point-in-time
restore. Export the CSV from the admin page now and then, and always at the end of the sale.
