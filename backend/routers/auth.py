from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.schemas import auth as auth_schemas
from backend.core.db import get_db
from backend.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    PyJWTError,
    get_current_user,
)
from backend.models.user import User, UserRole

router = APIRouter()

@router.post("/login", response_model=auth_schemas.TokenResponse)
def login(payload: auth_schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }

@router.get("/me", response_model=auth_schemas.UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/refresh", response_model=auth_schemas.TokenResponse)
def refresh(payload: auth_schemas.RefreshRequest):
    try:
        token_data = decode_token(payload.refresh_token)
        if token_data.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        user_id = token_data.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    except PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    access_token = create_access_token(str(user_id))
    refresh_token = create_refresh_token(str(user_id))

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }

@router.post("/register-superadmin", response_model=auth_schemas.UserResponse)
def register_superadmin(payload: auth_schemas.SuperAdminRegisterRequest, db: Session = Depends(get_db)):
    existing_superadmin = db.query(User).filter(User.role == UserRole.super_admin).first()
    if existing_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin already exists")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    user = User(
        company_id=None,
        name=payload.name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=UserRole.super_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user

@router.post("/change-password")
def change_password(
    payload: auth_schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 8 characters")
    current_user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    return {"detail": "Password changed successfully"}

@router.post("/logout")
def logout():
    return {"detail": "Logged out"}
