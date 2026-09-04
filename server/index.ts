import { Server, type Socket } from "socket.io";
import { createServer } from "http";

// Shared types between server and client (defined inline for simplicity)
type Track = {
  videoId: string;
  title: string;
  url: string;
  postedBy: string;
  duration: number;
  isAd: boolean;
};

type PlaybackState = {
  isPlaying: boolean;
  currentTrack: Track | null;
  position: number;
  queue: Track[];
};

type ClientToServerEvents = {
  join: () => void;
};

type ServerToClientEvents = {
  state: (state: PlaybackState) => void;
  tick: (payload: { position: number; isPlaying: boolean }) => void;
  idle: () => void;
};

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*" },
});

// Minimal mock playlist matching the server seed in mock mode
const MOCK_PLAYLIST: Track[] = [
  {
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    postedBy: "System",
    duration: 30,
    isAd: false,
  },
  {
    videoId: "anotherVideoId",
    title: "Ad Sample",
    url: "https://www.youtube.com/watch?v=anotherVideoId",
    postedBy: "System",
    duration: 10,
    isAd: true,
  },
];

// State tracking
let currentTrack: Track | null = null;
let position = 0;
let isPlaying = false;
let queue = [...MOCK_PLAYLIST];
let tickInterval: NodeJS.Timeout | undefined = undefined;
let lastActivityTime = Date.now();
let gracePeriodSeconds = Number(process.env.RECONNECT_GRACE_PERIOD_MINUTES) * 60 || 300;

function getRandomTrackFromQueue(): Track | null {
  if (!queue.length) return null;
  const idx = Math.floor(Math.random() * queue.length);
  const track = queue.splice(idx, 1)[0];
  if (!track) return null;
  return track;
}

function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (!isPlaying) return;
    position++;
    if (currentTrack && position >= currentTrack.duration) {
      // Move to next track
      const next = getRandomTrackFromQueue();
      if (next) {
        currentTrack = next;
        position = next.isAd ? 0 : Math.floor(Math.random() * (next.duration - 1));
        isPlaying = true;
        io.emit("state", {
          isPlaying,
          currentTrack,
          position,
          queue,
        });
      } else {
        isPlaying = false;
      }
    }
    io.emit("tick", { position, isPlaying });
  }, 1000);
}

function stopTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = undefined;
}

io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  console.log(`Client connected: ${socket.id}`);
  lastActivityTime = Date.now();

  // Send initial state snapshot
  const initialState: PlaybackState = { isPlaying, currentTrack, position, queue };
  socket.emit("state", initialState);

  // Start tick if not already running
  if (queue.length > 0 && !tickInterval) startTick();

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    lastActivityTime = Date.now();
    stopTick();
    // After some time, server should go idle (not implemented in skeleton)
  });

  socket.on("join", () => {
    console.log(`Client ${socket.id} joined broadcast`);
    // Acknowledge join - nothing else needed for skeleton
  });
});

// Periodic cleanup - remove inactive clients (simulated)
setInterval(() => {
  const now = Date.now();
  const minutesSinceLastActivity = (now - lastActivityTime) / 60000;
  if (minutesSinceLastActivity >= gracePeriodSeconds / 60) {
    console.log("Grace period expired, simulating idle state");
    isPlaying = false;
    stopTick();
  }
}, 30000);

const port = 3001;

httpServer.listen(port, () => {
  console.log(`Socket.io server running on port ${port}`);
});