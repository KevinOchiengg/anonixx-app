from fastapi import APIRouter, Depends, HTTPException
from app.schemas.payment import InitiatePaymentRequest, PaymentResponse
from app.schemas.common import ResponseModel
from app.services.payment import PaymentService
from app.services.coin import CoinService
from app.repositories.user import UserRepository
from app.repositories.coin import CoinTransactionRepository
from app.database import get_database
from app.dependencies import get_current_user_id


router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/initiate", response_model=PaymentResponse)
async def initiate_payment(
    data: InitiatePaymentRequest,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Initiate payment for coin purchase"""
    user_repo = UserRepository(db)
    transaction_repo = CoinTransactionRepository(db)
    coin_service = CoinService(user_repo, transaction_repo)
    payment_service = PaymentService(coin_service, transaction_repo)

    if data.provider == "mpesa":
        if not data.phone:
            raise HTTPException(status_code=400, detail="Phone number required for M-Pesa")
        
        result = await payment_service.initiate_mpesa_payment(
            user_id=current_user_id,
            phone=data.phone,
            coin_pack=data.coin_pack.value,
            currency=data.currency.value
        )
    
    elif data.provider == "stripe":
        result = await payment_service.initiate_stripe_payment(
            user_id=current_user_id,
            coin_pack=data.coin_pack.value,
            currency=data.currency.value
        )
    
    elif data.provider == "paypal":
        result = await payment_service.initiate_paypal_payment(
            user_id=current_user_id,
            coin_pack=data.coin_pack.value,
            currency=data.currency.value
        )
    
    else:
        raise HTTPException(status_code=400, detail="Invalid payment provider")

    return PaymentResponse(**result)


@router.get("/transaction/{transaction_id}")
async def get_transaction_status(
    transaction_id: str,
    current_user_id: str = Depends(get_current_user_id),
    db = Depends(get_database)
):
    """Get transaction status"""
    transaction_repo = CoinTransactionRepository(db)
    transaction = await transaction_repo.find_by_transaction_id(transaction_id)
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction["user_id"] != current_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "transaction_id": transaction["transaction_id"],
        "status": transaction["status"],
        "amount": transaction["amount"],
        "provider": transaction["provider"],
        "created_at": transaction["created_at"]
    }