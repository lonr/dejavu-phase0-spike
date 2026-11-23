import fs from 'node:fs'
import path from 'node:path'
import {
  buildArticleIdentity,
  parsePagesBaseUrl,
  stemFromMarkdownFilename,
  type ArticleIdentity,
} from '@dejavu/contract'

export interface SpikePost {
  stem: string
  title: string
  description: string
  source: 'fixture' | 'content-dir'
  identity: ArticleIdentity
}

const DEFAULT_FIXTURE_POSTS: ReadonlyArray<{ stem: string; title: string; description: string }> = [
  {
    stem: 'hello',
    title: 'Hello Phase 0 Spike',
    description: 'Baseline ASCII slashless leaf article route verification.',
  },
  {
    stem: '猫 100%',
    title: '猫 100% — Unicode, space, and literal percent',
    description: 'Verifies UTF-8 percent-encoding, space, and literal % in GitHub Pages serving.',
  },
  {
    stem: '%2F',
    title: 'Literal %2F filename',
    description: 'Verifies double-encoded canonical path /posts/%252F vs rejected /posts/%2F.',
  },
  {
    stem: '%41',
    title: 'Literal %41 filename',
    description: 'Distinct from A.md — canonical path /posts/%2541 and title /posts/%41.',
  },
  {
    stem: 'A',
    title: 'Plain A filename',
    description: 'Distinct from %41.md — canonical path /posts/A and title /posts/A.',
  },
]

export function getSpikeBasePath(): string {
  const raw = process.env.DEJAVU_BASE_PATH?.trim() ?? ''
  const trimmed = raw.replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : ''
}

export function getSpikeBaseUrl(): string {
  const explicit = process.env.DEJAVU_BASE_URL?.trim()
  if (explicit) {
    const parsed = parsePagesBaseUrl(explicit, {
      allowHttp: true,
      allowNonStandardPort: true,
      allowLocalOrIp: true,
    })
    if (!parsed.ok) {
      throw new Error(`Invalid DEJAVU_BASE_URL "${explicit}": ${parsed.error.message}`)
    }
    return parsed.value.baseUrl
  }
  const basePath = getSpikeBasePath()
  return `https://lonr.github.io${basePath}`
}

export function loadSpikePosts(): SpikePost[] {
  const baseUrl = getSpikeBaseUrl()
  const urlOptions = { allowHttp: true, allowNonStandardPort: true, allowLocalOrIp: true }
  const seenStems = new Set<string>()
  const posts: SpikePost[] = []

  const addPost = (item: { stem: string; title: string; description: string; source: 'fixture' | 'content-dir' }) => {
    const identityResult = buildArticleIdentity({
      baseUrl,
      stem: item.stem,
      options: urlOptions,
    })
    if (!identityResult.ok) {
      throw new Error(`Invalid post stem "${item.stem}": ${identityResult.error.message}`)
    }
    const normalizedStem = identityResult.value.stem
    if (seenStems.has(normalizedStem)) return
    seenStems.add(normalizedStem)
    posts.push({
      stem: normalizedStem,
      title: item.title,
      description: item.description,
      source: item.source,
      identity: identityResult.value,
    })
  }

  if (process.env.DEJAVU_ONLY_CONTENT_DIR !== '1') {
    for (const fixture of DEFAULT_FIXTURE_POSTS) {
      addPost({ ...fixture, source: 'fixture' })
    }
  }

  const contentDir = process.env.DEJAVU_CONTENT_DIR?.trim()
  if (contentDir) {
    const postsDir = path.join(contentDir, 'posts')
    if (fs.existsSync(postsDir)) {
      const entries = fs.readdirSync(postsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (entry.name.startsWith('.')) continue
        if (!/\.md$/i.test(entry.name)) continue
        const stemResult = stemFromMarkdownFilename(entry.name)
        if (!stemResult.ok) continue
        addPost({
          stem: stemResult.value,
          title: stemResult.value,
          description: `Local content fixture from ${entry.name}`,
          source: 'content-dir',
        })
      }
    }
  }

  return posts
}

export function findSpikePostByParam(rawParam: string): SpikePost | undefined {
  const posts = loadSpikePosts()
  const normalizedRaw = rawParam.normalize('NFC')
  const direct = posts.find((p) => p.stem === normalizedRaw)
  if (direct) return direct

  // Fallback if router passes an encoded param segment
  try {
    const decoded = decodeURIComponent(rawParam).normalize('NFC')
    return posts.find((p) => p.stem === decoded)
  } catch {
    return undefined
  }
}

export function loadSpikeReadmeSummary(): { exists: boolean; preview: string } {
  const contentDir = process.env.DEJAVU_CONTENT_DIR?.trim()
  if (!contentDir) {
    return {
      exists: false,
      preview: 'No DEJAVU_CONTENT_DIR configured; showing Phase 0 README placeholder.',
    }
  }
  const readmePath = path.join(contentDir, 'README.md')
  if (!fs.existsSync(readmePath)) {
    return { exists: false, preview: `No README.md found in ${contentDir}.` }
  }
  const content = fs.readFileSync(readmePath, 'utf-8').trim()
  return {
    exists: true,
    preview: content.slice(0, 400),
  }
}
