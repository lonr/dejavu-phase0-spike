import { describe, expect, it } from 'vitest'
import fixtures from '../fixtures/conformance-v1.json' with { type: 'json' }
import {
  buildArticleIdentity,
  countCodePoints,
  isSafePublicOrigin,
  matchDiscussionTitle,
  normalizeDiscussionTitle,
  parseFrameChildMessage,
  parseFrameParentMessage,
  parseIncomingArticleUrl,
  parsePagesBaseUrl,
  sha256Hex,
  stemFromMarkdownFilename,
  validateOptInRecord,
} from '../src/index'

describe('sha256Hex', () => {
  it('matches Web Crypto SHA-256 across ASCII, Unicode, empty, and multi-block strings', async () => {
    const encoder = new TextEncoder()
    const samples = [
      '',
      'abc',
      '/posts/First',
      '/journal/posts/猫 100%',
      '/posts/%2F',
      '/posts/%41',
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(64),
      '猫'.repeat(100),
    ]
    for (const sample of samples) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(sample))
      const expected = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
      expect(sha256Hex(sample)).toBe(expected)
    }
  })
})

describe('conformance-v1: article identity vectors', () => {
  for (const vector of fixtures.articleIdentityVectors) {
    it(vector.name, () => {
      const stemResult = stemFromMarkdownFilename(vector.filename)
      expect(stemResult.ok).toBe(true)
      if (!stemResult.ok) return

      const identityResult = buildArticleIdentity({
        baseUrl: vector.baseUrl,
        stem: stemResult.value,
      })
      expect(identityResult.ok).toBe(true)
      if (!identityResult.ok) return

      expect(identityResult.value).toMatchObject(vector.expected)

      // Round-trip: parsing the generated canonicalUrl reproduces the identical ArticleIdentity.
      const parsed = parseIncomingArticleUrl(identityResult.value.canonicalUrl, vector.baseUrl)
      expect(parsed).toEqual(identityResult)
    })
  }
})

describe('conformance-v1: incoming valid article URL vectors', () => {
  for (const vector of fixtures.incomingValidVectors) {
    it(vector.name, () => {
      const result = parseIncomingArticleUrl(vector.incomingUrl, vector.pagesBaseUrl)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.canonicalUrl).toBe(vector.expectedCanonicalUrl)
      expect(result.value.decodedPath).toBe(vector.expectedDecodedPath)
      expect(result.value.discussionTitle).toBe(vector.expectedDecodedPath)
    })
  }
})

describe('conformance-v1: incoming rejected article URL vectors', () => {
  for (const vector of fixtures.incomingRejectedVectors) {
    it(vector.name, () => {
      const result = parseIncomingArticleUrl(vector.incomingUrl, vector.pagesBaseUrl)
      expect(result.ok).toBe(false)
      if (result.ok) return

      expect(result.error.code).toBe(vector.expectedErrorCode)
    })
  }
})

describe('conformance-v1: discussion title comparison vectors', () => {
  for (const vector of fixtures.discussionTitleMatchVectors) {
    it(vector.name, () => {
      expect(matchDiscussionTitle(vector.discussionTitle, vector.decodedPath)).toBe(vector.matches)
    })
  }

  it('preserves "/" when normalizing root slash', () => {
    expect(normalizeDiscussionTitle('/')).toBe('/')
  })
})

describe('Pages base URL & egress safety', () => {
  it('rejects localhost, IP literals, and Worker self-origin', () => {
    expect(isSafePublicOrigin('https://octo.github.io')).toBe(true)
    expect(isSafePublicOrigin('https://blog.example.com')).toBe(true)
    expect(isSafePublicOrigin('https://localhost')).toBe(false)
    expect(isSafePublicOrigin('https://sub.localhost')).toBe(false)
    expect(isSafePublicOrigin('https://127.0.0.1')).toBe(false)
    expect(isSafePublicOrigin('https://0x7f000001')).toBe(false)
    expect(isSafePublicOrigin('https://[::1]')).toBe(false)
    expect(isSafePublicOrigin('https://comments.example', 'https://comments.example')).toBe(false)
    expect(isSafePublicOrigin('http://octo.github.io')).toBe(false)
  })

  it('rejects query or fragment on Pages base URL', () => {
    const withQuery = parsePagesBaseUrl('https://octo.github.io/journal?x=1')
    expect(withQuery.ok).toBe(false)
    if (!withQuery.ok) expect(withQuery.error.code).toBe('UNEXPECTED_QUERY_OR_FRAGMENT')
  })

  it('supports local development overrides when explicitly opted in', () => {
    const parsed = parseIncomingArticleUrl('http://localhost:5173/posts/hello', 'http://localhost:5173', {
      allowHttp: true,
      allowNonStandardPort: true,
      allowLocalOrIp: true,
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.canonicalUrl).toBe('http://localhost:5173/posts/hello')
      expect(parsed.value.decodedPath).toBe('/posts/hello')
    }
  })
})

describe('opt-in record v1 validation', () => {
  const expected = { repoId: 42, decodedPath: '/journal/posts/猫 100%' }

  it('accepts valid opt-in record including descriptions up to 1,000 Unicode code points', () => {
    // 1000 emoji (each is 2 UTF-16 code units, 1 Unicode code point)
    const emojiDesc = '😀'.repeat(1000)
    expect(emojiDesc.length).toBe(2000)
    expect(countCodePoints(emojiDesc)).toBe(1000)

    const result = validateOptInRecord(
      { v: 1, repoId: 42, path: '/journal/posts/猫 100%', description: emojiDesc },
      expected,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects oversized descriptions (> 1,000 code points), blank descriptions, and mismatched metadata', () => {
    const tooLong = validateOptInRecord(
      { v: 1, repoId: 42, path: '/journal/posts/猫 100%', description: 'a'.repeat(1001) },
      expected,
    )
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.error.code).toBe('INVALID_DESCRIPTION')

    const blank = validateOptInRecord(
      { v: 1, repoId: 42, path: '/journal/posts/猫 100%', description: '   \n\t  ' },
      expected,
    )
    expect(blank.ok).toBe(false)
    if (!blank.ok) expect(blank.error.code).toBe('INVALID_DESCRIPTION')

    const wrongRepo = validateOptInRecord(
      { v: 1, repoId: 99, path: '/journal/posts/猫 100%', description: 'Hello' },
      expected,
    )
    expect(wrongRepo.ok).toBe(false)
    if (!wrongRepo.ok) expect(wrongRepo.error.code).toBe('REPO_ID_MISMATCH')

    const wrongPath = validateOptInRecord(
      { v: 1, repoId: 42, path: '/posts/other', description: 'Hello' },
      expected,
    )
    expect(wrongPath.ok).toBe(false)
    if (!wrongPath.ok) expect(wrongPath.error.code).toBe('PATH_MISMATCH')

    const wrongVersion = validateOptInRecord(
      { v: 2, repoId: 42, path: '/journal/posts/猫 100%', description: 'Hello' },
      expected,
    )
    expect(wrongVersion.ok).toBe(false)
    if (!wrongVersion.ok) expect(wrongVersion.error.code).toBe('UNSUPPORTED_VERSION')
  })
})

describe('frame protocol v1 guards', () => {
  it('validates ready, resize, and theme messages while ignoring invalid shapes', () => {
    expect(parseFrameChildMessage({ v: 1, type: 'ready' })).toEqual({ v: 1, type: 'ready' })
    expect(parseFrameChildMessage({ v: 1, type: 'resize', height: 420.2 })).toEqual({
      v: 1,
      type: 'resize',
      height: 421,
    })
    expect(parseFrameChildMessage({ v: 1, type: 'resize', height: -5 })).toBeNull()
    expect(parseFrameChildMessage({ v: 1, type: 'resize', height: Number.NaN })).toBeNull()
    expect(parseFrameChildMessage({ v: 2, type: 'ready' })).toBeNull()

    expect(parseFrameParentMessage({ v: 1, type: 'theme', theme: 'dark' })).toEqual({
      v: 1,
      type: 'theme',
      theme: 'dark',
    })
    expect(parseFrameParentMessage({ v: 1, type: 'theme', theme: 'auto' })).toBeNull()
  })
})
