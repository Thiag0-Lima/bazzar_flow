from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.append(websocket)
        print(f"[WS] Cliente conectado. Total: {len(self.active)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active:
            self.active.remove(websocket)
        print(f"[WS] Cliente desconectado. Total: {len(self.active)}")

    async def broadcast(self, message: dict):
        mortos = []
        for connection in self.active:
            try:
                await connection.send_json(message)
            except Exception:
                mortos.append(connection)
        for c in mortos:
            self.disconnect(c)

manager = ConnectionManager()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mantém a conexão aberta (recebe ping do frontend)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)