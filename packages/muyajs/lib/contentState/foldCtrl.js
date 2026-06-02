const HEADING_REG = /^h[1-6]$/

const getHeadingLevel = (block) => {
  return HEADING_REG.test(block.type) ? Number(block.type.slice(1)) : -1
}

const getFirstTextBlock = (block) => {
  if (!block) return null
  if (typeof block.text === 'string') return block

  for (const child of block.children) {
    const textBlock = getFirstTextBlock(child)
    if (textBlock) return textBlock
  }

  return null
}

const getHeadingContent = (block) => {
  const textBlock = getFirstTextBlock(block && block.children ? block.children[0] : block)
  if (!textBlock || typeof textBlock.text !== 'string') return ''

  return block.headingStyle === 'setext'
    ? textBlock.text.trim()
    : textBlock.text.replace(/^\s*#{1,6}\s{1,}/, '').trim()
}

const getHeadingRefKey = (level, content) => `${level}\u0000${content}`

const getHeadingRefLevel = (ref) => {
  const level = Number(ref && (ref.lvl ?? ref.level))
  return level >= 1 && level <= 6 ? level : null
}

const getHeadingRefContent = (ref) => {
  if (!ref) return null
  if (typeof ref.content === 'string') return ref.content
  if (typeof ref.text === 'string') return ref.text
  return null
}

const dispatchFoldStateChange = (contentState) => {
  contentState.muya.eventCenter.dispatch('stateChange')
}

const foldCtrl = (ContentState) => {
  ContentState.prototype.isHeadingBlock = function(block) {
    return !!block && HEADING_REG.test(block.type)
  }

  ContentState.prototype.isHeadingFolded = function(block) {
    return this.isHeadingBlock(block) && this.foldedHeadings.has(block.key)
  }

  ContentState.prototype.refreshFoldHiddenBlocks = function() {
    const hiddenBlocks = new Map()

    if (this.foldedHeadings.size === 0) {
      this.foldHiddenBlocks = hiddenBlocks
      return
    }

    const foldStack = []
    for (const block of this.blocks) {
      const level = getHeadingLevel(block)

      if (level > 0) {
        while (foldStack.length && level <= foldStack[foldStack.length - 1].level) {
          foldStack.pop()
        }
      }

      const foldedParent = foldStack.length ? foldStack[foldStack.length - 1].heading : null
      if (foldedParent && block !== foldedParent) {
        hiddenBlocks.set(block.key, foldedParent)
      }

      if (level > 0 && this.isHeadingFolded(block)) {
        foldStack.push({ level, heading: block })
      }
    }

    this.foldHiddenBlocks = hiddenBlocks
  }

  ContentState.prototype.getFoldedHeadingRefs = function() {
    const refs = []
    const seen = new Map()

    for (const block of this.blocks) {
      const level = getHeadingLevel(block)
      if (level < 1) continue

      const content = getHeadingContent(block)
      const refKey = getHeadingRefKey(level, content)
      const occurrence = (seen.get(refKey) || 0) + 1
      seen.set(refKey, occurrence)

      if (this.isHeadingFolded(block)) {
        refs.push({ lvl: level, content, occurrence })
      }
    }

    return refs
  }

  ContentState.prototype.setFoldedHeadingRefs = function(refs = []) {
    this.clearHeadingFolds()
    if (!Array.isArray(refs) || refs.length === 0) return

    const wanted = new Map()
    for (const ref of refs) {
      const level = getHeadingRefLevel(ref)
      const content = getHeadingRefContent(ref)
      const occurrence = Number(ref && ref.occurrence)

      if (!level || content === null || !Number.isInteger(occurrence) || occurrence < 1) continue

      const refKey = getHeadingRefKey(level, content)
      if (!wanted.has(refKey)) {
        wanted.set(refKey, new Set())
      }
      wanted.get(refKey).add(occurrence)
    }

    const seen = new Map()
    for (const block of this.blocks) {
      const level = getHeadingLevel(block)
      if (level < 1) continue

      const content = getHeadingContent(block)
      const refKey = getHeadingRefKey(level, content)
      const occurrence = (seen.get(refKey) || 0) + 1
      seen.set(refKey, occurrence)

      if (wanted.get(refKey)?.has(occurrence)) {
        this.foldedHeadings.add(block.key)
      }
    }

    this.refreshFoldHiddenBlocks()
  }

  ContentState.prototype.getSectionBlocks = function(heading) {
    const level = getHeadingLevel(heading)
    const sectionBlocks = []
    let block = this.getBlock(heading.nextSibling)

    while (block) {
      const blockLevel = getHeadingLevel(block)
      if (blockLevel > 0 && blockLevel <= level) {
        break
      }

      sectionBlocks.push(block)
      block = this.getBlock(block.nextSibling)
    }

    return sectionBlocks
  }

  ContentState.prototype.getFoldHeadingForBlock = function(block) {
    if (!block || this.foldedHeadings.size === 0) return null

    const outmostBlock = block.parent ? this.findOutMostBlock(block) : block
    const hiddenHeading = this.foldHiddenBlocks && this.foldHiddenBlocks.get(outmostBlock.key)
    if (hiddenHeading) return hiddenHeading

    let candidate = this.getBlock(outmostBlock.preSibling)
    let minCloserHeadingLevel = Infinity

    while (candidate) {
      const level = getHeadingLevel(candidate)

      if (level > 0) {
        if (level < minCloserHeadingLevel && this.isHeadingFolded(candidate)) {
          return candidate
        }

        minCloserHeadingLevel = Math.min(minCloserHeadingLevel, level)
      }

      candidate = this.getBlock(candidate.preSibling)
    }

    return null
  }

  ContentState.prototype.isBlockHiddenByFold = function(block) {
    if (!block || this.foldedHeadings.size === 0) return false

    const outmostBlock = block.parent ? this.findOutMostBlock(block) : block
    return outmostBlock === block && this.foldHiddenBlocks.has(outmostBlock.key)
  }

  ContentState.prototype.moveCursorToHeading = function(heading) {
    const textBlock = getFirstTextBlock(heading)
    if (!textBlock) return

    this.cursor = {
      noHistory: true,
      start: {
        key: textBlock.key,
        offset: 0
      },
      end: {
        key: textBlock.key,
        offset: 0
      },
      isEdit: false
    }
  }

  ContentState.prototype.ensureCursorVisible = function() {
    if (this.foldedHeadings.size === 0) return

    const { start, end } = this.cursor
    const startBlock = this.getBlock(start ? start.key : null)
    const endBlock = this.getBlock(end ? end.key : null)
    const startHeading = this.getFoldHeadingForBlock(startBlock)
    const endHeading = this.getFoldHeadingForBlock(endBlock)

    if (startHeading || endHeading) {
      this.moveCursorToHeading(startHeading || endHeading)
    }
  }

  ContentState.prototype.unfoldBlock = function(block) {
    let heading = this.getFoldHeadingForBlock(block)
    let didUnfold = false

    while (heading) {
      this.foldedHeadings.delete(heading.key)
      didUnfold = true
      this.refreshFoldHiddenBlocks()
      heading = this.getFoldHeadingForBlock(heading)
    }

    return didUnfold
  }

  ContentState.prototype.unfoldBlockByKey = function(key) {
    const block = this.getBlock(key)
    const didUnfold = this.unfoldBlock(block)

    if (didUnfold) {
      this.render(false)
      dispatchFoldStateChange(this)
    }

    return didUnfold
  }

  ContentState.prototype.toggleHeadingFold = function(heading) {
    if (!this.isHeadingBlock(heading)) return

    if (this.isHeadingFolded(heading)) {
      this.foldedHeadings.delete(heading.key)
    } else {
      this.foldedHeadings.add(heading.key)
      this.refreshFoldHiddenBlocks()
      this.ensureCursorVisible()
    }

    this.render()
    dispatchFoldStateChange(this)
  }

  ContentState.prototype.foldAllHeadings = function() {
    for (const block of this.blocks) {
      if (this.isHeadingBlock(block)) {
        this.foldedHeadings.add(block.key)
      }
    }

    this.refreshFoldHiddenBlocks()
    this.ensureCursorVisible()
    this.render()
    dispatchFoldStateChange(this)
  }

  ContentState.prototype.unfoldAllHeadings = function() {
    this.foldedHeadings.clear()
    this.refreshFoldHiddenBlocks()
    this.render()
    dispatchFoldStateChange(this)
  }

  ContentState.prototype.clearHeadingFolds = function() {
    this.foldedHeadings.clear()
    this.refreshFoldHiddenBlocks()
  }
}

export default foldCtrl
