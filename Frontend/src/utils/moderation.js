const BAD_WORDS = [
  // Add your moderation keywords
  'spam',
  'scam',
  'fake',
]

export const checkForBadWords = (text) => {
  const lowerText = text.toLowerCase()
  return BAD_WORDS.some((word) => lowerText.includes(word))
}

export const moderateContent = (content) => {
  const hasBadWords = checkForBadWords(content)

  return {
    isAllowed: !hasBadWords,
    reason: hasBadWords ? 'Contains inappropriate content' : null,
    score: hasBadWords ? 0.2 : 0.9,
  }
}

export const sanitizeInput = (text) => {
  return text
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
}
