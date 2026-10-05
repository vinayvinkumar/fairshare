# FairShare

FairShare is a private, React-based group expense ledger hosted by Streamlit.
It is inspired by the core workflow of shared-expense products, is an original
application, and is not affiliated with Splitwise, Inc.

## What it includes

- Reusable people and separate groups for trips, homes, meals, and events.
- Equal, exact-amount, percentage, and weighted-share expense splits.
- Per-person balances and a deterministic debt-simplification plan.
- One-click suggested settlements plus custom payment records.
- Categories, spending chart, chronological activity, CSV export, and JSON
  backup.
- Soft deletion with a Trash view so an accidental deletion can be restored.
- Local SQLite storage and durable PostgreSQL storage for Streamlit Community
  Cloud.
- Optional passcode protection configured only through Streamlit secrets.
- A responsive React interface designed for desktop and mobile.

Receipt scanning, bank imports, currency conversion, recurring expenses, and
real payment processing are intentionally outside this first version.

## Architecture

- `frontend/src/` contains the React interface and client-side presentation
  helpers.
- `app.py` is a thin Streamlit host and validated action adapter.
- `fairshare/domain.py` and `fairshare/storage.py` remain the authoritative
  ledger and persistence layers.
- Streamlit Components v2 mounts the React app directly into the Streamlit
  page; there is no separate frontend server in production.
- `frontend/dist/` is committed intentionally. Streamlit Community Cloud only
  needs Python at deploy time and serves this prebuilt bundle from `app.py`.

After changing `frontend/src/`, rebuild and commit the generated assets:

```sh
npm --workspace @vinay/fairshare run build:ui
```

## Run locally

Use Python 3.12 or newer.

```sh
cd apps/fairshare
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
streamlit run app.py --server.port 5181
```

From the Cockpit root, `npm --workspace @vinay/fairshare run dev` uses the
workspace `.venv` automatically when it is present and rebuilds the React
bundle before starting Streamlit.

The app creates `data/fairshare.db` in local mode. This file is ignored and
must never be committed.

## Configure secrets

Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml` for local
development and replace every placeholder. Do not commit that file.

```toml
APP_PASSWORD = "a-long-private-passphrase"
OWNER_NAME = "Owner"
DEFAULT_CURRENCY = "INR"
DATABASE_URL = "postgresql://user:password@host/database?sslmode=require"
```

`DATABASE_URL` may point to a managed PostgreSQL provider such as Neon or
Supabase. FairShare creates its tables automatically. Without `DATABASE_URL`,
it falls back to local SQLite. Streamlit Community Cloud's app filesystem is
not a durable database, so PostgreSQL is strongly recommended for deployment.

## Deploy on Streamlit Community Cloud

The cleanest setup is to make the contents of this folder the root of a
dedicated GitHub repository.

1. Create a private GitHub repository and push this folder's contents.
2. Create a PostgreSQL database and copy its SSL-enabled connection URL.
3. Open [share.streamlit.io](https://share.streamlit.io), choose **Create app**,
   and select the repository, branch, and `app.py` entrypoint.
4. In **Advanced settings**, choose Python 3.12 and paste the four secret values
   shown above. Never commit `secrets.toml`.
5. Deploy, open the generated URL, and enter `APP_PASSWORD`.
6. Invite collaborators only if they should be able to edit the deployment;
   everyone who knows the app passcode can use the shared ledger.

No Node.js build runs on Streamlit Community Cloud. Ensure the checked-in
`frontend/dist/fairshare.js` and `frontend/dist/fairshare.css` are current
before pushing a deployment.

If the whole Cockpit later becomes a Git repository, Community Cloud also
supports `apps/fairshare/app.py` as a subdirectory entrypoint and can read the
adjacent `requirements.txt`.

## Research summary

Splitwise's official product page emphasizes these core jobs: organize groups
and friends, record expenses and debts, support equal and unequal splits,
calculate balances, simplify debts, and record repayments. It also lists
recurring expenses, cloud sync, spending totals, categories, currencies,
payments, imports, receipt scanning, itemization, charts, search, and saved
default splits. FairShare prioritizes the complete manual-ledger loop while
keeping deployment and data ownership simple.

Streamlit's official deployment guidance confirms that Community Cloud runs a
GitHub repository entrypoint, accepts a dependency file beside a subdirectory
entrypoint, provides secrets through **Advanced settings**, and supports remote
database connections from Python.

Sources reviewed on 2026-10-04:

- [Splitwise product overview](https://www.splitwise.com/)
- [Streamlit Community Cloud deployment](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app)
- [Streamlit file organization](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/file-organization)
- [Streamlit secrets management](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/secrets-management)
- [Streamlit data connections](https://docs.streamlit.io/develop/concepts/connections/connecting-to-data)

## Validate

```sh
npm test
npm run build
```

The build creates the production React bundle, compiles the Python files, and
runs the domain/storage tests. The test command runs both JavaScript domain
tests and Python domain/storage tests.
