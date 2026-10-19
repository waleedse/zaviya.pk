import { createHmac, randomBytes } from 'node:crypto'

/** OAuth 1.0a HMAC-SHA1 signature for X API (user context). */
export function oauth1Signature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(params[k]!)}`)
    .join('&')
  const base = `${method.toUpperCase()}&${encodeRFC3986(url)}&${encodeRFC3986(sorted)}`
  const key = `${encodeRFC3986(consumerSecret)}&${encodeRFC3986(tokenSecret)}`
  return createHmac('sha1', key).update(base).digest('base64')
}

export function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function buildOAuthHeader(
  method: string,
  url: string,
  creds: {
    consumerKey: string
    consumerSecret: string
    accessToken: string
    accessTokenSecret: string
  },
  extraParams: Record<string, string> = {},
  /** Query-string parameters: they are part of the signature but not of the header (GET requests) */
  signedQuery: Record<string, string> = {},
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
    ...extraParams,
  }
  const signature = oauth1Signature(method, url, { ...oauthParams, ...signedQuery }, creds.consumerSecret, creds.accessTokenSecret)
  oauthParams.oauth_signature = signature
  const header =
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeRFC3986(k)}="${encodeRFC3986(oauthParams[k]!)}"`)
      .join(', ')
  return header
}
