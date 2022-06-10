# Eppo Server-Side SDK for Node.js

[![](https://img.shields.io/npm/v/@eppo/node-server-sdk)](https://www.npmjs.com/package/@eppo/node-server-sdk)
[![](https://img.shields.io/static/v1?label=GitHub+Pages&message=API+reference&color=00add8)](https://eppo-exp.github.io/node-server-sdk/node-server-sdk.html)

## Getting Started

Install the Eppo SDK as a dependency of your application:

```
yarn add @eppo/node-server-sdk
```

Initialize the SDK client in your application code:

```
import * as EppoSdk from '@eppo/node-server-sdk';

const eppoClient = EppoSdk.init({ apiKey: 'YOUR_API_KEY' });
```

**The client must be a singleton**. The client instance stores assignment configurations in memory. The same client instance should be reused for the lifetime of your application. Do not generate a new instance on every request.

#### Use the shared client instance to assign subjects to variations

Pass a `subject` and `experimentKey` to the client assignment function:
```
const assignedVariation = client.getAssignment("<subject>", "<experimentKey>")
```

The `subject` argument can be any entity identifier (e.g. a user ID). The `experimentKey` argument is the identifier of your Eppo experiment.

The `getAssignment` function will return `null` if the experiment is not running or if the subject is not part of the experiment traffic allocation.
