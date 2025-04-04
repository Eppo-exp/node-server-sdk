<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@eppo/node-server-sdk](./node-server-sdk.md) &gt; [IClientConfig](./node-server-sdk.iclientconfig.md)

## IClientConfig interface

Configuration used for initializing the Eppo client

**Signature:**

```typescript
export interface IClientConfig 
```

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [apiKey](./node-server-sdk.iclientconfig.apikey.md) |  | string | Eppo SDK key |
|  [assignmentLogger](./node-server-sdk.iclientconfig.assignmentlogger.md) |  | IAssignmentLogger | Provide a logging implementation to send variation assignments to your data warehouse. |
|  [banditLogger?](./node-server-sdk.iclientconfig.banditlogger.md) |  | IBanditLogger | _(Optional)_ Logging implementation to send bandit actions to your data warehouse |
|  [baseUrl?](./node-server-sdk.iclientconfig.baseurl.md) |  | string | _(Optional)_ Base URL of the Eppo API. Clients should use the default setting in most cases. |
|  [eventTracking?](./node-server-sdk.iclientconfig.eventtracking.md) |  | { batchSize?: number; deliveryIntervalMs?: number; enabled?: boolean; maxQueueSize?: number; maxRetries?: number; maxRetryDelayMs?: number; retryIntervalMs?: number; } | _(Optional)_ Configuration settings for the event dispatcher |
|  [numInitialRequestRetries?](./node-server-sdk.iclientconfig.numinitialrequestretries.md) |  | number | _(Optional)_ Number of additional times the initial configuration request will be attempted if it fails. This is the request servers typically synchronously wait for completion. A small wait will be done between requests. (Default: 1) |
|  [numPollRequestRetries?](./node-server-sdk.iclientconfig.numpollrequestretries.md) |  | number | _(Optional)_ Number of additional times polling for updated configurations will be attempted before giving up. Polling is done after a successful initial request. Subsequent attempts are done using an exponential backoff. (Default: 7) |
|  [pollAfterFailedInitialization?](./node-server-sdk.iclientconfig.pollafterfailedinitialization.md) |  | boolean | _(Optional)_ Poll for new configurations even if the initial configuration request failed. (default: false) |
|  [pollingIntervalMs?](./node-server-sdk.iclientconfig.pollingintervalms.md) |  | number | _(Optional)_ Amount of time in milliseconds to wait between API calls to refresh configuration data. Default of 30\_000 (30s). |
|  [requestTimeoutMs?](./node-server-sdk.iclientconfig.requesttimeoutms.md) |  | number | _(Optional)_ Timeout in milliseconds for the HTTPS request for the experiment configuration. (Default: 5000) |
|  [throwOnFailedInitialization?](./node-server-sdk.iclientconfig.throwonfailedinitialization.md) |  | boolean | _(Optional)_ Throw error if unable to fetch an initial configuration during initialization. (default: true) |

