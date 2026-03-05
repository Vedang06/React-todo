// server/index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_this";
const COOKIE_NAME = "token";

// Middleware
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// CORS: allow frontend origin from env (or localhost for dev)
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));

// Basic rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many requests, slow down" },
});

// Helper: create JWT and set cookie
function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * AUTH ROUTES
 */

// Register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username and password required" });
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: "invalid input" });
    if (username.length < 3 || username.length > 30) return res.status(400).json({ error: "username length must be 3-30" });

    // check duplicate
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ error: "username taken" });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hash }
    });

    // set cookie
    setAuthCookie(res, { userId: user.id });

    return res.status(201).json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username and password required" });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    setAuthCookie(res, { userId: user.id });
    return res.json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.status(204).send();
});

// Get current user (check if session is valid)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, username: true } });
    if (!user) return res.status(401).json({ error: "user not found" });
    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

/**
 * LIST ROUTES (protected)
 */

// Get all lists with todos for current user
app.get('/api/lists', requireAuth, async (req, res) => {
  try {
    const lists = await prisma.list.findMany({
      where: { userId: req.userId },
      orderBy: { position: 'asc' },
      include: {
        todos: {
          orderBy: { position: 'asc' },
        },
      },
    });
    return res.json(lists);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Create a new list
app.post('/api/lists', requireAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: "name required" });

    // Get the next position
    const maxPos = await prisma.list.aggregate({
      where: { userId: req.userId },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? -1) + 1;

    const list = await prisma.list.create({
      data: {
        name,
        position,
        user: { connect: { id: req.userId } },
      },
      include: { todos: true },
    });
    return res.status(201).json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Reorder lists (batch update positions) — must be before :id routes
app.put('/api/lists/reorder', requireAuth, async (req, res) => {
  try {
    const { order } = req.body || {}; // array of list IDs in desired order
    if (!Array.isArray(order)) return res.status(400).json({ error: "order array required" });

    // Verify all lists belong to user and update positions
    const updates = order.map((listId, index) =>
      prisma.list.updateMany({
        where: { id: listId, userId: req.userId },
        data: { position: index },
      })
    );
    await prisma.$transaction(updates);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Update a list (rename, reposition)
app.put('/api/lists/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, position } = req.body || {};

    // Check ownership
    const existing = await prisma.list.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: "not found" });

    const data = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof position === 'number') data.position = position;

    const updated = await prisma.list.update({
      where: { id },
      data,
      include: { todos: { orderBy: { position: 'asc' } } },
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Delete a list (cascades to todos)
app.delete('/api/lists/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Check ownership
    const existing = await prisma.list.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: "not found" });

    await prisma.list.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});


/**
 * TODO ROUTES (protected)
 */

// Create a todo in a specific list
app.post('/api/lists/:listId/todos', requireAuth, async (req, res) => {
  try {
    const listId = parseInt(req.params.listId, 10);
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: "text required" });

    // Check list ownership
    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list || list.userId !== req.userId) return res.status(404).json({ error: "list not found" });

    // Position: put at top (position 0) and shift others down
    await prisma.todo.updateMany({
      where: { listId },
      data: { position: { increment: 1 } },
    });

    const todo = await prisma.todo.create({
      data: {
        text,
        position: 0,
        list: { connect: { id: listId } },
      },
    });
    return res.status(201).json(todo);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Update a todo (text, done, position)
app.put('/api/todos/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { text, done, position } = req.body || {};

    // Check ownership via list -> user
    const existing = await prisma.todo.findUnique({
      where: { id },
      include: { list: true },
    });
    if (!existing || existing.list.userId !== req.userId) return res.status(404).json({ error: "not found" });

    const data = {};
    if (typeof text === 'string') data.text = text;
    if (typeof done === 'boolean') data.done = done;
    if (typeof position === 'number') data.position = position;

    const updated = await prisma.todo.update({
      where: { id },
      data,
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Delete a todo
app.delete('/api/todos/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Check ownership via list -> user
    const existing = await prisma.todo.findUnique({
      where: { id },
      include: { list: true },
    });
    if (!existing || existing.list.userId !== req.userId) return res.status(404).json({ error: "not found" });

    await prisma.todo.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Reorder todos within a list (batch update positions)
app.put('/api/lists/:listId/todos/reorder', requireAuth, async (req, res) => {
  try {
    const listId = parseInt(req.params.listId, 10);
    const { order } = req.body || {}; // array of todo IDs in desired order
    if (!Array.isArray(order)) return res.status(400).json({ error: "order array required" });

    // Verify list ownership
    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list || list.userId !== req.userId) return res.status(404).json({ error: "list not found" });

    const updates = order.map((todoId, index) =>
      prisma.todo.updateMany({
        where: { id: todoId, listId },
        data: { position: index },
      })
    );
    await prisma.$transaction(updates);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
