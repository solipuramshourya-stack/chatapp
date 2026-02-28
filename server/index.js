require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: req.body.firstName ? String(req.body.firstName).trim().slice(0, 100) : '',
      lastName: req.body.lastName ? String(req.body.lastName).trim().slice(0, 100) : '',
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({
      ok: true,
      username: name,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube Channel Data ───────────────────────────────────────────────────────
// Uses YouTube Data API v3. Set YOUTUBE_API_KEY or REACT_APP_YOUTUBE_API_KEY in .env

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.REACT_APP_YOUTUBE_API_KEY || '';

function parseChannelUrl(url) {
  const u = String(url).trim();
  const match = u.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
  if (match) return { type: 'id', value: match[1] };
  const handleMatch = u.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };
  const atMatch = u.match(/@([a-zA-Z0-9_.-]+)/);
  if (atMatch) return { type: 'handle', value: atMatch[1] };
  const cMatch = u.match(/youtube\.com\/c\/([a-zA-Z0-9_-]+)/);
  if (cMatch) return { type: 'handle', value: cMatch[1] };
  return null;
}

async function getChannelId(parsed) {
  if (!YOUTUBE_API_KEY) throw new Error('YouTube API key not configured');
  const base = 'https://www.googleapis.com/youtube/v3';
  if (parsed.type === 'id') return parsed.value;
  // For @handles, use search API — forUsername is deprecated and often returns wrong channel
  const query = parsed.value.startsWith('@') ? parsed.value : `@${parsed.value}`;
  const res = await fetch(
    `${base}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'YouTube API error');
  const channelItem = data.items && data.items[0];
  if (!channelItem?.id?.channelId) throw new Error('Channel not found');
  return channelItem.id.channelId;
}

async function getUploadsPlaylistId(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'YouTube API error');
  const channel = data.items && data.items[0];
  if (!channel?.contentDetails?.relatedPlaylists?.uploads) throw new Error('Channel has no uploads');
  return channel.contentDetails.relatedPlaylists.uploads;
}

async function getPlaylistVideoIds(playlistId, maxVideos) {
  const ids = [];
  let nextPageToken = null;
  const base = 'https://www.googleapis.com/youtube/v3/playlistItems';
  do {
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: String(Math.min(50, maxVideos - ids.length)),
      key: YOUTUBE_API_KEY,
    });
    if (nextPageToken) params.set('pageToken', nextPageToken);
    const res = await fetch(`${base}?${params}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'YouTube API error');
    const items = data.items || [];
    for (const item of items) {
      const vid = item.snippet?.resourceId?.videoId;
      if (vid) ids.push(vid);
    }
    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken && ids.length < maxVideos);
  return ids.slice(0, maxVideos);
}

async function getVideoDetails(videoIds) {
  if (videoIds.length === 0) return [];
  const base = 'https://www.googleapis.com/youtube/v3/videos';
  const ids = videoIds.join(',');
  const res = await fetch(`${base}?part=snippet,contentDetails,statistics&id=${ids}&key=${YOUTUBE_API_KEY}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'YouTube API error');
  const items = data.items || [];
  return items.map((v) => {
    const s = v.snippet || {};
    const c = v.contentDetails || {};
    const t = v.statistics || {};
    return {
      video_id: v.id,
      title: s.title || '',
      description: (s.description || '').slice(0, 5000),
      duration: c.duration || null,
      release_date: s.publishedAt || null,
      view_count: parseInt(t.viewCount, 10) || 0,
      like_count: parseInt(t.likeCount, 10) || 0,
      comment_count: parseInt(t.commentCount, 10) || 0,
      video_url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail_url: (s.thumbnails && (s.thumbnails.maxres?.url || s.thumbnails.high?.url || s.thumbnails.default?.url)) || null,
      transcript: null,
    };
  });
}

app.post('/api/youtube/channel', async (req, res) => {
  try {
    const { channelUrl, maxVideos = 10 } = req.body;
    const max = Math.min(100, Math.max(1, parseInt(String(maxVideos), 10) || 10));
    if (!channelUrl || !channelUrl.trim()) return res.status(400).json({ error: 'channelUrl required' });
    if (!YOUTUBE_API_KEY) return res.status(503).json({ error: 'YouTube API key not configured. Add YOUTUBE_API_KEY to .env' });

    const parsed = parseChannelUrl(channelUrl);
    if (!parsed) return res.status(400).json({ error: 'Invalid channel URL. Use e.g. https://www.youtube.com/@veritasium' });

    const channelId = await getChannelId(parsed);
    const uploadsId = await getUploadsPlaylistId(channelId);
    const videoIds = await getPlaylistVideoIds(uploadsId, max);
    const videos = await getVideoDetails(videoIds);

    res.json({ ok: true, channelId, videos });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch channel data' });
  }
});

// Streaming variant: POST same body, response is SSE with progress then final data
app.post('/api/youtube/channel/stream', async (req, res) => {
  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };
  try {
    const { channelUrl, maxVideos = 10 } = req.body;
    const max = Math.min(100, Math.max(1, parseInt(String(maxVideos), 10) || 10));
    if (!channelUrl || !channelUrl.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'channelUrl required' }));
    }
    if (!YOUTUBE_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'YouTube API key not configured' }));
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const totalSteps = 2 * max;
    send({ progress: 0, total: totalSteps, message: 'Resolving channel...' });
    const parsed = parseChannelUrl(channelUrl);
    if (!parsed) {
      send({ error: 'Invalid channel URL' });
      return res.end();
    }
    const channelId = await getChannelId(parsed);
    send({ progress: 0, total: totalSteps, message: 'Fetching video list...' });
    const uploadsId = await getUploadsPlaylistId(channelId);
    const videoIds = await getPlaylistVideoIds(uploadsId, max);
    for (let i = 0; i < videoIds.length; i++) {
      send({ progress: i + 1, total: totalSteps, message: `Video ${i + 1}/${max}` });
      await new Promise((r) => setImmediate(r));
    }
    send({ progress: max, total: totalSteps, message: 'Fetching details...' });
    const videos = await getVideoDetails(videoIds);
    for (let i = 0; i < videos.length; i++) {
      send({ progress: max + i + 1, total: totalSteps, message: `Transcript ${i + 1}/${videos.length}...` });
      await new Promise((r) => setImmediate(r));
      try {
        const chunks = await YoutubeTranscript.fetchTranscript(videos[i].video_id);
        videos[i].transcript = chunks?.length ? chunks.map((c) => c.text).join(' ') : null;
      } catch {
        videos[i].transcript = null;
      }
    }
    const slug = channelUrl.includes('veritasium') && max === 10 ? 'veritasium-channel-10' : `youtube-channel-${channelId}`;
    const publicDir = path.join(__dirname, '../public');
    const filename = `${slug}.json`;
    const filepath = path.join(publicDir, filename);
    try {
      fs.writeFileSync(filepath, JSON.stringify({ channelId, videos }, null, 2));
    } catch (e) {
      console.warn('Could not save to public folder:', e.message);
    }
    send({ done: true, channelId, videos, savedTo: filename });
    res.end();
  } catch (err) {
    send({ error: err.message || 'Failed to fetch channel data' });
    res.end();
  }
});

// ── Image generation (gemini-2.5-flash-image via generateContent, same as AI Reel Maker)
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, imageBase64, mimeType } = req.body;
    const key = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!key) return res.status(503).json({ error: 'Gemini API key not configured' });
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt required' });

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

    const textPrompt = imageBase64
      ? `Generate an image similar to this reference but with these changes: ${prompt}`
      : prompt;

    const parts = [{ text: textPrompt }];
    if (imageBase64) {
      parts.push({
        inlineData: { mimeType: mimeType || 'image/png', data: imageBase64 },
      });
    }

    const result = await model.generateContent(parts);
    const response = result.response;
    const candidateParts = response?.candidates?.[0]?.content?.parts || [];

    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        return res.json({
          ok: true,
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        });
      }
    }
    return res.status(502).json({ error: 'Model did not return an image. Try a different prompt.' });
  } catch (err) {
    console.error('[Image gen]', err?.message || err);
    res.status(500).json({ error: err?.message || 'Image generation failed' });
  }
});

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
