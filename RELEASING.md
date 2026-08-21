# Releasing Fast Scribe

Use this process for every desktop release. It updates the application and lockfile
versions together, so the release tag always matches the packaged application.

## 1. Prepare the version bump

Start from a clean branch based on the current `main` branch. From `fast-scribe-app/`,
run the release-preparation command with the next semantic version, without a `v`
prefix:

```powershell
npm run release:prepare -- 1.0.6
```

The command runs `npm version --no-git-tag-version`, which updates both
`fast-scribe-app/package.json` and `fast-scribe-app/package-lock.json`. It does not
create a Git commit or a tag.

## 2. Validate and merge the version bump

Run the application checks:

```powershell
npm test
npm run build
```

Commit the two manifest changes, push the branch, open a pull request, and merge it
into `main`.

## 3. Tag the merged main commit

After the pull request is merged, tag the current remote `main` commit with the
matching version:

```powershell
git fetch origin main --tags
git tag -a v1.0.6 origin/main -m "Release v1.0.6"
git push origin v1.0.6
```

Do not create the tag before the version-bump pull request is merged.

## 4. Publish and verify

Pushing the tag starts the `Build desktop installers` GitHub Actions workflow. It
builds the Windows, macOS, and Linux installers and publishes the GitHub Release
with the update metadata. Wait for the workflow to succeed, then confirm that the
new release contains installers for all three platforms.

## If a tag is wrong

Do not move or reuse the failed tag. Prepare the next patch version, merge its
version bump, and create a new matching tag. The release workflow rejects tags that
do not match the application version before packaging.
