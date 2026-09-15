# First GitHub/Codespaces setup

## Option A — GitHub web

1. Create an empty repository named `txkpro-workforce` under the GitHub account that should own the product.
2. Upload/push the contents of this package to `main`.
3. Open **Code → Codespaces → Create codespace on main**.
4. Copy `.env.example` to `.env.local`.
5. Add Supabase values when ready; demo workspaces do not require them.
6. Run `npm run dev` and open port 3000.

## Option B — GitHub CLI

From the extracted project directory:

```bash
git init
git add .
git commit -m "Initial TXKPRO Workforce MVE"
gh repo create QaloriHQ/txkpro-workforce --private --source=. --remote=origin --push
```

Then open the repository in Codespaces.

> Change `QaloriHQ/txkpro-workforce` if another GitHub owner or repository name is preferred.
