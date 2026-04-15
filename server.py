import asyncio
import json
import logging
import random
import string
import time
import uuid
import websockets
from maze_generator import MazeGenerator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Player:
    def __init__(self, player_id, name, websocket):
        self.id = player_id
        self.name = name
        self.websocket = websocket
        self.x = 0
        self.y = 0
        self.score = 0
        self.color = f"hsl({random.randint(0, 360)}, 70%, 60%)"

class Room:
    def __init__(self, room_code, host_id):
        self.code = room_code
        self.host_id = host_id
        self.players = {}
        self.maze_seed = random.randint(0, 1000000)
        self.status = "waiting" # waiting, starting, running, finished
        self.maze_data = None
        self.start_pos = (1, 1)
        self.exit_pos = (19, 19)
        self.countdown = 5
        self.lobby_timeout = 30
        self.min_players = 2
        self.countdown_task = None

    def start_lobby_timer(self, server_callback):
        if not self.countdown_task:
            self.countdown_task = asyncio.create_task(self._lobby_lifecycle(server_callback))

    async def _lobby_lifecycle(self, server_callback):
        logger.info(f"Room {self.code} lobby timer started (30s)")
        start_time = time.time()

        # Phase 1: Wait until at least 2 players
        while len(self.players) < self.min_players:
            # If everyone leaves, stop
            if len(self.players) == 0:
                self.status = "waiting"
                return

            remaining = int(self.lobby_timeout - (time.time() - start_time))
            if remaining > 0 and remaining % 5 == 0:
                await server_callback(self, {"type": "lobby_wait", "seconds": remaining})
            
            await asyncio.sleep(1)

        # Phase 2: Countdown starts ONLY when >= 2 players
        self.status = "starting"
        logger.info(f"Room {self.code} entering countdown phase")

        countdown = 5  # reset fresh every time
        while countdown > 0:
            if len(self.players) == 0:
                self.status = "waiting"
                return

            await server_callback(self, {"type": "countdown", "seconds": countdown})
            await asyncio.sleep(1)
            countdown -= 1

        # Phase 3: Start Game
        self.start_game()
        await server_callback(self, {"type": "game_started", "room": self.to_dict()})
    def start_game(self):
        self.status = "running"
        gen = MazeGenerator(21, 21, self.maze_seed)
        self.maze_data, self.start_pos, self.exit_pos = gen.generate()
        for p in self.players.values():
            p.x, p.y = self.start_pos[0], self.start_pos[1]

    def to_dict(self, include_maze=False):
        return {
            "code": self.code,
            "hostId": self.host_id,
            "status": self.status,
            "seed": self.maze_seed,
            "players": {pid: {"id": p.id, "name": p.name, "x": p.x, "y": p.y, "color": p.color, "score": p.score} for pid, p in self.players.items()},
            "exit": self.exit_pos
        }

class MazeServer:
    def __init__(self):
        self.rooms = {}
        self.connections = {} # websocket -> player_id

    def generate_room_code(self):
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    async def broadcast(self, room, message):
        payload = json.dumps(message)
        dead_links = []
        for player in room.players.values():
            try:
                await player.websocket.send(payload)
            except:
                dead_links.append(player.id)
        for pid in dead_links:
            await self.handle_disconnect(pid)

    async def handle_disconnect(self, player_id):
        for room in list(self.rooms.values()):
            if player_id in room.players:
                del room.players[player_id]
                logger.info(f"Player {player_id} left room {room.code}")
                if not room.players:
                    del self.rooms[room.code]
                else:
                    if room.host_id == player_id:
                        room.host_id = next(iter(room.players))
                    await self.broadcast(room, {"type": "player_left", "playerId": player_id, "room": room.to_dict()})

    async def handle_client(self, websocket):
        player_id = str(uuid.uuid4())
        self.connections[websocket] = player_id
        
        try:
            async for message in websocket:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "play":
                    name = data.get("name", "Player")
                    # Try to find a waiting room
                    code = None
                    for r_code, r in self.rooms.items():
                        if r.status == "waiting" and len(r.players) < 8:
                            code = r_code
                            break
                    
                    if not code:
                        code = self.generate_room_code()
                        room = Room(code, player_id)
                        self.rooms[code] = room
                        logger.info(f"Room {code} created automatically")
                    
                    room = self.rooms[code]
                    player = Player(player_id, name, websocket)
                    room.players[player_id] = player
                    
                    await websocket.send(json.dumps({
                        "type": "room_joined", 
                        "room": room.to_dict(), 
                        "playerId": player_id,
                        "isAuto": True
                    }))
                    
                    await self.broadcast(room, {
                        "type": "player_joined", 
                        "player": room.to_dict()["players"][player_id]
                    })

                    # Ensure the lobby lifecycle is running
                    room.start_lobby_timer(self.broadcast)

                elif msg_type == "join_room":
                    name = data.get("name", "Guest")
                    code = data.get("code")
                    if code in self.rooms:
                        room = self.rooms[code]
                        if len(room.players) < 8:
                            player = Player(player_id, name, websocket)
                            room.players[player_id] = player
                            await websocket.send(json.dumps({"type": "room_joined", "room": room.to_dict(), "playerId": player_id}))
                            await self.broadcast(room, {"type": "player_joined", "player": room.to_dict()["players"][player_id]})
                        else:
                            await websocket.send(json.dumps({"type": "error", "message": "Room full"}))
                    else:
                        await websocket.send(json.dumps({"type": "error", "message": "Invalid code"}))

                elif msg_type == "start_game":
                    code = data.get("code")
                    if code in self.rooms and self.rooms[code].host_id == player_id:
                        self.rooms[code].start_game()
                        await self.broadcast(self.rooms[code], {"type": "game_started", "room": self.rooms[code].to_dict()})

                elif msg_type == "move":
                    code = data.get("code")
                    if code in self.rooms:
                        room = self.rooms[code]
                        player = room.players.get(player_id)
                        if player and room.status == "running":
                            # Simple validation (needs more robust collision later)
                            nx, ny = data["x"], data["y"]
                            player.x, player.y = nx, ny
                            
                            # Check win
                            if abs(nx - room.exit_pos[0]) < 0.3 and abs(ny - room.exit_pos[1]) < 0.3:
                                room.status = "finished"
                                await self.broadcast(room, {"type": "game_end", "winner": player.name})

        except Exception as e:
            logger.error(f"Error: {e}")
        finally:
            await self.handle_disconnect(player_id)

    async def game_loop(self):
        while True:
            for room in list(self.rooms.values()):
                if room.status == "running":
                    await self.broadcast(room, {"type": "state_update", "players": room.to_dict()["players"]})
            await asyncio.sleep(1/60) # 60Hz

async def main():
    server = MazeServer()
    async with websockets.serve(server.handle_client, "0.0.0.0", 8765):
        logger.info("3D Maze Server running on ws://localhost:8765")
        await server.game_loop()

if __name__ == "__main__":
    asyncio.run(main())
