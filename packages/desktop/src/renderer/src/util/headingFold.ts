export interface HeadingFoldItem {
  lvl?: number | null
  content?: unknown
  foldKey?: string
  [key: string]: unknown
}

const normalizeHeadingContent = (content: unknown): string => {
  return String(content ?? '').trim().replace(/\s+/g, ' ')
}

export const getHeadingFoldBaseKey = (item: Pick<HeadingFoldItem, 'lvl' | 'content'>): string => {
  return `${item.lvl ?? 0}|${normalizeHeadingContent(item.content)}`
}

export const getHeadingFoldKey = (
  item: Pick<HeadingFoldItem, 'lvl' | 'content'>,
  occurrence: number
): string => {
  return `${getHeadingFoldBaseKey(item)}|${occurrence}`
}

export const addHeadingFoldKeys = <T extends HeadingFoldItem>(items: T[]): Array<T & {
  foldKey: string
}> => {
  const occurrences: Record<string, number> = {}

  return items.map((item) => {
    const baseKey = getHeadingFoldBaseKey(item)
    const occurrence = (occurrences[baseKey] ?? 0) + 1
    occurrences[baseKey] = occurrence

    return {
      ...item,
      foldKey: getHeadingFoldKey(item, occurrence)
    }
  })
}

export const normalizeHeadingFoldKeys = (keys: unknown): string[] => {
  if (!Array.isArray(keys)) return []

  return Array.from(new Set(keys.filter((key): key is string => typeof key === 'string')))
}
