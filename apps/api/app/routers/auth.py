from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import User
from ..schemas import DevLoginRequest, DevLoginResponse
from ..security import make_jwt

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/dev-login", response_model=DevLoginResponse)
async def dev_login(body: DevLoginRequest, db: AsyncSession = Depends(get_db)) -> DevLoginResponse:
    """MVP auth stub — creates or returns the user for a handle (PRD §10)."""
    result = await db.execute(select(User).where(User.handle == body.handle))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(handle=body.handle, birth_year=body.birth_year)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return DevLoginResponse(user_id=user.id, handle=user.handle, token=make_jwt(user.id, user.handle))
