import { Server } from "socket.io";
import { createServer } from "http";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  socket.on("message", (data) => {
    console.log(`Message from ${socket.id}:`, data);
    io.emit("message", { from: socket.id, data });
  });
});

const port = 3001;

httpServer.listen(port, () => {
  console.log(`Socket.io server running on port ${port}`);
});