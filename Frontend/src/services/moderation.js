import { moderationAPI } from './api'

const BANNED_WORDS = [
  // Add comprehensive list of banned words
  'spam',
  'scam',
  'fake',
  'bot',
]

const SUSPICIOUS_PATTERNS = [
  /\b(click here|free money|earn \$\d+)\b/gi,
  /\b(viagra|casino|lottery)\b/gi,
  /(https?:\/\/[^\s]+){3,}/gi, // Multiple URLs
]

export const checkContentForViolations = (content) => {
  const violations = []
  const lowerContent = content.toLowerCase()

  // Check for banned words
  BANNED_WORDS.forEach((word) => {
    if (lowerContent.includes(word)) {
      violations.push({
        type: 'banned_word',
        word,
        severity: 'medium',
      })
    }
  })

  // Check for suspicious patterns
  SUSPICIOUS_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(content)) {
      violations.push({
        type: 'suspicious_pattern',
        pattern: index,
        severity: 'high',
      })
    }
  })

  // Check for excessive caps
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length
  if (capsRatio > 0.5 && content.length > 20) {
    violations.push({
      type: 'excessive_caps',
      severity: 'low',
    })
  }

  // Check for excessive repeating characters
  if (/(.)\1{4,}/.test(content)) {
    violations.push({
      type: 'spam_characters',
      severity: 'low',
    })
  }

  return {
    isClean: violations.length === 0,
    violations,
    score: Math.max(0, 1 - violations.length * 0.2),
  }
}

export const moderateContentWithAI = async (content) => {
  try {
    const response = await moderationAPI.checkContent(content)
    return {
      isAllowed: response.data.isAllowed,
      score: response.data.score,
      flags: response.data.flags || [],
    }
  } catch (error) {
    console.error('AI moderation failed:', error)
    // Fallback to local moderation
    return checkContentForViolations(content)
  }
}

export const sanitizeContent = (content) => {
  return content
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 5000) // Limit length
}

export const reportContent = async (contentId, reason, additionalInfo = '') => {
  try {
    await moderationAPI.reportContent(contentId, reason)
    return { success: true }
  } catch (error) {
    console.error('Report failed:', error)
    return { success: false, error: error.message }
  }
}

export const blockUser = async (userId) => {
  try {
    await moderationAPI.blockUser(userId)
    return { success: true }
  } catch (error) {
    console.error('Block failed:', error)
    return { success: false, error: error.message }
  }
}

export const unblockUser = async (userId) => {
  try {
    await moderationAPI.unblockUser(userId)
    return { success: true }
  } catch (error) {
    console.error('Unblock failed:', error)
    return { success: false, error: error.message }
  }
}

export const validateImageContent = async (imageUri) => {
  // Implement image moderation
  // This would typically call an AI service like Google Vision, AWS Rekognition, etc.
  try {
    // Placeholder for image moderation
    console.log('Validating image:', imageUri)
    return {
      isAllowed: true,
      flags: [],
    }
  } catch (error) {
    console.error('Image validation failed:', error)
    return {
      isAllowed: false,
      flags: ['validation_error'],
    }
  }
}

export const getRateLimitInfo = () => {
  // Implement client-side rate limiting
  const limits = {
    posts_per_hour: 10,
    messages_per_minute: 30,
    reports_per_day: 5,
  }

  return limits
}
