
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from app.core.security import get_current_user
from app.database import get_database
from app.models.user import User
from app.models.coin_transaction import CoinTransaction, TransactionType, TransactionReason

router = APIRouter(prefix="/coins", tags=["coins"])


@router.get("/balance")
async def get_coin_balance(current_user: User = Depends(get_current_user)):
    """Get current user's coin balance"""
    return {
        "user_id": current_user.id,
        "balance": current_user.coin_balance
    }


@router.get("/transactions")
async def get_transactions(current_user: User = Depends(get_current_user)):
    """Get user's transaction history"""
    db = await get_database()
    
    transactions = await db.coin_transactions.find(
        {"user_id": current_user.id}
    ).sort("created_at", -1).limit(50).to_list(None)
    
    return transactions


@router.post("/daily-reward")
async def claim_daily_reward(current_user: User = Depends(get_current_user)):
    """Claim daily login reward"""
    db = await get_database()
    
    # Check if already claimed today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    existing = await db.coin_transactions.find_one({
        "user_id": current_user.id,
        "reason": TransactionReason.DAILY_LOGIN,
        "created_at": {"$gte": today_start}
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Already claimed today!")
    
    # Award 5 coins
    amount = 5
    new_balance = current_user.coin_balance + amount
    
    # Create transaction
    transaction = CoinTransaction(
        user_id=current_user.id,
        amount=amount,
        balance_after=new_balance,
        transaction_type=TransactionType.EARN,
        reason=TransactionReason.DAILY_LOGIN,
        description="Daily login reward"
    )
    
    await db.coin_transactions.insert_one(transaction.dict(by_alias=True))
    
    # Update user balance
    await db.users.update_one(
        {"_id": current_user.id},
        {"$set": {"coin_balance": new_balance}}
    )
    
    return {"message": "Claimed 5 coins!", "new_balance": new_balance}