from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.postgres import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse
from app.schemas.auth import LoginRequest, TokenResponse
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.core.logging import logger

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def register_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
):
    """
    Registers a new user account with hashed password and returns an access token.
    Enforces case-insensitive email uniqueness.
    """
    normalized_email = str(payload.email).strip().lower()

    # Check if email is already taken
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        logger.warning(f"Registration attempt with existing email: {normalized_email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # Hash password and create user
    hashed_password = get_password_hash(payload.password)
    new_user = User(
        email=normalized_email,
        password_hash=hashed_password,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info(f"New user registered successfully: id={new_user.id}, email={new_user.email}")

    # Generate access token
    access_token = create_access_token(subject=str(new_user.id))
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and obtain JWT token",
)
def login_user(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Authenticates user credentials and returns a signed JWT access token.
    """
    normalized_email = str(payload.email).strip().lower()

    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        logger.warning(f"Failed login attempt for email: {normalized_email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    logger.info(f"User logged in successfully: id={user.id}, email={user.email}")

    access_token = create_access_token(subject=str(user.id))
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current authenticated user info",
)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the profile data of the currently authenticated user.
    Requires a valid JWT Bearer token.
    """
    return UserResponse.model_validate(current_user)
