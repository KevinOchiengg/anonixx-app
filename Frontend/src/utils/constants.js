// Coins
export const COIN_REWARDS = {
  DAILY_LOGIN: 10,
  CREATE_POST: 5,
  RECEIVE_LIKE: 2,
  RECEIVE_COMMENT: 3,
  STREAK_BONUS: 50,
  INVITE_FRIEND: 100,
}

export const COIN_COSTS = {
  PREMIUM_REACTION: 10,
  VIRTUAL_GIFT: 50,
  BOOST_POST: 100,
  REVEAL_IDENTITY: 200,
}

// Media
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB
export const MAX_VOICE_DURATION = 60 // seconds

// Dating
export const SWIPE_THRESHOLD = 120

// Moderation
export const REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Hate Speech',
  'Violence',
  'Sexual Content',
  'Misinformation',
  'Other',
]
