import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from bson import ObjectId
from passlib.context import CryptContext


# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

# UPDATE THIS WITH YOUR MONGODB URL FROM .env
MONGODB_URL = "mongodb+srv://kevin_the_CEO:pTDiXHMJ0QFJ1K6O@anonimax-cluster.4ur2wri.mongodb.net/"
DATABASE_NAME = "anonispill"


async def seed_database():
    print("Seeding database...")
    
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    # Clear existing data
    await db["users"].delete_many({})
    await db["posts"].delete_many({})
    
    # Create test users
    users = []
    user_ids = []
    
    for i in range(5):
        password_hash = pwd_context.hash("trillions")
        user = {
            "_id": ObjectId(),
            "anonymous_name": f"TestUser{i+1}",
            "username": f"billions{i+1}",
            "email": f"billions{i+1}@echo.com",
            "password_hash": password_hash,
            "avatar": f"https://i.pravatar.cc/150?img={i+1}",
            "bio": f"Hello! I'm a billionare user {i+1}",
            "coin_balance": 500 + (i * 100),
            "is_premium": i == 0,
            "is_anonymous": False,
            "created_at": datetime.utcnow(),
        }
        users.append(user)
        user_ids.append(str(user["_id"]))
    
    await db["users"].insert_many(users)
    print(f" Created {len(users)} users")
    
    # Create test posts
    posts = []
    post_contents = [
        "Just joined Echo! This is amazing 🎉",
        "Anyone else loving the anonymous feature? ",
        "First post here, hello everyone! ",
        "This platform is exactly what we needed",
        "Can't believe I found this gem ",
        "Anyone want to chat? DM me!",
        "Love the community here already ",
        "The future of social media is here",
        "Finally, a place to be myself",
        "This is going to be huge! ",
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
    print(f" Created {len(posts)} posts")
    
    print("\n Database seeded successfully!")
    print(f"\n Test Login Credentials:")
    print(f"   Email: test1@echo.com")
    print(f"   Password: password123")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_database())

    


    