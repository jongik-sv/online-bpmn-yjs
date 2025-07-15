/**
 * 간단한 BPMN 협업 서버
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import * as Y from 'yjs';

const app = express();
const server = createServer(app);

// CORS 설정
app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (데모 애플리케이션)
app.use('/demo', express.static('demo'));
app.use('/src', express.static('src'));

// Y.js 문서들 저장소
const documents = new Map();

// 기본 라우트 - 데모로 리다이렉트
app.get('/', (req, res) => {
  res.redirect('/demo');
});

// API 정보
app.get('/api', (req, res) => {
  res.json({
    message: 'BPMN Collaboration Server API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      demo: '/demo',
      health: '/health',
      documents: '/api/documents',
      websocket: '/ws'
    }
  });
});

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 문서 목록 조회
app.get('/api/documents', (req, res) => {
  const docList = Array.from(documents.entries()).map(([id, docInfo]) => ({
    id,
    name: docInfo.name,
    createdAt: new Date(docInfo.createdAt).toISOString(),
    userCount: docInfo.users.size,
    users: Array.from(docInfo.users)
  }));
  res.json(docList);
});

// 문서별 사용자 조회
app.get('/api/documents/:id/users', (req, res) => {
  const documentId = req.params.id;
  
  if (!documents.has(documentId)) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  const docInfo = documents.get(documentId);
  const users = Array.from(docInfo.users).map(userId => ({
    id: userId,
    name: userId,
    status: 'online',
    joinedAt: new Date().toISOString()
  }));
  
  res.json(users);
});

// 새 문서 생성
app.post('/api/documents', (req, res) => {
  const { name } = req.body;
  const id = 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
  
  // 새 Y.js 문서 생성
  const yjsDoc = new Y.Doc();
  documents.set(id, {
    doc: yjsDoc,
    name: name || `Document ${id}`,
    createdAt: Date.now(),
    users: new Set()
  });
  
  res.status(201).json({
    id,
    name: name || `Document ${id}`,
    createdAt: new Date().toISOString()
  });
});

// WebSocket 서버 설정
const wss = new WebSocketServer({ 
  server,
  path: '/ws'
});

// WebSocket 클라이언트 정보 저장
const clients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const documentId = url.searchParams.get('document');
  const userId = url.searchParams.get('user') || 'anonymous';

  if (!documentId) {
    ws.close(1008, 'Document ID required');
    return;
  }

  console.log(`WebSocket connected: user=${userId}, document=${documentId}`);

  // 클라이언트 정보 저장
  const clientInfo = {
    ws,
    userId,
    documentId,
    connectedAt: Date.now()
  };
  clients.set(ws, clientInfo);

  // 문서가 없으면 생성
  if (!documents.has(documentId)) {
    const yjsDoc = new Y.Doc();
    documents.set(documentId, {
      doc: yjsDoc,
      name: `Document ${documentId}`,
      createdAt: Date.now(),
      users: new Set()
    });
  }

  // 사용자 추가
  const docInfo = documents.get(documentId);
  docInfo.users.add(userId);

  // 연결 확인 메시지 전송
  ws.send(JSON.stringify({
    type: 'connection_established',
    userId,
    documentId,
    timestamp: Date.now()
  }));

  // 다른 사용자들에게 새 사용자 알림
  broadcastToDocument(documentId, {
    type: 'user_joined',
    userId,
    userName: userId,
    documentId,
    timestamp: Date.now()
  }, ws);

  // 현재 사용자 목록 전송
  const userList = Array.from(docInfo.users);
  ws.send(JSON.stringify({
    type: 'users_list',
    users: userList,
    documentId,
    timestamp: Date.now()
  }));

  // 메시지 처리
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`Message from ${userId}:`, message.type);
      
      // 메시지 타입별 처리
      switch (message.type) {
        case 'document_changed':
        case 'diagram_changed':
        case 'element_changed':
        case 'elements_changed':
          // 문서 변경사항을 다른 사용자들에게 브로드캐스트
          broadcastToDocument(documentId, {
            type: message.type,
            userId,
            userName: userId,
            data: message.data || message,
            changes: message.changes,
            timestamp: Date.now()
          }, ws);
          
          console.log(`Document change broadcasted: ${message.type} by ${userId}`);
          break;
          
        case 'cursor_update':
          // 커서 위치 업데이트
          broadcastToDocument(documentId, {
            type: 'cursor_update',
            userId,
            userName: userId,
            cursor: message.cursor,
            timestamp: Date.now()
          }, ws);
          break;
          
        default:
          // 기타 메시지는 그대로 브로드캐스트
          broadcastToDocument(documentId, message, ws);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  // 연결 해제 처리
  ws.on('close', () => {
    console.log(`WebSocket disconnected: user=${userId}, document=${documentId}`);
    
    // 클라이언트 정보 제거
    clients.delete(ws);
    
    // 사용자 제거
    if (documents.has(documentId)) {
      documents.get(documentId).users.delete(userId);
    }
    
    // 다른 사용자들에게 퇴장 알림
    broadcastToDocument(documentId, {
      type: 'user_left',
      userId,
      userName: userId,
      documentId,
      timestamp: Date.now()
    });
  });

  // 에러 처리
  ws.on('error', (error) => {
    console.error(`WebSocket error: user=${userId}, document=${documentId}`, error);
  });
});

// 특정 문서의 모든 클라이언트에게 메시지 브로드캐스트
function broadcastToDocument(documentId, message, excludeWs = null) {
  clients.forEach((clientInfo, ws) => {
    if (clientInfo.documentId === documentId && 
        ws !== excludeWs && 
        ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Broadcast error:', error);
      }
    }
  });
}

// 에러 처리
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: error.message
  });
});

// 서버 시작
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 BPMN Collaboration Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server running on ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});