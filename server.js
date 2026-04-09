import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { userRoutes } from "./routes/userRoutes.js";
import { Server } from "socket.io";
import http from "node:http";
import { deviceRoute } from "./routes/deviceRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "https://project-0kbd0.vercel.app" }
});

io.on("connection", (socket) => {
  console.log(" Client connected:", socket.id);
  socket.on("join-device", (deviceId) => {
    socket.join(deviceId);
    console.log(`Socket joined room: ${deviceId}`);
  });
  socket.on("disconnect", () => {
    console.log(" Client disconnected:", socket.id);
  });
});

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log("MongoDB Connected")
    return
  };

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    isConnected = true;
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB Error", err);
  }
};

// middleware to ensure DB connects
app.use(async (req, res, next) => {
  req.io = io;
  await connectDB();
  next();
});

app.use(cors({
  origin: ["https://project-0kbd0.vercel.app"],
  credentials: true
}));

app.get("/", (req, res) => {
  res.send("Tracker Platform Backend");
});

userRoutes(app);
deviceRoute(app);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});