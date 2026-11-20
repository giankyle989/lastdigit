# Deploying to Cloud Run, Supabase and Cloudflare

Staging and production run on free plans:

```
Player ─▶ Cloudflare Worker ─▶ Cloud Run (asia-southeast1) ─▶ Supabase Postgres (Singapore)
                                   ▲
            Cloud Scheduler ───────┘ GET /api/cron/sync (through the Worker)
GitHub Actions: deploy on push to staging/production; nightly production backup to Cloudflare R2
```

- **Cloudflare Worker** (`deploy/cloudflare/`): forwards every request to Cloud Run with a shared
  secret, the visitor's real IP and the public host, and caches `/_next/static`. The app rejects
  requests without the secret (`src/middleware.ts`), so the `run.app` URL is useless on its own.
- **Cloud Run**: the Docker image (`Dockerfile`), 0–1 instances. Never more than one: the game
  sync must not run twice at once.
- **Supabase**: one free project per environment. The free plan has no backups, hence R2.
- Promotion: `develop` → PR into `staging` → PR into `production`. Each push to `staging` or
  `production` runs `.github/workflows/deploy.yml`.

Free-plan limits are set by the providers and change; check their pricing pages. Set a budget
alert (step 2) so any charge shows up at once.

## 1. Supabase (once per environment)

1. Create a project named `lastdigit-staging` (then `lastdigit-production`) in **Southeast Asia
   (Singapore)**. Save the database password.
2. Project → **Connect** → connection strings. You need two:
   - `DATABASE_URL`: the **transaction pooler** (port `6543`), with
     `?pgbouncer=true&connection_limit=5` appended. The app uses this.
   - `DIRECT_URL`: the **session pooler** (port `5432`). Migrations and backups use this. (The
     plain "direct connection" is IPv6-only on the free plan, which GitHub runners can't reach.)
3. A free project pauses after about a week without activity. Production stays awake because the
   sync calls it every few minutes; unpause staging from the dashboard if it sleeps.

## 2. Google Cloud (once)

Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and sign in
(`gcloud auth login`). Then, with your own project id:

```bash
PROJECT=lastdigit-app            # pick a globally unique id
REGION=asia-southeast1
REPO=giankyle989/lastdigit
gcloud projects create $PROJECT
gcloud config set project $PROJECT
```

1. Link a billing account (Console → Billing). The $300 trial lasts 90 days; **upgrade to a paid
   account before it ends**, or the services stop. The monthly free usage continues after the
   upgrade; you pay only above it.
2. Console → Billing → **Budgets & alerts**: create a $5 budget with email alerts.
3. Enable the services and create the image repository:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com cloudscheduler.googleapis.com
gcloud artifacts repositories create lastdigit --repository-format=docker --location=$REGION
# Keep only the 4 newest images, to stay inside the free 0.5 GB of storage.
cat > /tmp/cleanup.json <<'EOF'
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":4}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
EOF
gcloud artifacts repositories set-cleanup-policies lastdigit --location=$REGION \
  --policy=/tmp/cleanup.json --no-dry-run
```

4. Let GitHub Actions deploy without a stored key (Workload Identity Federation), limited to this
   repository:

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc lastdigit-repo --location=global \
  --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'"
gcloud iam service-accounts create github-deployer
SA=github-deployer@$PROJECT.iam.gserviceaccount.com
for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=$role
done
gcloud iam service-accounts add-iam-policy-binding $SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
echo "GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/lastdigit-repo"
echo "GCP_SERVICE_ACCOUNT=$SA"
```

## 3. GitHub environments

Repository → Settings → **Environments**: create `staging` and `production`. Under each, set
**Deployment branches** to the branch of the same name only. Then add:

| Kind     | Name                    | Value                                                                                |
| -------- | ----------------------- | ------------------------------------------------------------------------------------ |
| Variable | `GCP_PROJECT_ID`        | your project id                                                                      |
| Variable | `GCP_REGION`            | `asia-southeast1`                                                                    |
| Variable | `GCP_WIF_PROVIDER`      | printed in step 2                                                                    |
| Variable | `GCP_SERVICE_ACCOUNT`   | printed in step 2                                                                    |
| Variable | `CLOUD_RUN_SERVICE`     | `lastdigit-staging` / `lastdigit-production`                                         |
| Variable | `PUBLIC_URL`            | the Worker's address from step 5, e.g. `https://lastdigit-staging.<you>.workers.dev` |
| Variable | `SIGNUP_LIMIT_PER_HOUR` | optional, default 5                                                                  |
| Secret   | `DATABASE_URL`          | Supabase transaction pooler URL (step 1)                                             |
| Secret   | `DIRECT_URL`            | Supabase session pooler URL (step 1)                                                 |
| Secret   | `AUTH_SECRET`           | `openssl rand -base64 32`, different per environment                                 |
| Secret   | `CRON_SECRET`           | `openssl rand -hex 32`                                                               |
| Secret   | `ORIGIN_SECRET`         | `openssl rand -hex 32`; the same value goes into the Worker (step 5)                 |
| Secret   | `BALLDONTLIE_API_KEY`   | a separate key per environment, so staging can't use up production's limit           |

Production also needs the backup secrets from step 7.

The repository is public: never print these values in a workflow, and never commit them.

## 4. First deploy

1. Merge a PR from `develop` into `staging`. The deploy workflow runs the checks, builds the image,
   applies migrations and deploys. Its log ends with the service URL (`https://…run.app`).
2. Create the superadmin once, from your machine:

```bash
DATABASE_URL='<DIRECT_URL value>' ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong password>' npx prisma db seed
```

3. Opening the `run.app` URL directly must return **403 Forbidden**: only the Worker gets through.

## 5. Cloudflare Worker

1. Create a free Cloudflare account, then from `deploy/cloudflare/`:

```bash
npx wrangler@4 login
```

2. In `wrangler.toml`, replace the `ORIGIN_URL` placeholder for the environment with the Cloud Run
   URL from step 4.
3. Store the same `ORIGIN_SECRET` as in GitHub, then deploy:

```bash
npx wrangler@4 secret put ORIGIN_SECRET --env staging
npx wrangler@4 deploy --env staging
```

4. Set the GitHub variable `PUBLIC_URL` to the Worker's address, and re-run the deploy workflow so
   Auth.js uses it.
5. With your own domain on Cloudflare, uncomment the `routes` line for the environment, deploy
   again and update `PUBLIC_URL`.

Repeat steps 4–5 with `production` when staging works.

## 6. Game sync (Cloud Scheduler)

Cloud Run stops the app when idle, so the in-app timer is not used there (`SYNC_INTERVAL_MINUTES`
is left unset). Call the sync route through the Worker instead:

```bash
gcloud scheduler jobs create http lastdigit-sync-staging --location=$REGION \
  --schedule='*/15 * * * *' --time-zone='Asia/Manila' --http-method=GET \
  --uri='<staging PUBLIC_URL>/api/cron/sync' \
  --headers='Authorization=Bearer <staging CRON_SECRET>'
gcloud scheduler jobs create http lastdigit-sync-production --location=$REGION \
  --schedule='*/5 * * * *' --time-zone='Asia/Manila' --http-method=GET \
  --uri='<production PUBLIC_URL>/api/cron/sync' \
  --headers='Authorization=Bearer <production CRON_SECRET>'
```

The free plan includes a few jobs per billing account; check the Cloud Scheduler pricing page.
To use less of Cloud Run's free time, sync less often outside game hours (a second job with a
slower schedule).

## 7. Backups (production)

1. Cloudflare → R2: create a bucket `lastdigit-backups`. Add a lifecycle rule that deletes objects
   after 30 days.
2. R2 → **Manage API tokens**: create a token with Object Read & Write on that bucket only.
3. In the GitHub `production` environment add the variables `R2_ACCOUNT_ID` and `R2_BUCKET`, and
   the secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `BACKUP_PASSPHRASE`
   (`openssl rand -base64 32`). **Store the passphrase somewhere safe outside GitHub too**: without
   it the backups can't be opened.
4. Actions → **backup** → Run workflow, and check that a file appears in the bucket. After that it
   runs nightly at 02:00 Philippine time.

To restore (use the Postgres 17 tools, matching `pg_dump` in the workflow):

```bash
gpg --decrypt lastdigit-<date>.dump.gpg > lastdigit.dump
docker run --rm -i postgres:17 pg_restore --no-owner --clean --if-exists -d '<DIRECT_URL>' < lastdigit.dump
```

Restore into a new, empty Supabase project first if you are not sure, then point the app at it.
