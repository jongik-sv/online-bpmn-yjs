import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync.js';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express 앱 설정
const app = express();
const server = createServer(app);
const port = process.env.PORT || 3002;

// CORS 및 JSON 미들웨어
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
// 정적 파일 서빙 (demo 디렉토리)
app.use('/demo', express.static(path.join(__dirname, '../demo')));
app.use(express.static(path.join(__dirname, '../demo')));

// node_modules의 Y.js 라이브러리 직접 서빙
app.use('/libs/yjs', express.static(path.join(__dirname, '../node_modules/yjs')));
app.use('/libs/y-websocket', express.static(path.join(__dirname, '../node_modules/y-websocket')));

// 기본 라우트
app.get('/', (req, res) => {
  res.redirect('/demo/');
});

app.get('/demo/', (req, res) => {
  res.sendFile(path.join(__dirname, '../demo/index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Y.js 문서 저장소
const yjsDocuments = new Map();
const awareness = new Map();

// Y.js 문서 가져오기
function getYDoc(docname) {
  if (!yjsDocuments.has(docname)) {
    const doc = new Y.Doc();
    yjsDocuments.set(docname, doc);
    console.log(`새 Y.js 문서 생성: ${docname}`);
  }
  return yjsDocuments.get(docname);
}

// Y.js Awareness 가져오기
function getAwareness(docname) {
  if (!awareness.has(docname)) {
    awareness.set(docname, new awarenessProtocol.Awareness(getYDoc(docname)));
  }
  return awareness.get(docname);
}

// Y.js WebSocket 서버 설정
const wss = new WebSocketServer({ 
  server,
  path: '/yjs'
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const docname = url.pathname.slice(1) || 'default';
  const userName = url.searchParams.get('user') || 'Anonymous';
  const clientId = url.searchParams.get('clientId') || 'unknown';

  console.log(`Y.js WebSocket connected: user=${userName}, clientId=${clientId}, doc=${docname}`);

  const doc = getYDoc(docname);
  const awareness = getAwareness(docname);
  
  // WebSocket이 열릴 때 동기화 상태 전송
  const encoder = syncProtocol.createSyncReplyMessage(Y.encodeStateAsUpdate(doc), syncProtocol.messageYjsSyncStep1);
  if (encoder.length > 1) {
    ws.send(encoder);
  }

  // 현재 awareness 상태 전송
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const encoder = awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()));
    ws.send(encoder);
  }

  // WebSocket 메시지 핸들러
  ws.on('message', (message) => {
    try {
      const uint8Array = new Uint8Array(message);
      const messageType = uint8Array[0];

      if (messageType >= 0 && messageType <= 2) {
        // Y.js 동기화 메시지
        syncProtocol.readSyncMessage(uint8Array, encoder => {
          if (encoder) {
            ws.send(encoder);
          }
        }, doc, null);
      } else if (messageType === 3) {
        // Awareness 메시지
        awarenessProtocol.applyAwarenessUpdate(awareness, uint8Array.slice(1), ws);
      }
    } catch (error) {
      console.error('Y.js 메시지 처리 오류:', error);
    }
  });

  // 문서 업데이트 이벤트
  const updateHandler = (update, origin) => {
    if (origin !== ws) {
      ws.send(syncProtocol.encodeUpdate(update));
    }
  };
  doc.on('update', updateHandler);

  // Awareness 변경 이벤트
  const awarenessChangeHandler = ({ added, updated, removed }) => {
    const changedClients = added.concat(updated, removed);
    if (changedClients.length > 0) {
      const encoder = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      ws.send(encoder);
    }
  };
  awareness.on('change', awarenessChangeHandler);

  // 연결 해제 처리
  ws.on('close', () => {
    console.log(`Y.js WebSocket disconnected: user=${userName}, clientId=${clientId}, doc=${docname}`);
    
    // 이벤트 리스너 제거
    doc.off('update', updateHandler);
    awareness.off('change', awarenessChangeHandler);
    
    // Awareness에서 클라이언트 제거
    awarenessProtocol.removeAwarenessStates(awareness, [ws.clientID], null);
  });

  // 에러 처리
  ws.on('error', (error) => {
    console.error('Y.js WebSocket 오류:', error);
  });
});

// 서버 시작
server.listen(port, () => {
  console.log(`🚀 Y.js BPMN 협업 서버가 시작되었습니다!`);
  console.log(`📍 서버 주소: http://localhost:${port}`);
  console.log(`🔗 데모 페이지: http://localhost:${port}/demo/`);
  console.log(`🔌 Y.js WebSocket: ws://localhost:${port}/yjs`);
  console.log('');
  console.log('Y.js 기반 실시간 BPMN 협업이 활성화되었습니다!');
});

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});