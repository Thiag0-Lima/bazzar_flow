from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .database import engine, Base, SessionLocal
from .models import User, UserRole
from .auth import get_password_hash
from .routers import auth, orders, websocket, stock


def ensure_prazo_column():
    """Adiciona a coluna prazo em orders se ainda não existir (sem apagar o banco)."""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(orders)")).fetchall()
        cols = [r[1] for r in rows]
        if "prazo" not in cols:
            conn.execute(text("ALTER TABLE orders ADD COLUMN prazo DATETIME"))
            conn.commit()
            print("[DB] Coluna prazo adicionada em orders")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    ensure_prazo_column()

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(
                username="admin",
                hashed_password=get_password_hash("admin123"),
                full_name="Administrador",
                role=UserRole.ADMIN,
            ))
            db.add(User(
                username="atendente",
                hashed_password=get_password_hash("123"),
                full_name="Atendente Balcão",
                role=UserRole.ATENDENTE,
            ))
            db.add(User(
                username="criacao",
                hashed_password=get_password_hash("123"),
                full_name="Setor Criação",
                role=UserRole.CRIACAO,
            ))
            db.add(User(
                username="operador",
                hashed_password=get_password_hash("123"),
                full_name="Operador Produção",
                role=UserRole.OPERADOR,
            ))
            db.add(User(
                username="estoque",
                hashed_password=get_password_hash("123"),
                full_name="Controle de Estoque",
                role=UserRole.ESTOQUE,
            ))
            db.commit()
        else:
            # Se o banco já existe, garante o usuário estoque
            if not db.query(User).filter(User.username == "estoque").first():
                db.add(User(
                    username="estoque",
                    hashed_password=get_password_hash("123"),
                    full_name="Controle de Estoque",
                    role=UserRole.ESTOQUE,
                ))
                db.commit()
    finally:
        db.close()

    yield
    # Shutdown (nada a fazer)


app = FastAPI(title="Bazzar Flow", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(orders.router)
app.include_router(websocket.router)
app.include_router(stock.router)

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")