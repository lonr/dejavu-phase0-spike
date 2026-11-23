import { EMBED_PROTOCOL_VERSION, type ThemeMode } from './constants'

export interface FrameReadyMessage {
  v: typeof EMBED_PROTOCOL_VERSION
  type: 'ready'
}

export interface FrameThemeMessage {
  v: typeof EMBED_PROTOCOL_VERSION
  type: 'theme'
  theme: ThemeMode
}

export interface FrameResizeMessage {
  v: typeof EMBED_PROTOCOL_VERSION
  type: 'resize'
  height: number
}

export type FrameChildMessage = FrameReadyMessage | FrameResizeMessage
export type FrameParentMessage = FrameThemeMessage
export type FrameMessage = FrameChildMessage | FrameParentMessage

export const FRAME_MIN_HEIGHT_PX = 160
export const FRAME_MAX_HEIGHT_PX = 20000

export function parseFrameChildMessage(data: unknown): FrameChildMessage | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const msg = data as Record<string, unknown>
  if (msg.v !== EMBED_PROTOCOL_VERSION) return null
  if (msg.type === 'ready') {
    return { v: EMBED_PROTOCOL_VERSION, type: 'ready' }
  }
  if (msg.type === 'resize') {
    if (typeof msg.height !== 'number' || !Number.isFinite(msg.height) || msg.height <= 0) {
      return null
    }
    return {
      v: EMBED_PROTOCOL_VERSION,
      type: 'resize',
      height: Math.min(Math.max(Math.ceil(msg.height), FRAME_MIN_HEIGHT_PX), FRAME_MAX_HEIGHT_PX),
    }
  }
  return null
}

export function parseFrameParentMessage(data: unknown): FrameParentMessage | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const msg = data as Record<string, unknown>
  if (msg.v !== EMBED_PROTOCOL_VERSION) return null
  if (msg.type === 'theme' && (msg.theme === 'light' || msg.theme === 'dark')) {
    return { v: EMBED_PROTOCOL_VERSION, type: 'theme', theme: msg.theme }
  }
  return null
}
