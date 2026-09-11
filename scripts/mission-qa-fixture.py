"""Local browser QA helper. Operates only on its explicitly named temporary account."""
import sys
from datetime import timedelta
from bson import ObjectId
from app.database import feature_collection, users_collection, utc_now
user_id=ObjectId(sys.argv[1])
user=users_collection().find_one({'_id':user_id})
assert user and str(user.get('email','')).startswith('missionverify-') and user['email'].endswith('@example.com')
mode=sys.argv[2]
if mode=='seed':
    feature_collection('quests').update_one({'user_id':user_id,'date':utc_now().date().isoformat()},{'$set':{'quests':[{'id':'gratitude-hunt','completed':False},{'id':'one-quiet-minute','completed':False}]}},upsert=True)
elif mode=='elapsed':
    feature_collection('quests').update_one({'user_id':user_id,'date':utc_now().date().isoformat(),'quests.id':'one-quiet-minute'},{'$set':{'quests.$.started_at':utc_now()-timedelta(seconds=61)}})
elif mode=='cleanup':
    feature_collection('play_events').delete_many({'user_id':user_id})
