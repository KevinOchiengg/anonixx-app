from typing import Optional, Tuple
from app.repositories.user import UserRepository
from app.models.user import UserModel
from app.core.security import verify_password, get_password_hash, generate_anonymous_name
from app.core.jwt import create_access_token, create_refresh_token, decode_token
from app.core.exceptions import UnauthorizedException, BadRequestException
from app.schemas.user import UserProfile, TokenResponse


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def create_anonymous_user(self) -> Tuple[dict, TokenResponse]:
        """Create anonymous user"""
        anonymous_name = generate_anonymous_name()
        user_data = UserModel.create_anonymous_user(anonymous_name)
        user = await self.user_repo.create(user_data)

        tokens = self._generate_tokens(str(user["_id"]))
        profile = self._user_to_profile(user)

        return user, TokenResponse(**tokens, user=profile)

    async def register_user(
        self,
        email: Optional[str],
        phone: Optional[str],
        password: str,
        username: Optional[str]
    ) -> TokenResponse:
        """Register new user"""
        # Validation
        if not email and not phone:
            raise BadRequestException("Email or phone required")

        if email:
            existing = await self.user_repo.find_by_email(email)
            if existing:
                raise BadRequestException("Email already registered")

        if phone:
            existing = await self.user_repo.find_by_phone(phone)
            if existing:
                raise BadRequestException("Phone already registered")

        if username:
            existing = await self.user_repo.find_by_username(username)
            if existing:
                raise BadRequestException("Username already taken")

        # Create user
        anonymous_name = generate_anonymous_name()
        password_hash = get_password_hash(password)
        user_data = UserModel.create_registered_user(
            email, phone, password_hash, username, anonymous_name
        )
        user = await self.user_repo.create(user_data)

        tokens = self._generate_tokens(str(user["_id"]))
        profile = self._user_to_profile(user)

        return TokenResponse(**tokens, user=profile)

    async def login(self, email: Optional[str], phone: Optional[str], password: str) -> TokenResponse:
        """Login user"""
        user = None
        if email:
            user = await self.user_repo.find_by_email(email)
        elif phone:
            user = await self.user_repo.find_by_phone(phone)

        if not user or not verify_password(password, user.get("password_hash", "")):
            raise UnauthorizedException("Invalid credentials")

        # Update last login
        await self.user_repo.update_last_login(str(user["_id"]))

        tokens = self._generate_tokens(str(user["_id"]))
        profile = self._user_to_profile(user)

        return TokenResponse(**tokens, user=profile)

    async def convert_anonymous_to_registered(
        self,
        user_id: str,
        email: Optional[str],
        phone: Optional[str],
        password: str,
        username: Optional[str]
    ) -> TokenResponse:
        """Convert anonymous account to registered"""
        user = await self.user_repo.find_by_id(user_id)
        if not user:
            raise UnauthorizedException("User not found")

        if not user.get("is_anonymous"):
            raise BadRequestException("Account already registered")

        # Validation
        if email:
            existing = await self.user_repo.find_by_email(email)
            if existing:
                raise BadRequestException("Email already registered")

        if phone:
            existing = await self.user_repo.find_by_phone(phone)
            if existing:
                raise BadRequestException("Phone already registered")

        if username:
            existing = await self.user_repo.find_by_username(username)
            if existing:
                raise BadRequestException("Username already taken")

        # Update user
        password_hash = get_password_hash(password)
        update_data = {
            "email": email,
            "phone": phone,
            "password_hash": password_hash,
            "username": username,
            "is_anonymous": False
        }
        await self.user_repo.update(user_id, update_data)

        # Get updated user
        user = await self.user_repo.find_by_id(user_id)
        tokens = self._generate_tokens(user_id)
        profile = self._user_to_profile(user)

        return TokenResponse(**tokens, user=profile)

    async def refresh_access_token(self, refresh_token: str) -> dict:
        """Refresh access token"""
        from app.core.jwt import verify_refresh_token

        payload = verify_refresh_token(refresh_token)
        if not payload:
            raise UnauthorizedException("Invalid refresh token")

        user_id = payload.get("sub")
        user = await self.user_repo.find_by_id(user_id)
        if not user:
            raise UnauthorizedException("User not found")

        tokens = self._generate_tokens(user_id)
        return tokens

    def _generate_tokens(self, user_id: str) -> dict:
        """Generate access and refresh tokens"""
        access_token = create_access_token({"sub": user_id})
        refresh_token = create_refresh_token({"sub": user_id})
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }

    def _user_to_profile(self, user: dict) -> UserProfile:
        """Convert user dict to UserProfile"""
        return UserProfile(
            id=str(user["_id"]),
            anonymous_name=user["anonymous_name"],
            username=user.get("username"),
            email=user.get("email"),
            phone=user.get("phone"),
            avatar=user.get("avatar"),
            bio=user.get("bio"),
            coin_balance=user.get("coin_balance", 0),
            reputation_score=user.get("reputation_score", 0),
            is_anonymous=user.get("is_anonymous", True),
            is_premium=user.get("is_premium", False),
            created_at=user["created_at"],
            last_login=user.get("last_login")
        )