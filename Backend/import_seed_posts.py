import json
from pymongo import MongoClient
from datetime import datetime
import os

# Connect to MongoDB
client = MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017/"))
db = client[os.getenv("MONGODB_DB", "anonispill")]

# Read seed posts
with open('seed_posts.json', 'r') as f:
    posts = json.load(f)

# Add timestamps and user_id
for post in posts:
    post['created_at'] = datetime.utcnow()
    post['updated_at'] = datetime.utcnow()
    post['user_id'] = "seed_user_id"  # Replace with actual seed user ID
    post['is_seed_content'] = True  # Mark as seed content
    post['likes_count'] = 0
    post['comments_count'] = 0
    post['shares_count'] = 0

# Insert posts
result = db.posts.insert_many(posts)
print(f"✅ Imported {len(result.inserted_ids)} seed posts!")