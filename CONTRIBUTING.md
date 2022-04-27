### Release Process
A release may include changes from multiple pull requests. Only the package maintainers have access to publish releases.

1) Checkout the `main` branch and pull the latest changes

2) Bump the package version: `npm version [major | minor | patch]`.
  - Follow [Semver guidelines](https://semver.org/) when choosing major | minor | patch

3) Update CHANGELOG.md with the list of changes that have occurred since the last release. Commit the version bump and CHANGELOG updates to the main branch.

4) `npm login` - enter your credentials. Make sure you have access to the `eppo` NPM organization.

5) `npm publish`. (You can also do `npm publish --dryrun` to test)