import { WorkboxPlugin } from 'workbox-core'

declare const firebase: typeof import('firebase')

export interface FirebaseOptions {
  version?: string
  config?: object
}

export interface Options {
  awaitResponse?: boolean
  constraints?: {
    types?: string | string[]
    https?: boolean
    sameOrigin?: boolean
    ignorePaths?: (string | RegExp)[]
  }
}

interface ResolvedConstraints {
  types: string[]
  https: boolean
  sameOrigin: boolean
  ignorePaths: (string | RegExp)[]
}

const DEFAULT_FIREBASE_VERSION = '7.14.2'

const initializeFirebase = (options: FirebaseOptions): void => {
  const opts = {
    version: DEFAULT_FIREBASE_VERSION,
    ...options,
  }

  if (opts.config) {
    importScripts(
      `https://www.gstatic.com/firebasejs/${opts.version}/firebase-app.js`
    )
    importScripts(
      `https://www.gstatic.com/firebasejs/${opts.version}/firebase-auth.js`
    )
    firebase.initializeApp(opts.config)
  } else {
    importScripts(`/__/firebase/${opts.version}/firebase-app.js`)
    importScripts(`/__/firebase/${opts.version}/firebase-auth.js`)
    importScripts('/__/firebase/init.js')
  }
}

const getIdToken = async (): Promise<string | null> => {
  return new Promise<string | null>(resolve => {
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      unsubscribe()
      if (user) {
        // force token refresh as it might be used to sign in server side
        user.getIdToken(true).then(
          idToken => {
            resolve(idToken)
          },
          () => {
            resolve(null)
          }
        )
      } else {
        resolve(null)
      }
    })
  })
}

const checkType = (constraint: string[], accept: string | null): boolean => {
  const types =
    accept &&
    accept.split(',').map(t => {
      const params = t.split(';')

      return params[0].trim()
    })

  return (
    !constraint ||
    constraint.includes('*') ||
    !types ||
    types.some(t => constraint.includes(t))
  )
}

const shouldAuthorizeRequest = (
  request: Request,
  constraints: ResolvedConstraints
): boolean => {
  const url = new URL(request.url)

  const isSameOrigin =
    !constraints.sameOrigin || self.location.origin === url.origin

  const hasCorrectType = checkType(
    constraints.types,
    request.headers.get('accept')
  )
  const isHttps =
    !constraints.https ||
    self.location.protocol === 'https:' ||
    self.location.hostname === 'localhost'
  const isIgnored =
    !constraints.ignorePaths.length ||
    constraints.ignorePaths.some(path => {
      if (typeof path === 'string') {
        return url.pathname.startsWith(path)
      }

      return path.test(url.pathname)
    })

  return isSameOrigin && hasCorrectType && isHttps && !isIgnored
}

const authorizeRequest = (original: Request, token: string): Request => {
  // Clone headers as request headers are immutable.
  const headers = new Headers()
  original.headers.forEach((value, key) => {
    headers.append(key, value)
  })

  // Add ID token to header.
  headers.append('Authorization', 'Bearer ' + token)

  // Create authorized request
  const { url, ...props } = original.clone()
  const authorized = new Request(url, {
    ...props,
    mode: 'same-origin',
    redirect: 'manual',
    headers,
  })

  return authorized
}

class Plugin implements WorkboxPlugin {
  private readonly constraints: ResolvedConstraints
  private readonly awaitResponse: boolean

  constructor(options: Options = {}) {
    this.awaitResponse = options.awaitResponse || false

    const { types, https, sameOrigin, ignorePaths } = options.constraints || {}
    this.constraints = {
      types: typeof types === 'string' ? [types] : types || ['*'],
      https: !!https,
      sameOrigin: typeof sameOrigin === 'boolean' ? sameOrigin : true,
      ignorePaths: ignorePaths || [],
    }
  }

  requestWillFetch: WorkboxPlugin['requestWillFetch'] = async ({ request }) => {
    if (
      !this.awaitResponse ||
      !shouldAuthorizeRequest(request, this.constraints)
    ) {
      return request
    }

    const token = await getIdToken()
    if (!token) return request

    return authorizeRequest(request, token)
  }

  fetchDidSucceed: WorkboxPlugin['fetchDidSucceed'] = async ({
    request,
    response,
  }) => {
    if (
      this.awaitResponse ||
      response.status !== 401 ||
      !shouldAuthorizeRequest(request, this.constraints)
    ) {
      return response
    }

    const token = await getIdToken()
    if (!token) return response

    const authorized = authorizeRequest(request, token)
    return fetch(authorized)
  }
}

export default {
  initializeFirebase,
  Plugin,
}
