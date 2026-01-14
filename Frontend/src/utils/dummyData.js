export const dummyUsers = [
  {
    id: 'user1',
    username: 'anonymous_fox',
    avatar: 'https://i.pravatar.cc/150?img=1',
    bio: 'Living life one echo at a time 🎭',
    coins: 1250,
    isPremium: false,
    postsCount: 42,
    reactionsCount: 328,
  },
  {
    id: 'user2',
    username: 'midnight_owl',
    avatar: 'https://i.pravatar.cc/150?img=2',
    bio: 'Night thinker, day dreamer',
    coins: 3500,
    isPremium: true,
    postsCount: 89,
    reactionsCount: 1024,
  },
]

export const dummyPosts = [
  {
    id: 'post1',
    userId: 'user1',
    username: 'anonymous_fox',
    userAvatar: 'https://i.pravatar.cc/150?img=1',
    isAnonymous: true,
    content:
      'Sometimes I wonder if being anonymous makes us more honest or just braver... 🤔',
    type: 'text',
    mediaUrl: null,
    reactions: { fire: 45, heart: 32, laugh: 12, wow: 8 },
    replies: 23,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    isTrending: true,
  },
  {
    id: 'post2',
    userId: 'user2',
    username: 'midnight_owl',
    userAvatar: 'https://i.pravatar.cc/150?img=2',
    isAnonymous: false,
    content:
      'The best conversations happen when you least expect them. Echo makes that possible every day! ✨',
    type: 'text',
    mediaUrl: null,
    reactions: { heart: 67, fire: 23, celebrate: 15 },
    replies: 18,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    isTrending: false,
  },
  {
    id: 'post3',
    userId: 'user3',
    username: 'shadow_walker',
    userAvatar: null,
    isAnonymous: true,
    content:
      'Just finished a 7-day streak on Echo! The coins are rolling in 🪙💰',
    type: 'text',
    mediaUrl: null,
    reactions: { fire: 89, clap: 45, heart: 34 },
    replies: 31,
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    isTrending: true,
  },
]

export const dummyGroups = [
  {
    id: 'group1',
    name: 'University of Nairobi',
    description:
      'Connect with fellow students, share experiences, and stay anonymous',
    category: 'education',
    memberCount: 2547,
    isPublic: true,
    icon: '🎓',
    joined: true,
  },
  {
    id: 'group2',
    name: 'Late Night Thinkers',
    description: 'For those deep 3 AM thoughts that need to be shared',
    category: 'lifestyle',
    memberCount: 8932,
    isPublic: true,
    icon: '🌙',
    joined: false,
  },
  {
    id: 'group3',
    name: 'Tech Confessions',
    description: 'Anonymous confessions from tech workers worldwide',
    category: 'tech',
    memberCount: 15420,
    isPublic: true,
    icon: '💻',
    joined: true,
  },
  {
    id: 'group4',
    name: 'Nairobi Connections',
    description: 'Meet and connect with people in Nairobi',
    category: 'local',
    memberCount: 4238,
    isPublic: true,
    icon: '📍',
    joined: false,
  },
]

export const dummyDatingProfiles = [
  {
    id: 'profile1',
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
    ],
    name: 'Sarah',
    age: 24,
    bio: 'Adventure seeker 🌍 | Coffee addict ☕ | Dog lover 🐕',
    interests: ['travel', 'photography', 'hiking', 'music'],
    distance: '3 km away',
    isRevealed: false,
  },
  {
    id: 'profile2',
    photos: [
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    ],
    name: 'Mike',
    age: 27,
    bio: 'Tech enthusiast | Gym rat 💪 | Movie buff 🎬',
    interests: ['tech', 'fitness', 'movies', 'gaming'],
    distance: '5 km away',
    isRevealed: false,
  },
  {
    id: 'profile3',
    photos: [
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    ],
    name: 'Emma',
    age: 22,
    bio: 'Artist 🎨 | Bookworm 📚 | Yoga enthusiast 🧘‍♀️',
    interests: ['art', 'reading', 'yoga', 'cooking'],
    distance: '2 km away',
    isRevealed: false,
  },
]

export const dummyChats = [
  {
    id: 'chat1',
    participant: {
      id: 'user2',
      name: 'midnight_owl',
      avatar: 'https://i.pravatar.cc/150?img=2',
    },
    lastMessage: {
      content: 'Hey! How are you doing?',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
    unreadCount: 2,
  },
  {
    id: 'chat2',
    participant: {
      id: 'user4',
      name: 'Anonymous User',
      avatar: null,
    },
    lastMessage: {
      content: 'That was a great post! 🔥',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    unreadCount: 0,
  },
  {
    id: 'chat3',
    participant: {
      id: 'user5',
      name: 'echo_lover',
      avatar: 'https://i.pravatar.cc/150?img=5',
    },
    lastMessage: {
      content: 'See you tomorrow!',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    unreadCount: 0,
  },
]

export const dummyMessages = [
  {
    id: 'msg1',
    chatId: 'chat1',
    senderId: 'user2',
    content: 'Hey! How are you doing?',
    type: 'text',
    mediaUrl: null,
    reactions: [],
    isRead: true,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'msg2',
    chatId: 'chat1',
    senderId: 'user1',
    content: "I'm good! Just browsing the Echo feed. You?",
    type: 'text',
    mediaUrl: null,
    reactions: ['❤️'],
    isRead: true,
    createdAt: new Date(Date.now() - 1500000).toISOString(),
  },
  {
    id: 'msg3',
    chatId: 'chat1',
    senderId: 'user2',
    content: 'Same here! Found some amazing confessions today 😄',
    type: 'text',
    mediaUrl: null,
    reactions: [],
    isRead: false,
    createdAt: new Date(Date.now() - 900000).toISOString(),
  },
]

export const dummyMatches = [
  {
    id: 'match1',
    profile: dummyDatingProfiles[0],
    matchedAt: new Date(Date.now() - 3600000).toISOString(),
    isRevealed: false,
  },
  {
    id: 'match2',
    profile: dummyDatingProfiles[2],
    matchedAt: new Date(Date.now() - 86400000).toISOString(),
    isRevealed: true,
  },
]
