<!---
## [MAJOR.MINOR.PATCH] - YYYY-MM-DD

#### New Features:
* Describe any features added

#### Fixed:
* Describe any bug fixes

#### Deprecated:
* Describe deprecated APIs in this version
-->

## [1.0.0] - 2022-06-03

#### Breaking Changes:
* Subject attributes: the `subject` parameter of the assignment function was changed from a string to an object. The new `subject` contains a `key` field for the subject ID as well as an optional `customAttributes` property for any related metadata like name or email.

## [0.4.0] - 2022-05-12

#### New Features:
* Allow list: the SDK will retrieve an allow list from Eppo's API. The allow list maps subjects to variations. If a subject is in the allow list for a given variation, the assignment function will return that variation instead of a random assignment.

## [0.3.7] - 2022-05-05

#### Changed:
* Changed the in-memory store implementation to use an LRU cache instead of a TTL cache. This allows the assignment function to continue serving stale results if a fatal error stops the polling process.

## [0.3.6] - 2022-05-03

#### Changed:
* Renamed the `flag` parameter of the assignment function to `experimentKey`

## [0.3.5] - 2022-04-29

#### Fixed:
* If the init method is called twice in a row, the second call should cancel the previous polling process.

## [0.3.3] - 2022-04-28

* Added MIT license

## [0.3.2] - 2022-04-26

#### New Features:

* This is the initial development release. It adds a variation assignment function and the ability to retrieve assignment configurations in the background.