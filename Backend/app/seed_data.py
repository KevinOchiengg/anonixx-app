import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from bson import ObjectId
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# UPDATE THIS WITH YOUR MONGODB URL
MONGODB_URL = "mongodb+srv://echouser:EchoPass123!@echo-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority"
DATABASE_NAME = "anonispill"


async def seed_database():
    print("🌱 Seeding database...")
    
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    # Clear existing data
    await db["users"].delete_many({})
    await db["posts"].delete_many({})
    await db["groups"].delete_many({})
    
    # Create users
    users = []
    user_ids = []
    
    for i in range(5):
        password_hash = pwd_context.hash("password123")
        user = {
            "_id": ObjectId(),
            "anonymous_name": f"TestUser{i+1}",
            "username": f"testuser{i+1}",
            "email": f"test{i+1}@echo.com",
            "password_hash": password_hash,
            "avatar": f"https://i.pravatar.cc/150?img={i+1}",
            "bio": f"Hello! I'm test user {i+1}",
            "coin_balance": 500 + (i * 100),
            "is_premium": i == 0,  # First user is premium
            "is_anonymous": False,
            "created_at": datetime.utcnow(),
        }
        users.append(user)
        user_ids.append(str(user["_id"]))
    
    await db["users"].insert_many(users)
    print(f"✅ Created {len(users)} users")
    
    # Create posts
    posts = []
    post_contents = [
        "Just joined Echo! This is amazing 🎉",
        "Anyone else loving the anonymous feature? 🎭",
        "First post here, hello everyone! 👋",
        "This platform is exactly what we needed",
        "Can't believe I found this gem 💎",
        "Anyone want to chat? DM me!",
        "Love the community here already ❤️",
        "The future of social media is here",
        "Finally, a place to be myself",
        "This is going to be huge! 🚀",
    ]
    
    for i, content in enumerate(post_contents):
        post = {
            "_id": ObjectId(),
            "user_id": user_ids[i % len(user_ids)],
            "content": content,
            "media_url": f"https://picsum.photos/400/300?random={i}" if i % 3 == 0 else None,
            "reactions": {
                "like": (i * 5) % 20,
                "love": (i * 3) % 15,
                "fire": (i * 2) % 10,
            },
            "reply_count": i % 5,
            "is_deleted": False,
            "created_at": datetime.utcnow(),
        }
        posts.append(post)
    
    await db["posts"].insert_many(posts)
    print(f"✅ Created {len(posts)} posts")
    
    # Create groups
    groups = []
    group_data = [
        {
            "name": "Tech Enthusiasts",
            "description": "Discuss the latest in technology",
            "icon": "💻",
            "category": "Tech",
            "is_public": True,
        },
        {
            "name": "Book Club",
            "description": "Share and discuss your favorite books",
            "icon": "📚",
            "category": "Hobbies",
            "is_public": True,
        },
        {
            "name": "Fitness Goals",
            "description": "Stay motivated and share your fitness journey",
            "icon": "💪",
            "category": "Sports",
            "is_public": True,
        },
    ]
    
    for g in group_data:
        group = {
            "_id": ObjectId(),
            **g,
            "creator_id": user_ids[0],
            "members": user_ids[:3],
            "member_count": 3,
            "moderators": [user_ids[0]],
            "created_at": datetime.utcnow(),
        }
        groups.append(group)
    
    await db["groups"].insert_many(groups)
    print(f"✅ Created {len(groups)} groups")
    
    print("\n✨ Database seeded successfully!")
    print(f"\n📧 Test Login Credentials:")
    print(f"   Email: test1@echo.com")
    print(f"   Password: password123")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_database())