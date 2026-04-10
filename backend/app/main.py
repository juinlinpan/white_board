from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

DEV_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

app = FastAPI(title="Whiteboard Planner Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "service": "whiteboard-backend",
        "status": "ok",
    }
