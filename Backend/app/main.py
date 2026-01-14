from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection
from app.api.v1 import auth, coins, posts, groups, upload   # ← ADD groups


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    print("🚀 Echo Backend Started - Auth, Coins, Posts, Groups!")
    yield
    await close_mongo_connection()


app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0",
    lifespan=lifespan,
    redirect_slashes=False
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}


@app.get("/")
async def root():
    return {
        "message": "Welcome to Echo API",
        "docs": "/docs",
        "features": ["auth", "coins", "posts", "groups","upload"]  # ← UPDATE
    }


# Include routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(coins.router, prefix=settings.API_V1_PREFIX)
app.include_router(posts.router, prefix=settings.API_V1_PREFIX)
app.include_router(groups.router, prefix=settings.API_V1_PREFIX) 
app.include_router(upload.router, prefix=settings.API_V1_PREFIX) 
