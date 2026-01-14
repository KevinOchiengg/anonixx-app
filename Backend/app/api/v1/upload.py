from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from app.database import get_database
from app.models.user import User
from app.config import settings
from jose import JWTError, jwt
from bson import ObjectId
import cloudinary
import cloudinary.uploader

router = APIRouter(prefix="/upload", tags=["upload"])

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

async def get_user_from_token(authorization: str = Header(None)) -> User:
    """Simple authentication for file uploads"""
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    
    try:
        # Extract token from "Bearer <token>"
        scheme, token = authorization.split()
        if scheme.lower() != 'bearer':
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        
        # Decode token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get user from database
        db = await get_database()
        try:
            user = await db.users.find_one({"_id": ObjectId(user_id)})
        except:
            user = await db.users.find_one({"_id": user_id})
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(
            id=str(user["_id"]),
            username=user["username"],
            email=user["email"],
            coin_balance=user.get("coin_balance", 0),
            is_premium=user.get("is_premium", False),
            is_anonymous=user.get("is_anonymous", False),
            anonymous_name=user.get("anonymous_name")
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate token")

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_user_from_token)
):
    """Upload image to Cloudinary"""
    try:
        print("=" * 50)
        print("📤 IMAGE UPLOAD")
        print(f"👤 User: {current_user.email}")
        print(f"📁 File: {file.filename}")
        
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read file contents
        contents = await file.read()
        print(f"📦 File size: {len(contents)} bytes")
        
        # Validate file size (max 5MB)
        if len(contents) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 5MB")
        
        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            contents,
            folder="echo/images",
            resource_type="image",
            allowed_formats=["jpg", "jpeg", "png", "gif", "webp"]
        )
        
        print(f"✅ Upload successful: {result['secure_url']}")
        print("=" * 50)
        
        return {
            "url": result["secure_url"],
            "public_id": result["public_id"],
            "resource_type": "image"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/audio")
async def upload_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_user_from_token)
):
    """Upload audio to Cloudinary"""
    try:
        print("=" * 50)
        print("🎵 AUDIO UPLOAD")
        print(f"👤 User: {current_user.email}")
        print(f"📁 File: {file.filename}")
        
        # Read file contents
        contents = await file.read()
        print(f"📦 File size: {len(contents)} bytes")
        
        # Validate file size (max 10MB for audio)
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 10MB")
        
        # Upload to Cloudinary as audio
        result = cloudinary.uploader.upload(
            contents,
            folder="echo/audio",
            resource_type="auto",
        )
        
        print(f"✅ Upload successful: {result['secure_url']}")
        print("=" * 50)
        
        return {
            "url": result["secure_url"],
            "public_id": result["public_id"],
            "resource_type": "audio",
            "duration": result.get("duration", 0)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/video")
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_user_from_token)
):
    """Upload video to Cloudinary"""
    try:
        print("=" * 50)
        print("🎬 VIDEO UPLOAD")
        print(f"👤 User: {current_user.email}")
        print(f"📁 File: {file.filename}")
        
        # Read file contents
        contents = await file.read()
        print(f"📦 File size: {len(contents)} bytes ({len(contents) / 1024 / 1024:.2f} MB)")
        
        # Validate file size (max 50MB for video)
        if len(contents) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 50MB")
        
        print("🚀 Uploading to Cloudinary...")
        
        # Upload to Cloudinary as video
        result = cloudinary.uploader.upload(
            contents,
            folder="echo/videos",
            resource_type="video",
        )
        
        print(f"✅ Upload successful: {result['secure_url']}")
        print(f"📊 Video duration: {result.get('duration', 0)} seconds")
        print("=" * 50)
        
        return {
            "url": result["secure_url"],
            "public_id": result["public_id"],
            "resource_type": "video",
            "duration": result.get("duration", 0)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")