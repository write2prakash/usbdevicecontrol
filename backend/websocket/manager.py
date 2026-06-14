import asyncio
from typing import Dict
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
        # admin connections keyed by company_id -> set of websockets
        self.admin_connections: Dict[int, set[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, endpoint_id: int, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            self.active_connections[endpoint_id] = websocket

    async def disconnect(self, endpoint_id: int):
        async with self.lock:
            self.active_connections.pop(endpoint_id, None)

    async def connect_admin(self, company_id: int, websocket: WebSocket):
        await websocket.accept()
        async with self.lock:
            conns = self.admin_connections.get(company_id) or set()
            conns.add(websocket)
            self.admin_connections[company_id] = conns

    async def disconnect_admin(self, company_id: int, websocket: WebSocket):
        async with self.lock:
            conns = self.admin_connections.get(company_id)
            if conns:
                conns.discard(websocket)
                if not conns:
                    self.admin_connections.pop(company_id, None)

    async def send_json(self, endpoint_id: int, data: dict):
        websocket = self.active_connections.get(endpoint_id)
        if websocket:
            await websocket.send_json(data)

    async def send_company_json(self, company_id: int, data: dict):
        conns = self.admin_connections.get(company_id)
        if not conns:
            return
        # send to all admin websockets for this company
        for ws in list(conns):
            try:
                await ws.send_json(data)
            except Exception:
                # ignore individual send errors
                pass

    def start(self):
        pass

manager = ConnectionManager()
