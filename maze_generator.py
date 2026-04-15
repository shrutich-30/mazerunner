import random

class MazeGenerator:
    def __init__(self, width, height, seed):
        self.width = width if width % 2 != 0 else width + 1
        self.height = height if height % 2 != 0 else height + 1
        self.seed = seed
        self.rng = random.Random(seed)
        self.grid = [[0 for _ in range(self.width)] for _ in range(self.height)]

    def generate(self):
        # 0 = wall, 1 = path
        stack = [(1, 1)]
        self.grid[1][1] = 1
        
        while stack:
            x, y = stack[-1]
            neighbors = []
            
            # Check directions
            for dx, dy in [(0, 2), (0, -2), (2, 0), (-2, 0)]:
                nx, ny = x + dx, y + dy
                if 0 < nx < self.width - 1 and 0 < ny < self.height - 1 and self.grid[ny][nx] == 0:
                    neighbors.append((nx, ny, dx, dy))
            
            if neighbors:
                nx, ny, dx, dy = self.rng.choice(neighbors)
                self.grid[y + dy // 2][x + dx // 2] = 1
                self.grid[ny][nx] = 1
                stack.append((nx, ny))
            else:
                stack.pop()
        
        # Ensure exit exists
        self.grid[self.height - 2][self.width - 2] = 1
        return self.grid, (1, 1), (self.width - 2, self.height - 2)
