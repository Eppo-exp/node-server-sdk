# Eppo Server-Side SDK for Node.js
[API Reference](./docs/node-server-sdk.md)

## Getting Started

1) Install the Eppo SDK as a dependency of your application:

```
yarn add @eppo/node-server-sdk
```

2) Initialize the SDK client in your application code

```
import * as EppoSdk from '@eppo/node-server-sdk';

const eppoClient = EppoSdk.init({ apiKey: 'YOUR_API_KEY' });
```

**The client must be a singleton**. The client instance stores assignment configurations in memory. To avoid inconsistent assignment results, the same client instance should be reused across requests. Invoke the `init` method once at application startup to generate the client.

## Contributing

### Pull Requests

Create a new branch off of `main` and submit a PR. In the PR, update the `Unreleased` section of the changelog with a description of your change:

```
## Unreleased

* Brief description of your change
```

Do not change the package version in the PR.

### Releases
1) Checkout the `main` branch and pull the latest changes

2) Bump the package version: `npm version [major | minor | patch]`.

  - Follow [Semver guidelines](https://semver.org/) when choosing major | minor | patch

3) Update CHANGELOG.md with the list of changes that have occurred since the last release

4) Commit the version bump and CHANGELOG updates to the main branch. Annotate the commit with the release tag. Example:
```
git commit -m "release 1.0.0"
git tag -a v1.0.0
git push
```

5) `npm login` - enter your credentials

6) Run `npm publish`. You can also do `npm publish --dryrun` to test.
