from fastapi import APIRouter

# I-import yung mga na-split nating routers
from api.routers import ai, knowledge, feedback, admin

router = APIRouter()

# Ikonek ang mga routers sa main router
router.include_router(ai.router, tags=["AI Processing"])
router.include_router(knowledge.router, tags=["Knowledge Base"])
router.include_router(feedback.router, tags=["User Feedback"])
router.include_router(admin.router, tags=["Admin & Dev Tools"])