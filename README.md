# ◇ Claude CLI Web

Web interface ที่จำลองการใช้งาน Claude CLI อย่างครบถ้วน ทั้งรูปแบบ Terminal, Streaming response, Markdown rendering, Slash commands และ Keyboard shortcuts

![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)
![Easypanel](https://img.shields.io/badge/Easypanel-Compatible-purple)

---

## สารบัญ

- [Features](#features)
- [Tech Stack](#tech-stack)
- [การติดตั้งแบบ Local](#การติดตั้งแบบ-local)
- [การติดตั้งบน Easypanel](#การติดตั้งบน-easypanel)
- [การใช้งาน](#การใช้งาน)
- [Slash Commands](#slash-commands)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [โครงสร้างโปรเจค](#โครงสร้างโปรเจค)
- [Environment Variables](#environment-variables)

---

## Features

| Feature | รายละเอียด |
|---------|-----------|
| **Terminal UI** | Dark theme สไตล์ terminal พร้อม monospace font |
| **Streaming** | แสดงผลแบบ real-time ผ่าน WebSocket พร้อม animated cursor |
| **Markdown** | รองรับ GitHub Flavored Markdown ครบถ้วน |
| **Code Highlighting** | Syntax highlighting สำหรับทุกภาษา พร้อมปุ่ม Copy |
| **Slash Commands** | `/help`, `/clear`, `/model`, `/system`, `/history` และอื่นๆ |
| **Keyboard Shortcuts** | Enter, Shift+Enter, Escape, Ctrl+C, Ctrl+L, Arrow keys |
| **Thinking Display** | แสดง Thinking block แบบ collapse ได้ |
| **Token Tracking** | นับ token ต่อข้อความ และสะสมรวม |
| **Abort** | ยกเลิก response ที่กำลัง stream ได้ทันที |
| **Command History** | เลื่อนดูคำสั่งก่อนหน้าด้วยปุ่มลูกศร |
| **Responsive** | ใช้งานได้ทั้ง Desktop และ Mobile |

---

## Tech Stack

- **Backend:** Node.js + Express + WebSocket (ws)
- **Frontend:** Vanilla HTML/CSS/JS (ไม่มี framework — เร็วและเบา)
- **API:** Anthropic Claude API (@anthropic-ai/sdk)
- **Markdown:** marked.js + highlight.js
- **Container:** Docker (Alpine Linux)

---

## การติดตั้งแบบ Local

### ขั้นตอนที่ 1 — Clone โปรเจค

```bash
git clone https://github.com/Endlessedwork/Claude-cli.git
cd Claude-cli
```

### ขั้นตอนที่ 2 — ติดตั้ง Dependencies

```bash
npm install
```

### ขั้นตอนที่ 3 — ตั้งค่า API Key

```bash
cp .env.example .env
```

แก้ไขไฟล์ `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
PORT=3000
DEFAULT_MODEL=claude-sonnet-4-20250514
```

> หากยังไม่มี API Key สามารถใส่ทีหลังผ่านหน้าเว็บได้ (จะมี popup ขึ้นให้กรอก)

### ขั้นตอนที่ 4 — รันเซิร์ฟเวอร์

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

เปิดเบราว์เซอร์ไปที่ **http://localhost:3000**

---

## การติดตั้งบน Easypanel

### สิ่งที่ต้องมี

- เซิร์ฟเวอร์ VPS (Ubuntu 20.04+ แนะนำ RAM 2GB ขึ้นไป)
- Easypanel ติดตั้งเรียบร้อยแล้ว
- Anthropic API Key

### ขั้นตอนที่ 1 — ติดตั้ง Easypanel (ถ้ายังไม่มี)

SSH เข้าเซิร์ฟเวอร์แล้วรันคำสั่ง:

```bash
# ติดตั้ง Docker
curl -fsSL https://get.docker.com | sh

# ติดตั้ง Easypanel
curl -sSL https://get.easypanel.io | sh
```

เข้า Easypanel ผ่าน **http://YOUR_SERVER_IP:3000** แล้วตั้งค่า admin account

### ขั้นตอนที่ 2 — สร้าง Project

1. เข้า Easypanel Dashboard
2. คลิก **"+ Create Project"**
3. ตั้งชื่อ Project เช่น `claude-cli`

![Create Project](https://img.shields.io/badge/Step-Create_Project-blue)

### ขั้นตอนที่ 3 — สร้าง App Service

1. ภายใน Project คลิก **"+ Service"**
2. เลือก **"App"**
3. ตั้งชื่อ Service เช่น `web`

### ขั้นตอนที่ 4 — เชื่อมต่อ GitHub Repository

ในหน้าตั้งค่า Service:

1. ไปที่แท็บ **"Source"**
2. เลือก **"GitHub"** (เชื่อมต่อ GitHub account ถ้ายังไม่ได้ทำ)
3. เลือก Repository: `Endlessedwork/Claude-cli`
4. เลือก Branch: `claude/claude-cli-web-interface-0BTcu`
5. **Build Method:** เลือก **"Dockerfile"** (ระบบจะใช้ `Dockerfile` ที่อยู่ใน root)

> **หมายเหตุ:** สามารถใช้ Nixpacks แทนได้ — Easypanel จะ auto-detect จาก `package.json` โดยอัตโนมัติ

### ขั้นตอนที่ 5 — ตั้งค่า Environment Variables

1. ไปที่แท็บ **"Environment"**
2. เพิ่มตัวแปรดังนี้:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
PORT=3000
DEFAULT_MODEL=claude-sonnet-4-20250514
```

| ตัวแปร | ค่า | จำเป็น |
|--------|-----|--------|
| `ANTHROPIC_API_KEY` | API Key จาก [console.anthropic.com](https://console.anthropic.com/) | ใช่ |
| `PORT` | `3000` | ไม่ (default: 3000) |
| `DEFAULT_MODEL` | ชื่อโมเดล เช่น `claude-sonnet-4-20250514` | ไม่ |

### ขั้นตอนที่ 6 — ตั้งค่า Port

1. ไปที่แท็บ **"Proxy"** (หรือ General settings)
2. ตั้งค่า **Proxy Port** เป็น `3000`
3. Easypanel จะ route traffic จาก port 80/443 มาที่ container port 3000 ให้อัตโนมัติ

### ขั้นตอนที่ 7 — ตั้งค่า Domain

1. ไปที่แท็บ **"Domains"**
2. คลิก **"+ Add Domain"**
3. ใส่ domain ของคุณ เช่น `claude.yourdomain.com`
4. ไปที่ DNS Provider ชี้ **A Record** ไปที่ IP เซิร์ฟเวอร์:

```
Type: A
Name: claude
Value: YOUR_SERVER_IP
TTL: 300
```

> Easypanel จะออก **SSL Certificate (Let's Encrypt)** ให้อัตโนมัติ ไม่ต้องตั้งค่าเพิ่ม

### ขั้นตอนที่ 8 — Deploy

1. คลิกปุ่ม **"Deploy"**
2. รอ Easypanel build Docker image จาก Dockerfile
3. เมื่อ Status เป็น **Running** ✅ เปิด domain ที่ตั้งไว้ได้เลย

### (เสริม) เปิด Auto Deploy

ไปที่แท็บ **"Source"** → เปิดตัวเลือก **"Auto Deploy"**

ทุกครั้งที่ push code ไปยัง GitHub, Easypanel จะ build และ deploy ใหม่อัตโนมัติ

---

## สรุปขั้นตอน Easypanel (Quick Reference)

```
1. Create Project      → ตั้งชื่อ "claude-cli"
2. Add App Service     → ตั้งชื่อ "web"
3. Source              → GitHub repo + Branch + Dockerfile
4. Environment         → ANTHROPIC_API_KEY, PORT=3000
5. Proxy Port          → 3000
6. Domain              → claude.yourdomain.com + DNS A Record
7. Deploy              → คลิก Deploy → รอ Running ✅
```

---

## การใช้งาน

### หน้าจอหลัก

เมื่อเปิดเว็บขึ้นมาจะพบหน้า Terminal-style interface:

- **Top Bar** — แสดงโมเดลปัจจุบัน, สถานะ (Ready/Thinking/Streaming), จำนวน token
- **Terminal Area** — พื้นที่แสดงข้อความ รองรับ Markdown, Code block, Thinking block
- **Input Area** — ช่องพิมพ์ข้อความด้านล่าง พร้อม prompt symbol `❯`

### เริ่มสนทนา

1. พิมพ์ข้อความในช่อง input
2. กด **Enter** เพื่อส่ง
3. ระบบจะแสดง Thinking → Streaming response ทีละตัวอักษร
4. เมื่อ response จบจะแสดง token usage

### ตั้งค่า API Key ผ่านหน้าเว็บ

หากไม่ได้ตั้ง `ANTHROPIC_API_KEY` ใน environment ระบบจะแสดง popup ให้กรอก API Key เมื่อเปิดหน้าเว็บ

---

## Slash Commands

| Command | รายละเอียด |
|---------|-----------|
| `/help` | แสดงรายการคำสั่งทั้งหมด |
| `/clear` | ล้างประวัติสนทนาและหน้าจอ |
| `/model <name>` | เปลี่ยนโมเดล เช่น `/model claude-opus-4-20250514` |
| `/system <prompt>` | ตั้ง System prompt |
| `/history` | แสดงสรุปประวัติสนทนา |
| `/compact` | บีบอัดประวัติเพื่อประหยัด context |
| `/cost` | แสดงรายงาน token ที่ใช้ |
| `/config` | แสดงการตั้งค่าปัจจุบัน |

---

## Keyboard Shortcuts

| Shortcut | การทำงาน |
|----------|---------|
| `Enter` | ส่งข้อความ |
| `Shift + Enter` | ขึ้นบรรทัดใหม่ |
| `Escape` | ยกเลิก response ที่กำลัง stream |
| `Ctrl + C` | ยกเลิก response (เหมือน CLI) |
| `Ctrl + L` | ล้างหน้าจอ |
| `↑` (Arrow Up) | เรียกคำสั่งก่อนหน้า |
| `↓` (Arrow Down) | เรียกคำสั่งถัดไป |

---

## โครงสร้างโปรเจค

```
Claude-cli/
├── server/
│   ├── index.js              # Express server + WebSocket
│   ├── websocket.js          # Session, commands, chat handler
│   └── api/
│       └── claude.js         # Anthropic SDK streaming
├── public/
│   ├── index.html            # Terminal-style layout
│   ├── css/
│   │   ├── style.css         # Dark theme (Claude CLI style)
│   │   └── markdown.css      # Markdown rendering styles
│   └── js/
│       ├── app.js            # WebSocket client + input handling
│       ├── terminal.js       # Terminal UI component
│       └── markdown-renderer.js  # Marked.js + Highlight.js
├── Dockerfile                # Docker build config
├── .dockerignore             # Docker ignore rules
├── .env.example              # Environment template
├── package.json              # Dependencies
└── README.md                 # เอกสารนี้
```

---

## Environment Variables

| ตัวแปร | รายละเอียด | ค่า Default |
|--------|-----------|------------|
| `ANTHROPIC_API_KEY` | API Key สำหรับเรียก Claude API | *(จำเป็น)* |
| `PORT` | Port ที่เซิร์ฟเวอร์รัน | `3000` |
| `DEFAULT_MODEL` | โมเดลเริ่มต้น | `claude-sonnet-4-20250514` |

### โมเดลที่รองรับ

| Model ID | รายละเอียด |
|----------|-----------|
| `claude-opus-4-6` | Opus 4.6 — ฉลาดที่สุด |
| `claude-sonnet-4-5-20250929` | Sonnet 4.5 — สมดุลเร็ว+ฉลาด |
| `claude-haiku-4-5-20251001` | Haiku 4.5 — เร็วและประหยัด |

เปลี่ยนโมเดลได้ตลอดเวลาผ่านคำสั่ง `/model <model-id>` ในหน้าเว็บ

---

## Docker (Manual)

หากต้องการรัน Docker โดยตรง โดยไม่ผ่าน Easypanel:

```bash
# Build
docker build -t claude-cli-web .

# Run
docker run -d \
  --name claude-cli \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx \
  -e DEFAULT_MODEL=claude-sonnet-4-20250514 \
  claude-cli-web
```

เปิด **http://localhost:3000**

---

## License

MIT
