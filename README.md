# Workbox plugin for firebase auth

This is a simple plugin for workbox strategies which adds an `Authorization: Bearer` header with the return value from [`firebase.User.getIdToken(true)`](https://firebase.google.com/docs/reference/js/firebase.User#getidtoken) to the [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) if a firebase User is authenticated (i.e. [`firebase.auth.Auth.onAuthStateChanged()`](https://firebase.google.com/docs/reference/js/firebase.auth.Auth#onauthstatechanged) returns a [`firebase.User`](https://firebase.google.com/docs/reference/js/firebase.User)).

**CAUTION:** Be aware that request authorization happens before the response is passed to the caching strategy.  
Please plan accordingly (e.g. a cache first strategy might serve authorized content to non authorized users).

## Usage

### Module

Use the module if:

- you are building your service worker [using a bundler](https://developers.google.com/web/tools/workbox/guides/using-bundlers).
- you are generating your service worker with [workbox-build](https://developers.google.com/web/tools/workbox/modules/workbox-build)

1. Add the dependency:

   ```sh
   npm i workbox-firebase-auth // or yarn add workbox-firebase-auth
   ```

2. Import the initialization helper and use it to initialize firebase in the service worker.  
   Import the plugin and use it for your strategies.

   Example:

   ```js
   import {registerRoute} from 'workbox-routing/registerRoute.mjs';
   import {NetworkFirst} from 'workbox-strategies/NetworkFirst.mjs';
   import { initFirebase, Plugin as FirebaseAuthPlugin } from 'workbox-plugin-firebase-auth';

   initFirebase({
     config: { /* your firebase config */ }
   })

   registerRoute(
     /\.(?:png|gif|jpg|jpeg|svg)$/,
     new NetworkFirst({
       cacheName: 'authorizedApi',
       plugins: [
         new FirebaseAuthPlugin(),
       ],
     }),
   );
   ```

### CDN

If you are using [workbox-sw](https://developers.google.com/web/tools/workbox/modules/workbox-sw) to import workbox, you can use the [unpkg CDN](https://unpkg.com/) to import the plugin.  
It will then be available under the global variable `WorkboxFirebaseAuth`.

Example:

```js
importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js',
  'https://unpkg.com/workbox-plugin-firebase-auth@1.0.0-alpha.7/lib/plugin.umd.js'
)

WorkboxFirebaseAuth.initializeFirebase({
  config: { /* your firebase config */ }
})

workbox.routing.registerRoute(
  /\.(?:png|gif|jpg|jpeg|svg)$/,
  new workbox.strategies.NetworkFirst({
    cacheName: 'authorizedApi',
    plugins: [
      new WorkboxFirebaseAuth.Plugin(),
    ],
  }),
)
```

## `initFirebase` options

If your service worker is hosted firebase hosting, associated with the firebase app you use to authorize users, you don't have to specify any options (the helper will load the firebase SDK from [reserved URLs](https://firebase.google.com/docs/hosting/reserved-urls)).  
Otherwise the [`config`](#config) parameter is **REQUIRED**.

### config

**Required:** If your service worker is NOT hosted on firebase hosting or if you use a different app to authorize users.  
**Type:** `object`

The [firebase config object](https://firebase.google.com/docs/web/setup?authuser=0#config-object) from the app that you use to authorize your users.

#### version

**Type:** `string` (Firebase version)  
**Default:** `7.14.2`

This key can be used to specify the firebase version to use.

## `Plugin` options

### awaitResponse

**Type:** `boolean`  
**Default:** `false`

If true the plugin will await the fetch to go through and check if the response has a 401 status before attaching the authorization and resending the request.

> **Note:** Please make sure your server responds to unauthorized requests with a 401 status code, so that the plugin can correctly identify authorization failures.

### constraints

This key can be used to specify additional constraints on top of the route matcher.

#### constraints.types

**Type:** `string | string[]`  
**Default:** `['*']`

This can be used to authorize only requests that accept certain types of responses (e.g. `application/json`)

> **Note:** This simply matches the entries from the `Accept` request header against the passed array/string.  
> As of yet group matching is not supported (e.g. `text/*` will not match `text/html`)

#### constraints.https

**Type:** `boolean`  
**Default:** `false`

Only allow requests to secure origins (`https://` or `localhost`) to be authorized.

#### constraints.sameOrigin

**Type:** `boolean`  
**Default:** `true`

Only allow requests to the same origin as the service worker to be authorized.

#### constraints.ignorePaths

**Type:** `(string | RegExp)[]`  
**Default:** `[]`

Paths to ignore when authorizing requests.  

> **Note:** Checks against the pathname of the request (e.g. `/api/some-resource`)  
> If the argument is a `string` a request will be ignored if the pathname starts with that `string`.  
> If the argument is a `RegExp` the leading `'/'` will be stripped from the pathname and it will be checked against the `RegExp`.
