from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv(".env")

# Connect to MongoDB
client = MongoClient(os.getenv("MONGODB_URI"))
db = client["sales_agent"]
messages_collection = db["messages"]

print("\n=== ALL CONVERSATIONS IN DATABASE ===\n")

# Get all messages grouped by room_id
pipeline = [
    {"$sort": {"received_at": 1}},
    {"$group": {
        "_id": "$room_id",
        "messages": {"$push": "$$ROOT"},
        "count": {"$sum": 1}
    }}
]

conversations = list(messages_collection.aggregate(pipeline))

if not conversations:
    print("No conversations found in database.")
else:
    for conv in conversations:
        room_id = conv["_id"]
        messages = conv["messages"]
        
        print(f"\n{'='*60}")
        print(f"Room: {room_id}")
        print(f"Total Messages: {conv['count']}")
        print(f"{'='*60}\n")
        
        for msg in messages:
            speaker = msg.get('speaker', 'unknown').upper()
            text = msg.get('text', '')
            
            print(f"{speaker}: {text}")
            
            # Show analysis if it exists
            if 'analysis' in msg and msg['analysis']:
                analysis = msg['analysis']
                sentiment = analysis.get('sentiment', 'N/A')
                confidence = analysis.get('confidence', 0)
                recommendation = analysis.get('recommendation_to_salesperson', 'N/A')
                
                print(f"  └─ 📊 Sentiment: {sentiment.upper()} ({int(confidence*100)}% confidence)")
                print(f"  └─ 💡 Recommendation: {recommendation}")
            
            print()
        
        print()

print(f"\n{'='*60}\n")