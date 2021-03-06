<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@eppo/node-server-sdk](./node-server-sdk.md) &gt; [IAssignmentEvent](./node-server-sdk.iassignmentevent.md)

## IAssignmentEvent interface

Holds data about the variation a subject was assigned to.

<b>Signature:</b>

```typescript
export interface IAssignmentEvent 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [experiment](./node-server-sdk.iassignmentevent.experiment.md) | string | An Eppo experiment key |
|  [subject](./node-server-sdk.iassignmentevent.subject.md) | string | The entity or user that was assigned to a variation |
|  [subjectAttributes](./node-server-sdk.iassignmentevent.subjectattributes.md) | Record&lt;string, any&gt; |  |
|  [timestamp](./node-server-sdk.iassignmentevent.timestamp.md) | string | The time the subject was exposed to the variation. |
|  [variation](./node-server-sdk.iassignmentevent.variation.md) | string | The assigned variation |

