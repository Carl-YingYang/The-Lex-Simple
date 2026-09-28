"""Lex-Simple API route groups, v6.3.2."""

from fastapi import APIRouter

from api.routers import admin, ai, feedback, knowledge


router = APIRouter()

# The admin routes have their own workflow tags. Adding one generic tag here
# would put each operation in two Swagger groups and clutter /docs again.
router.include_router(admin.router)
router.include_router(ai.router, tags=["AI Processing"])
router.include_router(knowledge.router, tags=["Knowledge Base"])
router.include_router(feedback.router, tags=["User Feedback"])