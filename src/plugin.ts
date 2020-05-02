import { WorkboxPlugin } from 'workbox-core'

declare const firebase: typeof import('firebase')

export interface Options {
  awaitResponse?: boolean
  firebase?: {
    version?: string
    config?: object
  }
  constraints?: {
    types?: string | string[]
    https?: boolean
    ignorePaths?: (string | RegExp)[]
  }
}

const DEFAULT_FIREBASE_VERSION = '7.14.2'

class FirebaseAuthPlugin implements WorkboxPlugin {
  private readonly constraints: {
    types: string[]
    https: boolean
    ignorePaths: (string | RegExp)[]
  }
  private readonly awaitResponse: boolean
  private readonly auth!: import('firebase').auth.Auth

  constructor(options: Options = {}) {
    this.awaitResponse = options.awaitResponse || false

    const { types, https, ignorePaths } = options.constraints || {}
    this.constraints = {
      types: typeof types === 'string' ? [types] : types || ['*'],
      https: !!https,
      ignorePaths: ignorePaths || [],
    }

    const fire = {
      version: DEFAULT_FIREBASE_VERSION,
      ...options.firebase,
    }

    if (fire.config) {
      importScripts(
        `https://www.gstatic.com/firebasejs/${fire.version}/firebase-app.js`
      )
      importScripts(
        `https://www.gstatic.com/firebasejs/${fire.version}/firebase-auth.js`
      )
      firebase.initializeApp(fire.config)
    } else {
      importScripts(`/__/firebase/${fire.version}/firebase-app.js`)
      importScripts(`/__/firebase/${fire.version}/firebase-auth.js`)
      importScripts('/__/firebase/init.js')
    }

    this.auth = firebase.auth()
  }

  public requestWillFetch: WorkboxPlugin['requestWillFetch'] = async ({
    request,
  }) => {
    if (!this.awaitResponse || !this.shouldAuthorizeRequest(request)) {
      return request
    }

    const token = await this.getIdToken()
    if (!token) return request

    return this.authorizeRequest(request, token)
  }

  public fetchDidSucceed: WorkboxPlugin['fetchDidSucceed'] = async ({
    request,
    response,
  }) => {
    if (
      this.awaitResponse ||
      response.status !== 401 ||
      !this.shouldAuthorizeRequest(request)
    ) {
      return response
    }

    const token = await this.getIdToken()
    if (!token) return response

    const authorized = await this.authorizeRequest(request, token)
    return fetch(authorized)
  }

  private async getIdToken(): Promise<string | null> {
    return new Promise<string | null>(resolve => {
      const unsubscribe = this.auth.onAuthStateChanged(user => {
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

  private async authorizeRequest(
    original: Request,
    token: string
  ): Promise<Request> {
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

  private shouldAuthorizeRequest(request: Request): boolean {
    const url = new URL(request.url)

    const isSameOrigin = self.location.origin === url.origin

    const hasCorrectType = this.hasCorrectType(request.headers.get('accept'))
    const isHttps =
      !this.constraints.https ||
      self.location.protocol === 'https:' ||
      self.location.hostname === 'localhost'
    const isIgnored =
      !this.constraints.ignorePaths ||
      this.constraints.ignorePaths.some(path => {
        if (typeof path === 'string') {
          return url.pathname.startsWith(path)
        }

        return path.test(url.pathname)
      })

    return isSameOrigin && hasCorrectType && isHttps && !isIgnored
  }

  private hasCorrectType(accept: string | null): boolean {
    const typeConstraint = this.constraints.types
    const types =
      accept &&
      accept.split(',').map(t => {
        const params = t.split(';')

        return params[0].trim()
      })

    return (
      !typeConstraint ||
      typeConstraint.includes('*') ||
      !types ||
      types.some(t => typeConstraint.includes(t))
    )
  }
}

export default FirebaseAuthPlugin
