export const EMBED_PROTOCOL_VERSION = 1 as const
export const OPT_IN_RECORD_VERSION = 1 as const

export const ARTICLE_ROUTE_SEGMENT = 'posts' as const
export const OPT_IN_ASSET_PREFIX = 'assets/_dejavu/comments' as const

export const OPT_IN_MAX_BYTES = 4096
export const DESCRIPTION_MAX_CODE_POINTS = 1000
export const DESCRIPTION_AUTO_TRUNCATE_CODE_POINTS = 280

export const RESERVED_ROUTE_ROOTS = [
  'posts',
  'repositories',
  'readme',
  'assets',
  'feed.xml',
  '404.html',
  '_dejavu',
] as const

export type ReservedRouteRoot = (typeof RESERVED_ROUTE_ROOTS)[number]

export const REACTION_CONTENTS = [
  'THUMBS_UP',
  'THUMBS_DOWN',
  'LAUGH',
  'HOORAY',
  'CONFUSED',
  'HEART',
  'ROCKET',
  'EYES',
] as const

export type ReactionContent = (typeof REACTION_CONTENTS)[number]

export type ThemeMode = 'light' | 'dark'
