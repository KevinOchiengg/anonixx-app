
import json
from pymongo import MongoClient
from datetime import datetime, timedelta
import random

print("🔥 Importing VIRAL seed posts...")

# Connect
client = MongoClient("mongodb+srv://kevin_the_CEO:pTDiXHMJ0QFJ1K6O@anonimax-cluster.4ur2wri.mongodb.net/")
db = client["anonispill"]

# Delete old seed posts
db.posts.delete_many({"is_seed_content": True})
print("✅ Cleared old seed posts")

# Load JSON
with open('seed_posts.json', 'r', encoding='utf-8') as f:
    posts = json.load(f)

print(f"📝 Loaded {len(posts)} viral posts")

# Seed user
seed_user_id = "000000000000000000000001"

# Anonymous names (50 unique names)
names = [
    "Silent Dreamer", "Night Thinker", "Quiet Observer", "Deep Soul",
    "Wandering Mind", "Hidden Voice", "Peaceful Heart", "Lost Thoughts",
    "Gentle Spirit", "Calm Presence", "Soft Whisper", "Lone Star",
    "Distant Echo", "Fading Light", "Quiet Storm", "Still Waters",
    "Empty Canvas", "Broken Compass", "Tired Soul", "Heavy Heart",
    "Scattered Mind", "Restless Spirit", "Numb Feelings", "Raw Emotions",
    "Honest Stranger", "Brave Coward", "Hopeful Pessimist", "Strong Weakness",
    "Loud Silence", "Bright Darkness", "Sweet Pain", "Cold Comfort",
    "False Hope", "True Lies", "Perfect Mess", "Beautiful Chaos",
    "Careful Reckless", "Wise Fool", "Young Old Soul", "Awake Dreamer",
    "Found Lost", "Happy Sad", "Living Ghost", "Dead Alive",
    "Free Prisoner", "Rich Poor", "Loved Lonely", "Known Stranger",
    "Clear Confusion", "Simple Complexity"
]

# Transform posts
transformed = []
base_time = datetime.now() - timedelta(days=30)

for i, post in enumerate(posts):
    new_post = {
        "user_id": seed_user_id,
        "content": post["content"],
        "post_type": "text",
        "images": [],
        "audio_url": None,
        "video_url": None,
        "topics": post["topics"],
        "is_anonymous": True,
        "anonymous_name": random.choice(names),
        "reactions": {},
        "reactions_count": random.randint(0, 50) if random.random() > 0.4 else 0,
        "comments_count": random.randint(0, 15) if random.random() > 0.6 else 0,
        "views_count": random.randint(50, 500),
        "is_deleted": False,
        "created_at": base_time + timedelta(
            days=random.randint(0, 30),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59)
        ),
        "is_seed_content": True,
        "context": post.get("context", "universal")
    }
    transformed.append(new_post)
    
    if (i + 1) % 50 == 0:
        print(f"✨ Processed {i + 1}/{len(posts)} posts...")

# Sort by created_at
transformed.sort(key=lambda x: x["created_at"])

# Insert
result = db.posts.insert_many(transformed)
print(f"\n🔥 Imported {len(result.inserted_ids)} VIRAL posts!")

# Stats
print(f"📊 Total posts: {db.posts.count_documents({})}")
print(f"📊 Seed posts: {db.posts.count_documents({'is_seed_content': True})}")
print(f"🇰🇪 Kenya context: {db.posts.count_documents({'context': 'kenya'})}")
print(f"🌍 Universal: {db.posts.count_documents({'context': 'universal'})}")

# Sample
sample = db.posts.find_one({"is_seed_content": True})
print(f"\n📄 Sample post:")
print(f"   {sample['content'][:80]}...")
print(f"   Topics: {sample['topics']}")
print(f"   Reactions: {sample['reactions_count']}")

print("\n🎉 VIRAL POSTS READY! Your feed is about to be LIT 🔥")