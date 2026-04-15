# Maze Runner 3D | Multiplayer

A real-time 3D maze racing game built with Python (Backend) and Three.js (Frontend).

## Features
- **Deterministic Mazes**: Generated from a seed shared between server and all clients.
- **Room System**: Create private rooms with codes for 2-8 players.
- **60Hz Sync**: Smooth authoritative movement with client-side interpolation.
- **Premium Aesthetics**: Cyberpunk/Neon design with glassmorphism UI.

## Setup

1. **Install Dependencies**:
   ```bash
   pip install websockets
   ```

2. **Run Server**:
   ```bash
   cd backend
   python server.py
   ```

3. **Run Frontend**:
   Open `frontend/index.html` via a local server (e.g., `python -m http.server 8000`).

## Controls
- **WASD / Arrows**: Move player.
- **Goal**: Reach the pink exit marker first to win.
