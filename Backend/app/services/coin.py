from typing import List
from app.repositories.user import UserRepository
from app.repositories.coin import CoinTransactionRepository
from app.models.coin_transaction import CoinTransactionModel
from app.core.exceptions import InsufficientCoinsException, BadRequestException
from app.schemas.coin import CoinBalance, CoinTransaction
from datetime import datetime


class CoinService:
    def __init__(self, user_repo: UserRepository, transaction_repo: CoinTransactionRepository):
        self.user_repo = user_repo
        self.transaction_repo = transaction_repo

    async def get_balance(self, user_id: str) -> CoinBalance:
        """Get user's coin balance"""
        balance = await self.user_repo.get_coin_balance(user_id)
        if balance is None:
            raise BadRequestException("User not found")

        total_earned = await self.transaction_repo.get_total_earned(user_id)
        total_spent = await self.transaction_repo.get_total_spent(user_id)

        return CoinBalance(
            user_id=user_id,
            balance=balance,
            total_earned=total_earned,
            total_spent=total_spent
        )

    async def earn_coins(
        self,
        user_id: str,
        amount: int,
        action: str,
        description: Optional[str] = None
    ) -> CoinTransaction:
        """Award coins to user"""
        # Create transaction
        transaction_data = CoinTransactionModel.create_transaction(
            user_id=user_id,
            amount=amount,
            transaction_type="earn",
            provider="system",
            reference_id=None,
            status="success",
            description=description or f"Earned from {action}"
        )
        transaction = await self.transaction_repo.create(transaction_data)

        # Update user balance
        await self.user_repo.update_coin_balance(user_id, amount)

        return self._transaction_to_schema(transaction)

    async def spend_coins(
        self,
        user_id: str,
        amount: int,
        action: str,
        target_id: Optional[str] = None
    ) -> CoinTransaction:
        """Deduct coins from user"""
        # Check balance
        balance = await self.user_repo.get_coin_balance(user_id)
        if balance is None or balance < amount:
            raise InsufficientCoinsException(f"Insufficient coins. Required: {amount}, Available: {balance}")

        # Create transaction
        transaction_data = CoinTransactionModel.create_transaction(
            user_id=user_id,
            amount=-amount,  # Negative for spending
            transaction_type="spend",
            provider="system",
            reference_id=target_id,
            status="success",
            description=f"Spent on {action}"
        )
        transaction = await self.transaction_repo.create(transaction_data)

        # Update user balance
        await self.user_repo.update_coin_balance(user_id, -amount)

        return self._transaction_to_schema(transaction)

    async def get_transaction_history(self, user_id: str, limit: int = 50) -> List[CoinTransaction]:
        """Get user's transaction history"""
        transactions = await self.transaction_repo.get_user_transactions(user_id, limit)
        return [self._transaction_to_schema(t) for t in transactions]

    async def create_purchase_transaction(
        self,
        user_id: str,
        coins: int,
        amount: float,
        provider: str,
        reference_id: str
    ) -> CoinTransaction:
        """Create pending purchase transaction"""
        transaction_data = CoinTransactionModel.create_transaction(
            user_id=user_id,
            amount=coins,
            transaction_type="purchase",
            provider=provider,
            reference_id=reference_id,
            status="pending",
            description=f"Purchase of {coins} coins via {provider}"
        )
        transaction = await self.transaction_repo.create(transaction_data)
        return self._transaction_to_schema(transaction)

    async def complete_purchase(self, transaction_id: str) -> bool:
        """Complete a purchase transaction and credit coins"""
        transaction = await self.transaction_repo.find_by_transaction_id(transaction_id)
        if not transaction:
            return False

        if transaction["status"] != "pending":
            return False  # Already processed

        # Update transaction status
        await self.transaction_repo.update_status(transaction_id, "success")

        # Credit user
        await self.user_repo.update_coin_balance(transaction["user_id"], transaction["amount"])

        return True

    async def fail_purchase(self, transaction_id: str) -> bool:
        """Mark purchase as failed"""
        return await self.transaction_repo.update_status(transaction_id, "failed")

    def _transaction_to_schema(self, transaction: dict) -> CoinTransaction:
        """Convert transaction dict to schema"""
        return CoinTransaction(
            id=str(transaction["_id"]),
            user_id=transaction["user_id"],
            amount=transaction["amount"],
            transaction_type=transaction["transaction_type"],
            provider=transaction["provider"],
            reference_id=transaction.get("reference_id"),
            status=transaction["status"],
            description=transaction.get("description"),
            created_at=transaction["created_at"]
        )