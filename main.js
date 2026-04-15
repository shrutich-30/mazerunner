import * as THREE from 'three';

// Configuration
const TILE_SIZE = 2;
const WALL_HEIGHT = 2.5;

// State
let socket = null;
let myId = null;
let currentRoom = null;
let mazeMeshes = [];
let players = {};
let scene, camera, renderer, clock;
let mazeData = null;
let gameStartTime = 0;

// UI Elements
const lobby = document.getElementById('lobby');
const roomLobby = document.getElementById('room-lobby');
const hud = document.getElementById('hud');
const endScreen = document.getElementById('end-screen');
const playersUl = document.getElementById('players-ul');
const startBtn = document.getElementById('btn-start');
const roomCodeDisplay = document.getElementById('display-room-code');

// Initialization
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    scene.fog = new THREE.Fog(0x020205, 5, 25);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00f2ff, 1, 50);
    scene.add(pointLight);

    clock = new THREE.Clock();

    window.addEventListener('resize', onWindowResize);
    animate();
    
    setupNetwork();
}

function setupNetwork() {
    socket = new WebSocket('ws://localhost:8765');
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'room_joined':
                myId = data.playerId || myId;
                enterRoom(data.room);
                break;
            case 'player_joined':
            case 'player_left':
                updateRoom(data.room || currentRoom);
                if (data.type === 'player_joined') playJoinEffect();
                break;
            case 'lobby_wait':
                showLobbyWait(data.seconds);
                break;
            case 'countdown':
                showCountdown(data.seconds);
                break;
            case 'countdown_cancelled':
                hideCountdown();
                break;
            case 'game_started':
                startGame(data.room);
                break;
            case 'state_update':
                syncPlayers(data.players);
                break;
            case 'game_end':
                showEndScreen(data.winner);
                break;
            case 'error':
                alert(data.message);
                break;
        }
    };
}

// Logic Functions
function enterRoom(room) {
    currentRoom = room;
    lobby.classList.add('hidden');
    roomLobby.classList.remove('hidden');
    document.getElementById('room-id-tag').innerText = `CODE: ${room.code}`;
    updateRoomList(room);
}

function updateRoom(room) {
    currentRoom = room;
    updateRoomList(room);
}

function showLobbyWait(seconds) {
    const timer = document.getElementById('countdown-timer');
    timer.classList.remove('hidden');
    timer.innerText = `Waiting for others... ${seconds}s`;
}

function showCountdown(seconds) {
    const timer = document.getElementById('countdown-timer');
    timer.classList.remove('hidden');
    timer.innerText = `Starting in ${seconds}...`;
}

function hideCountdown() {
    document.getElementById('countdown-timer').classList.add('hidden');
}

function playJoinEffect() {
    // Simple visual pop or sound
    playersUl.style.transform = 'scale(1.02)';
    setTimeout(() => playersUl.style.transform = 'scale(1)', 100);
}

function updateRoomList(room) {
    playersUl.innerHTML = '';
    Object.values(room.players).forEach(p => {
        const li = document.createElement('li');
        li.innerText = `${p.name} ${p.id === room.hostId ? '👑' : ''}`;
        li.style.color = p.color;
        playersUl.appendChild(li);
    });
}

function startGame(room) {
    currentRoom = room;
    roomLobby.classList.add('hidden');
    hud.classList.remove('hidden');
    document.getElementById('room-code-hud').innerText = `CODE: ${room.code}`;
    gameStartTime = Date.now();
    buildMaze(room.seed);
}

// 3D Rendering Functions
function buildMaze(seed) {
    // Basic Maze Building (Deterministic based on logic in server-client shared knowledge)
    // For simplicity in this structure, we'll use a mocked generator that matches the server's seed
    // In a real production app, you'd include the MazeGenerator class here too.
    
    // Clear existing
    mazeMeshes.forEach(m => scene.remove(m));
    mazeMeshes = [];

    const wallGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a2e, 
        emissive: 0x00f2ff, 
        emissiveIntensity: 0.1 
    });

    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x050510 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    mazeMeshes.push(floor);

    // Grid construction (Simplified for demo, usually use generated grid)
    // Normally you'd recreate the grid from MazeGenerator here.
    // We'll just generate one based on the seed locally.
    const mazeWidth = 21, mazeHeight = 21;
    const grid = generateLocalMaze(mazeWidth, mazeHeight, seed);

    for(let y = 0; y < mazeHeight; y++) {
        for(let x = 0; x < mazeWidth; x++) {
            if(grid[y][x] === 0) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x * TILE_SIZE, WALL_HEIGHT/2, y * TILE_SIZE);
                scene.add(wall);
                mazeMeshes.push(wall);
            }
        }
    }
    
    // Add Exit marker
    const exitGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32);
    const exitMat = new THREE.MeshBasicMaterial({ color: 0xff00c8 });
    const exitMesh = new THREE.Mesh(exitGeo, exitMat);
    exitMesh.position.set(currentRoom.exit[0] * TILE_SIZE, 0.05, currentRoom.exit[1] * TILE_SIZE);
    scene.add(exitMesh);
    mazeMeshes.push(exitMesh);

    mazeData = grid;
}

function generateLocalMaze(w, h, seed) {
    // Minimal mock of the server's generator for the demo
    // In production, sync the MazeGenerator.js file
    const grid = Array(h).fill().map(() => Array(w).fill(0));
    // Procedural logic goes here... matching server.py
    // For now, let's assume a simple fixed pattern for structural demo
    // or better, implement the same DFS here.
    return mockDFS(w, h, seed);
}

function mockDFS(w, h, seed) {
    // Simplified DFS for client-side recreation
    const grid = Array(h).fill().map(() => Array(w).fill(0));
    const stack = [[1, 1]];
    grid[1][1] = 1;

    // Use a simple LCG for deterministic randomness
    let s = seed;
    function lcg() {
        s = (s * 48271) % 2147483647;
        return s / 2147483647;
    }

    while(stack.length > 0) {
        const [x, y] = stack[stack.length - 1];
        const neighbors = [];
        [[0,2],[0,-2],[2,0],[-2,0]].forEach(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx] === 0) {
                neighbors.push([nx, ny, dx, dy]);
            }
        });

        if (neighbors.length > 0) {
            const idx = Math.floor(lcg() * neighbors.length);
            const [nx, ny, dx, dy] = neighbors[idx];
            grid[y + dy / 2][x + dx / 2] = 1;
            grid[ny][nx] = 1;
            stack.push([nx, ny]);
        } else {
            stack.pop();
        }
    }
    grid[h-2][w-2] = 1;
    return grid;
}

function syncPlayers(serverPlayers) {
    Object.keys(serverPlayers).forEach(id => {
        const pData = serverPlayers[id];
        if (!players[id]) {
            const geo = new THREE.SphereGeometry(0.4, 32, 32);
            const mat = new THREE.MeshStandardMaterial({ color: pData.color, emissive: pData.color, emissiveIntensity: 1 });
            const mesh = new THREE.Mesh(geo, mat);
            scene.add(mesh);
            players[id] = { mesh, data: pData };
        }
        
        // Update data
        players[id].data = pData;
        
        // Lerp position (Simple interpolation)
        const targetX = pData.x * TILE_SIZE;
        const targetZ = pData.y * TILE_SIZE;
        players[id].mesh.position.lerp(new THREE.Vector3(targetX, 0.5, targetZ), 0.2);
    });

    // Clean up
    Object.keys(players).forEach(id => {
        if (!serverPlayers[id]) {
            scene.remove(players[id].mesh);
            delete players[id];
        }
    });

    if (myId && players[myId]) {
        const p = players[myId].mesh.position;
        camera.position.lerp(new THREE.Vector3(p.x, p.y + 10, p.z + 5), 0.1);
        camera.lookAt(p);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    // Handle Input
    if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom.status === 'running') {
        handleInput();
        if (gameStartTime > 0) {
            const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
            const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const s = String(elapsed % 60).padStart(2, '0');
            document.getElementById('timer').innerText = `${m}:${s}`;
        }
    }
    
    renderer.render(scene, camera);
}

const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function handleInput() {
    if(!myId || !players[myId]) return;
    
    const speed = 0.1;
    const player = players[myId].data;
    let nx = player.x;
    let ny = player.y;

    if (keys['w'] || keys['arrowup']) ny -= speed;
    if (keys['s'] || keys['arrowdown']) ny += speed;
    if (keys['a'] || keys['arrowleft']) nx -= speed;
    if (keys['d'] || keys['arrowright']) nx += speed;

    if (canMove(nx, ny)) {
        socket.send(JSON.stringify({
            type: 'move',
            code: currentRoom.code,
            x: nx,
            y: ny
        }));
    }
}

function canMove(x, y) {
    if (!mazeData) return false;
    const radius = 0.2;
    const checkPoints = [
        [x - radius, y - radius],
        [x + radius, y - radius],
        [x - radius, y + radius],
        [x + radius, y + radius]
    ];
    for(const [cx, cy] of checkPoints) {
        const tx = Math.floor(cx + 0.5);
        const ty = Math.floor(cy + 0.5);
        if (mazeData[ty] && mazeData[ty][tx] === 0) return false;
    }
    return true;
}

function showEndScreen(winner) {
    hud.classList.add('hidden');
    endScreen.classList.remove('hidden');
    document.getElementById('winner-announce').innerText = `${winner.toUpperCase()} WON!`;
}

// UI Handlers
document.getElementById('btn-play').onclick = () => {
    const name = document.getElementById('username').value.trim() || 'Player';
    socket.send(JSON.stringify({ type: 'play', name }));
};

document.getElementById('btn-join').onclick = () => {
    const name = document.getElementById('username').value.trim() || 'Player';
    const code = document.getElementById('room-code').value.toUpperCase();
    socket.send(JSON.stringify({ type: 'join_room', name, code }));
};

init();
