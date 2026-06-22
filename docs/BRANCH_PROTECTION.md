# Branch protection for `main` (owner/admin action)

Status as of issue #38: `main` is **NOT protected**. The mechanical guard
(`verify-release` CI) is the technical gate; branch protection is what makes it
*unbypassable*. Enabling it requires repo-admin rights, so it is an owner action.

> **Order matters:** GitHub can only require a status check that has run at least
> once. Merge the issue #38 PR first so the `verify-release` workflow runs, then
> enable protection requiring the `verify-release` check.

## Recommended settings (Settings → Branches → Add rule, branch name `main`)

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Required check: **`verify-release`**
- ✅ Do not allow bypassing the above settings
- ✅ Disallow force pushes
- ✅ Disallow deletions
- Direct pushes to `main` allowed only for emergency owner override

## Or via CLI (run by an admin, after `verify-release` has run once)

```bash
gh api -X PUT repos/DEEDSCOUT/HappyFaceLA/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["verify-release"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

(`enforce_admins: false` preserves an emergency owner override; set to `true`
for the strictest posture.)
