from pymongo import MongoClient

print("🗑️  Deleting all seed posts...")

client = MongoClient("mongodb+srv://kevin_the_CEO:pTDiXHMJ0QFJ1K6O@anonimax-cluster.4ur2wri.mongodb.net/")
db = client["anonispill"]

# Delete seed posts
result = db.posts.delete_many({"is_seed_content": True})
print(f"✅ Deleted {result.deleted_count} seed posts")

# Check remaining
total = db.posts.count_documents({})
print(f"📊 Remaining posts: {total}")

print("🎉 Ready for new viral posts!")