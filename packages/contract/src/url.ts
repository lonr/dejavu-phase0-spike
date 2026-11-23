import { ARTICLE_ROUTE_SEGMENT, OPT_IN_ASSET_PREFIX } from './constants'
import { sha256Hex } from './sha256'

export type UrlContractErrorCode =
  | 'INVALID_URL'
  | 'INVALID_SCHEME'
  | 'CREDENTIALS_NOT_ALLOWED'
  | 'UNEXPECTED_PORT'
  | 'DISALLOWED_HOST'
  | 'UNEXPECTED_QUERY_OR_FRAGMENT'
  | 'ORIGIN_MISMATCH'
  | 'INVALID_PATH'
  | 'EMPTY_SEGMENT'
  | 'DOT_SEGMENT'
  | 'MALFORMED_PERCENT_ENCODING'
  | 'INVALID_UTF8'
  | 'DECODED_SEPARATOR'
  | 'CONTROL_CHARACTER'
  | 'PREFIX_MISMATCH'
  | 'INVALID_ARTICLE_ROUTE'
  | 'INVALID_STEM'

export interface UrlContractError {
  code: UrlContractErrorCode
  message: string
}

export type ContractResult<T, E = UrlContractError> = { ok: true; value: T } | { ok: false; error: E }

export interface PagesBaseUrlOptions {
  /** Allow http:// URLs (for local development only). Defaults to false. */
  allowHttp?: boolean
  /** Allow non-default ports (for local development only). Defaults to false. */
  allowNonStandardPort?: boolean
  /** Allow localhost and IP literals (for local development only). Defaults to false. */
  allowLocalOrIp?: boolean
  /** Optional origin to reject (e.g., Worker's own origin). */
  disallowedOrigin?: string
}

export interface ParsedPagesBaseUrl {
  /** Canonical origin, e.g. "https://octo.github.io" */
  origin: string
  /** Canonical encoded base path without trailing slash: "" or "/journal" */
  encodedBasePath: string
  /** NFC-normalized decoded base path without trailing slash: "" or "/journal" */
  decodedBasePath: string
  /** NFC-normalized decoded base path segments, e.g. [] or ["journal"] */
  decodedSegments: readonly string[]
  /** RFC 3986 encoded base path segments, e.g. [] or ["journal"] */
  encodedSegments: readonly string[]
  /** Slashless canonical base URL, e.g. "https://octo.github.io" or "https://octo.github.io/journal" */
  baseUrl: string
}

export interface ArticleIdentity {
  /** Canonical origin */
  origin: string
  /** Encoded base path without trailing slash: "" or "/journal" */
  encodedBasePath: string
  /** Decoded base path without trailing slash: "" or "/journal" */
  decodedBasePath: string
  /** NFC-normalized filename stem without extension */
  stem: string
  /** RFC 3986 percent-encoded stem */
  encodedStem: string
  /** Canonical slashless encoded pathname, e.g. "/journal/posts/%E7%8C%AB%20100%25" */
  encodedPath: string
  /** Canonical slashless decoded pathname (Discussion title & D1 key), e.g. "/journal/posts/猫 100%" */
  decodedPath: string
  /** Full canonical slashless URL */
  canonicalUrl: string
  /** Exact GitHub Discussion title (identical to decodedPath) */
  discussionTitle: string
  /** Lowercase hex SHA-256 of UTF-8 decodedPath */
  optInHash: string
  /** Site-relative hashed opt-in JSON path, e.g. "assets/_dejavu/comments/<sha256>.json" */
  optInRelativePath: string
  /** Full HTTPS opt-in JSON URL under the Pages base */
  optInUrl: string
}

const textEncoder = new TextEncoder()
const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true })

const RAW_URL_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/

function ok<T>(value: T): ContractResult<T> {
  return { ok: true, value }
}

function fail<T>(code: UrlContractErrorCode, message: string): ContractResult<T> {
  return { ok: false, error: { code, message } }
}

function isUnreservedByte(byte: number): boolean {
  return (
    (byte >= 0x41 && byte <= 0x5a) || // A-Z
    (byte >= 0x61 && byte <= 0x7a) || // a-z
    (byte >= 0x30 && byte <= 0x39) || // 0-9
    byte === 0x2d || // -
    byte === 0x2e || // .
    byte === 0x5f || // _
    byte === 0x7e // ~
  )
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true
    }
  }
  return false
}

function hexValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10
  return -1
}

/**
 * Percent-encode a single path segment using UTF-8 bytes outside RFC 3986 unreserved
 * characters (A-Za-z0-9-._~), with uppercase hex digits, after NFC normalization.
 */
export function encodePathSegment(segment: string): string {
  const bytes = textEncoder.encode(segment.normalize('NFC'))
  let out = ''
  for (const byte of bytes) {
    if (isUnreservedByte(byte)) {
      out += String.fromCharCode(byte)
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

/**
 * Validate a decoded path segment (e.g., an article stem or base path segment).
 * Returns the NFC-normalized segment on success.
 */
export function validateDecodedSegment(segment: string, kind: 'stem' | 'segment' = 'segment'): ContractResult<string> {
  const normalized = segment.normalize('NFC')
  if (normalized.length === 0) {
    return fail(kind === 'stem' ? 'INVALID_STEM' : 'EMPTY_SEGMENT', 'Path segment must not be empty')
  }
  if (normalized === '.' || normalized === '..') {
    return fail('DOT_SEGMENT', `Dot segment "${normalized}" is not allowed`)
  }
  if (normalized.includes('/') || normalized.includes('\\')) {
    return fail('DECODED_SEPARATOR', 'Path segment must not contain path separators')
  }
  if (hasControlChar(normalized)) {
    return fail('CONTROL_CHARACTER', 'Path segment must not contain control characters')
  }
  return ok(normalized)
}

/**
 * Strictly decode a single raw URL path segment exactly once, rejecting malformed
 * percent-escapes, invalid UTF-8 sequences, dot segments, decoded separators, and control chars.
 */
export function decodePathSegmentStrict(rawSegment: string): ContractResult<string> {
  if (rawSegment.length === 0) {
    return fail('EMPTY_SEGMENT', 'Path contains an empty segment')
  }
  if (rawSegment === '.' || rawSegment === '..') {
    return fail('DOT_SEGMENT', `Dot segment "${rawSegment}" is not allowed`)
  }
  if (hasControlChar(rawSegment)) {
    return fail('CONTROL_CHARACTER', 'Raw path segment contains control characters')
  }

  const bytes: number[] = []
  for (let i = 0; i < rawSegment.length; ) {
    const ch = rawSegment.charCodeAt(i)
    if (ch === 0x25) {
      // '%'
      if (i + 2 >= rawSegment.length) {
        return fail('MALFORMED_PERCENT_ENCODING', 'Truncated percent-encoding in path segment')
      }
      const hi = hexValue(rawSegment.charCodeAt(i + 1))
      const lo = hexValue(rawSegment.charCodeAt(i + 2))
      if (hi < 0 || lo < 0) {
        return fail('MALFORMED_PERCENT_ENCODING', 'Invalid hex digits in percent-encoding')
      }
      bytes.push((hi << 4) | lo)
      i += 3
    } else {
      // Encode literal character (including surrogate pairs) as UTF-8 bytes
      const cp = rawSegment.codePointAt(i)!
      const str = String.fromCodePoint(cp)
      const encoded = textEncoder.encode(str)
      for (const b of encoded) {
        bytes.push(b)
      }
      i += str.length
    }
  }

  let decoded: string
  try {
    decoded = utf8FatalDecoder.decode(new Uint8Array(bytes))
  } catch {
    return fail('INVALID_UTF8', 'Path segment contains invalid UTF-8 bytes')
  }

  return validateDecodedSegment(decoded, 'segment')
}

/**
 * Strip the last case-insensitive `.md` extension from a filename to get the raw stem.
 * Preserves case and any leading date prefix.
 */
export function stemFromMarkdownFilename(filename: string): ContractResult<string> {
  if (filename.includes('/') || filename.includes('\\')) {
    return fail('INVALID_STEM', 'Filename must not contain path separators')
  }
  if (!/\.md$/i.test(filename)) {
    return fail('INVALID_STEM', `Filename "${filename}" does not end with a .md extension`)
  }
  const stem = filename.slice(0, -3)
  return validateDecodedSegment(stem, 'stem')
}

export function isLocalOrIpHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    return true
  }
  // IPv6 literal in URL.hostname is enclosed in brackets "[...]"
  if (lower.startsWith('[') && lower.endsWith(']')) {
    return true
  }
  // WHATWG URL canonicalizes IPv4 literals (including hex/octal/decimal integers) into dotted quads
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    return true
  }
  return false
}

export function isSafePublicOrigin(rawOriginOrUrl: string, disallowedOrigin?: string): boolean {
  const parsed = parseRawOrigin(rawOriginOrUrl, { allowHttp: false, allowNonStandardPort: false, allowLocalOrIp: false, disallowedOrigin })
  return parsed.ok
}

interface ParsedRawUrlParts {
  scheme: string
  origin: string
  hostname: string
  rawPath: string
  hasQueryOrFragment: boolean
}

function parseRawOrigin(rawUrl: string, options: PagesBaseUrlOptions = {}): ContractResult<ParsedRawUrlParts> {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return fail('INVALID_URL', 'URL must be a non-empty string')
  }
  if (rawUrl !== rawUrl.trim() || hasControlChar(rawUrl)) {
    return fail('INVALID_URL', 'URL must not contain surrounding whitespace or control characters')
  }

  const match = RAW_URL_PATTERN.exec(rawUrl)
  if (!match) {
    return fail('INVALID_URL', 'URL must be an absolute http(s) URL')
  }

  const scheme = match[1]!.toLowerCase()
  const authority = match[2]!
  const rawPath = match[3]!
  const hasQueryOrFragment = match[4] !== undefined || match[5] !== undefined

  if (scheme !== 'https' && !(options.allowHttp && scheme === 'http')) {
    return fail('INVALID_SCHEME', `Unsupported URL scheme "${scheme}:"`)
  }
  if (authority.length === 0) {
    return fail('INVALID_URL', 'URL authority must not be empty')
  }
  if (authority.includes('@')) {
    return fail('CREDENTIALS_NOT_ALLOWED', 'URL must not contain credentials')
  }
  if (authority.includes('\\') || rawPath.includes('\\')) {
    return fail('DECODED_SEPARATOR', 'URL must not contain backslashes')
  }

  // Validate explicit port before URL normalization strips default ports.
  let rawPort = ''
  if (authority.startsWith('[')) {
    const closingBracket = authority.indexOf(']')
    if (closingBracket === -1) {
      return fail('INVALID_URL', 'Invalid IPv6 host syntax')
    }
    const afterBracket = authority.slice(closingBracket + 1)
    if (afterBracket.length > 0) {
      if (!afterBracket.startsWith(':')) {
        return fail('INVALID_URL', 'Invalid authority after IPv6 literal')
      }
      rawPort = afterBracket.slice(1)
    }
  } else {
    const colonIndex = authority.indexOf(':')
    if (colonIndex !== -1) {
      if (authority.indexOf(':', colonIndex + 1) !== -1) {
        return fail('INVALID_URL', 'Invalid port syntax in authority')
      }
      rawPort = authority.slice(colonIndex + 1)
    }
  }

  if (rawPort.length > 0 || authority.endsWith(':')) {
    if (!/^\d+$/.test(rawPort)) {
      return fail('UNEXPECTED_PORT', 'Port must be numeric')
    }
    const defaultPort = scheme === 'https' ? '443' : '80'
    if (!options.allowNonStandardPort && rawPort !== defaultPort) {
      return fail('UNEXPECTED_PORT', `Unexpected port ":${rawPort}" for ${scheme}: URL`)
    }
  }

  let originUrl: URL
  try {
    originUrl = new URL(`${scheme}://${authority}/`)
  } catch {
    return fail('INVALID_URL', 'Invalid URL authority')
  }

  const origin = originUrl.origin
  const hostname = originUrl.hostname

  if (!options.allowLocalOrIp && isLocalOrIpHostname(hostname)) {
    return fail('DISALLOWED_HOST', `Host "${hostname}" is not an allowed public origin`)
  }

  if (options.disallowedOrigin) {
    try {
      const forbidden = new URL(options.disallowedOrigin).origin
      if (origin === forbidden) {
        return fail('DISALLOWED_HOST', 'Target origin matches disallowed origin')
      }
    } catch {
      return fail('DISALLOWED_HOST', 'Invalid disallowedOrigin configuration')
    }
  }

  return ok({
    scheme,
    origin,
    hostname,
    rawPath,
    hasQueryOrFragment,
  })
}

function splitStrictPathSegments(rawPath: string, allowEmptyPath: boolean): ContractResult<string[]> {
  if (rawPath === '') {
    return allowEmptyPath ? ok([]) : fail('INVALID_PATH', 'URL path must start with "/"')
  }
  if (!rawPath.startsWith('/')) {
    return fail('INVALID_PATH', 'URL path must start with "/"')
  }
  if (rawPath === '/') {
    return ok([])
  }
  if (rawPath.endsWith('//')) {
    return fail('EMPTY_SEGMENT', 'URL path must not end with multiple slashes')
  }
  const withoutTrailingSlash = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath
  const rawSegments = withoutTrailingSlash.slice(1).split('/')
  const decodedSegments: string[] = []
  for (const rawSeg of rawSegments) {
    const decoded = decodePathSegmentStrict(rawSeg)
    if (!decoded.ok) {
      return decoded
    }
    decodedSegments.push(decoded.value)
  }
  return ok(decodedSegments)
}

/**
 * Parse and validate a GitHub Pages base URL (personal site, project site, or custom domain).
 */
export function parsePagesBaseUrl(rawUrl: string, options: PagesBaseUrlOptions = {}): ContractResult<ParsedPagesBaseUrl> {
  const parts = parseRawOrigin(rawUrl, options)
  if (!parts.ok) {
    return parts
  }
  if (parts.value.hasQueryOrFragment) {
    return fail('UNEXPECTED_QUERY_OR_FRAGMENT', 'Pages base URL must not include a query or fragment')
  }

  const segmentsResult = splitStrictPathSegments(parts.value.rawPath, true)
  if (!segmentsResult.ok) {
    return segmentsResult
  }

  const decodedSegments = segmentsResult.value
  const encodedSegments = decodedSegments.map(encodePathSegment)
  const decodedBasePath = decodedSegments.length === 0 ? '' : `/${decodedSegments.join('/')}`
  const encodedBasePath = encodedSegments.length === 0 ? '' : `/${encodedSegments.join('/')}`

  return ok({
    origin: parts.value.origin,
    encodedBasePath,
    decodedBasePath,
    decodedSegments,
    encodedSegments,
    baseUrl: `${parts.value.origin}${encodedBasePath}`,
  })
}

export function computeOptInHash(decodedPath: string): string {
  return sha256Hex(decodedPath.normalize('NFC'))
}

export function buildArticleIdentityFromParsedBase(base: ParsedPagesBaseUrl, rawStem: string): ContractResult<ArticleIdentity> {
  const stemResult = validateDecodedSegment(rawStem, 'stem')
  if (!stemResult.ok) {
    return stemResult
  }
  const stem = stemResult.value
  const encodedStem = encodePathSegment(stem)

  const decodedSegments = [...base.decodedSegments, ARTICLE_ROUTE_SEGMENT, stem]
  const encodedSegments = [...base.encodedSegments, ARTICLE_ROUTE_SEGMENT, encodedStem]

  const decodedPath = `/${decodedSegments.join('/')}`
  const encodedPath = `/${encodedSegments.join('/')}`
  const canonicalUrl = `${base.origin}${encodedPath}`
  const optInHash = computeOptInHash(decodedPath)
  const optInRelativePath = `${OPT_IN_ASSET_PREFIX}/${optInHash}.json`
  const optInUrl = `${base.origin}${base.encodedBasePath}/${optInRelativePath}`

  return ok({
    origin: base.origin,
    encodedBasePath: base.encodedBasePath,
    decodedBasePath: base.decodedBasePath,
    stem,
    encodedStem,
    encodedPath,
    decodedPath,
    canonicalUrl,
    discussionTitle: decodedPath,
    optInHash,
    optInRelativePath,
    optInUrl,
  })
}

/**
 * Construct canonical article URL, decoded pathname / Discussion title, and hashed opt-in metadata
 * from a validated Pages base URL and a filename stem (without `.md`).
 */
export function buildArticleIdentity(params: {
  baseUrl: string
  stem: string
  options?: PagesBaseUrlOptions
}): ContractResult<ArticleIdentity> {
  const baseResult = parsePagesBaseUrl(params.baseUrl, params.options)
  if (!baseResult.ok) {
    return baseResult
  }
  return buildArticleIdentityFromParsedBase(baseResult.value, params.stem)
}

/**
 * Validate and normalize an incoming article URL against a verified Pages base URL.
 * Validates the raw path BEFORE any URL parser can collapse dot segments.
 */
export function parseIncomingArticleUrl(
  rawArticleUrl: string,
  pagesBaseUrl: string | ParsedPagesBaseUrl,
  options: PagesBaseUrlOptions = {},
): ContractResult<ArticleIdentity> {
  const base = typeof pagesBaseUrl === 'string' ? parsePagesBaseUrl(pagesBaseUrl, options) : ok(pagesBaseUrl)
  if (!base.ok) {
    return base
  }

  const parts = parseRawOrigin(rawArticleUrl, options)
  if (!parts.ok) {
    return parts
  }

  if (parts.value.origin !== base.value.origin) {
    return fail('ORIGIN_MISMATCH', `Article origin "${parts.value.origin}" does not match Pages origin "${base.value.origin}"`)
  }

  const segmentsResult = splitStrictPathSegments(parts.value.rawPath, false)
  if (!segmentsResult.ok) {
    return segmentsResult
  }

  const segments = segmentsResult.value
  const baseSegments = base.value.decodedSegments

  if (segments.length < baseSegments.length) {
    return fail('PREFIX_MISMATCH', 'Article URL is outside the Pages base path')
  }
  for (let i = 0; i < baseSegments.length; i++) {
    if (segments[i] !== baseSegments[i]) {
      return fail('PREFIX_MISMATCH', 'Article URL does not match the Pages base path prefix')
    }
  }

  const routeSegments = segments.slice(baseSegments.length)
  if (routeSegments.length !== 2 || routeSegments[0] !== ARTICLE_ROUTE_SEGMENT) {
    return fail('INVALID_ARTICLE_ROUTE', 'Article URL must point directly to /posts/{stem}')
  }

  return buildArticleIdentityFromParsedBase(base.value, routeSegments[1]!)
}

/**
 * Normalize a stored GitHub Discussion title for exact pathname comparison.
 * Applies NFC normalization and removes at most one legacy trailing slash.
 * NEVER URL-decodes the title so literal "%41" and "A" stay distinct.
 */
export function normalizeDiscussionTitle(rawTitle: string): string {
  const nfc = rawTitle.normalize('NFC')
  if (nfc.length > 1 && nfc.endsWith('/')) {
    return nfc.slice(0, -1)
  }
  return nfc
}

/**
 * Compare a GitHub Discussion title against an article's canonical decoded pathname.
 */
export function matchDiscussionTitle(discussionTitle: string, canonicalDecodedPath: string): boolean {
  return normalizeDiscussionTitle(discussionTitle) === canonicalDecodedPath.normalize('NFC')
}
