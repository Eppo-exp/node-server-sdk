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
