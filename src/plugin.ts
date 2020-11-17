import { WorkboxPlugin } from 'workbox-core'

declare const firebase: typeof import('firebase').default

export interface FirebaseOptions {
  version?: string
  services?: string[]
  config?: Record<string, unknown>
}

export interface Options {
  awaitResponse?: boolean
  constraints?: {
    types?: string | string[]
    https?: boolean
    sameOrigin?: boolean
    mode?: RequestMode
    ignorePaths?: (string | RegExp)[]
  }
}

interface ResolvedConstraints {
  types: string[]
  https: boolean
  sameOrigin: boolean
  mode: RequestMode
  ignorePaths: (string | RegExp)[]
}

const DEFAULT_FIREBASE_VERSION = '8.0.2'

const AVAILABLE_SERVICES = [
  'analytics',
  'firestore',
  'functions',
  'messaging',
  'storage',
  'performance',
  'database',
  'config',
]

export const initializeFirebase = ({
  version = DEFAULT_FIREBASE_VERSION,
  services = [],
  config,
}: FirebaseOptions = {}): void => {
  const additionalServices = services.filter(s =>
    AVAILABLE_SERVICES.includes(s)
  )

  if (config) {
    importScripts(
      `https://www.gstatic.com/firebasejs/${version}/firebase-app.js`
    )
    importScripts(
      `https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`
    )

    additionalServices.forEach(s => {
      importScripts(
        `https://www.gstatic.com/firebasejs/${version}/firebase-${s}.js`
      )
    })

    firebase.initializeApp(config)
  } else {
    importScripts(`/__/firebase/${version}/firebase-app.js`)
    importScripts(`/__/firebase/${version}/firebase-auth.js`)

    additionalServices.forEach(s => {
      importScripts(`/__/firebase/${version}/firebase-${s}.js`)
    })

    importScripts('/__/firebase/init.js')
  }
}

const getIdToken = (): Promise<string | null> => {
  return new Promise<string | null>((resolve, reject) => {
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      unsubscribe()
      if (user) {
        // force token refresh as it might be used to sign in server side
        user
          .getIdToken(true)
          .then(
            idToken => {
              resolve(idToken)
            },
            () => {
              resolve(null)
            }
          )
          .catch(e => {
            reject(e)
          })
      } else {
        resolve(null)
      }
    })
  })
}

const checkType = (constraints: string[], accept: string | null): boolean => {
  const types =
    accept &&
    accept.split(',').map(t => {
      const params = t.split(';')

      return params[0].trim()
    })

  return (
    !constraints.length ||
    constraints.includes('*') ||
    !types ||
    types.some(t =>
      constraints.some(c => new RegExp(`^${c.replace('*', '[^/]*')}$`).test(t))
    )
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
    !!constraints.ignorePaths.length &&
    constraints.ignorePaths.some(path => {
      if (typeof path === 'string') {
        return url.pathname.startsWith(path)
      }

      return path.test(url.pathname)
    })

  return isSameOrigin && hasCorrectType && isHttps && !isIgnored
}

const authorizeRequest = (
  original: Request,
  token: string,
  constraints: ResolvedConstraints
): Request => {
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
    mode: constraints.mode,
    redirect: 'manual',
    headers,
  })

  return authorized
}

export class Plugin implements WorkboxPlugin {
  private readonly constraints: ResolvedConstraints
  private readonly awaitResponse: boolean

  constructor(options: Options = {}) {
    this.awaitResponse = options.awaitResponse || false

    const { types, https, sameOrigin, mode, ignorePaths } =
      options.constraints || {}
    this.constraints = {
      types: typeof types === 'string' ? [types] : types || ['*'],
      https: !!https,
      sameOrigin: typeof sameOrigin === 'boolean' ? sameOrigin : true,
      mode: mode || 'same-origin',
      ignorePaths: ignorePaths || [],
    }
  }

  requestWillFetch: WorkboxPlugin['requestWillFetch'] = async ({ request }) => {
    if (
      this.awaitResponse ||
      !shouldAuthorizeRequest(request, this.constraints)
    ) {
      return request
    }

    try {
      const token = await getIdToken()
      if (!token) return request

      return authorizeRequest(request, token, this.constraints)
    } catch (e) {
      console.error(e)

      return request
    }
  }

  fetchDidSucceed: WorkboxPlugin['fetchDidSucceed'] = async ({
    request,
    response,
  }) => {
    if (
      !this.awaitResponse ||
      response.status !== 401 ||
      !shouldAuthorizeRequest(request, this.constraints)
    ) {
      return response
    }

    try {
      const token = await getIdToken()
      if (!token) return response

      const authorized = authorizeRequest(request, token, this.constraints)
      return await fetch(authorized)
    } catch (e) {
      console.error(e)

      return response
    }
  }
}
