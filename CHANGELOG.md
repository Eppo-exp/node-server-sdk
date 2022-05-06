<!---
## [MAJOR.MINOR.PATCH] - YYYY-MM-DD

#### New Features:
* Describe any features added

#### Fixed:
* Describe any bug fixes

#### Deprecated:
* Describe deprecated APIs in this version
-->

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