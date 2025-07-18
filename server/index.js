/**
 * Express.js 기반 BPMN 협업 서버
 * 실시간 협업을 위한 WebSocket과 Y.js 통합 서버
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import { setupWSConnection } from 'y-websocket/bin/utils';

import { Logger } from '../src/utils/Logger.js';
import { EventBus } from '../src/utils/EventBus.js';
import { CollaborationManager } from './services/CollaborationManager.js';
import { DocumentManager } from './services/DocumentManager.js';
import { UserManager } from './services/UserManager.js';
import { SessionManager } from './services/SessionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BpmnCollaborationServer {
  constructor(options = {}) {
    this.options = {
      port: process.env.PORT || 3001,
      host: process.env.HOST || 'localhost',
      enableCORS: true,
      staticPath: path.join(__dirname, '../dist'),
      maxDocuments: 100,
      maxUsersPerDocument: 50,
      documentTimeout: 3600000, // 1시간
      enableMetrics: true,
      enableLogging: true,
      ...options
    };

    // 유틸리티 초기화
    this.logger = new Logger({
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: true
    });
    
    this.eventBus = new EventBus();
    
    // Express 앱 초기화
    this.app = express();
    this.server = createServer(this.app);
    
    // 서비스 매니저들
    this.collaborationManager = new CollaborationManager({
      eventBus: this.eventBus,
      logger: this.logger
    });
    
    this.documentManager = new DocumentManager({
      maxDocuments: this.options.maxDocuments,
      documentTimeout: this.options.documentTimeout,
      logger: this.logger
    });
    
    this.userManager = new UserManager({
      maxUsersPerDocument: this.options.maxUsersPerDocument,
      logger: this.logger
    });
    
    this.sessionManager = new SessionManager({
      logger: this.logger,
      eventBus: this.eventBus
    });

    // WebSocket 서버
    this.wss = null;
    
    // 서버 상태
    this.isRunning = false;
    this.startTime = null;
    
    this._setupMiddleware();
    this._setupRoutes();
    this._setupErrorHandling();
    this._setupEventHandlers();
  }

  /**
   * 서버 시작
   * @returns {Promise<void>}
   */
  async start() {
    try {
      // WebSocket 서버 설정
      this._setupWebSocketServer();
      
      // HTTP 서버 시작
      await new Promise((resolve, reject) => {
        this.server.listen(this.options.port, this.options.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;
      this.startTime = Date.now();
      
      this.logger.info(`BPMN Collaboration Server started on ${this.options.host}:${this.options.port}`);
      
      // 서비스 매니저들 초기화
      await this.collaborationManager.initialize();
      await this.documentManager.initialize();
      await this.userManager.initialize();
      
    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * 서버 중지
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      this.logger.info('Stopping BPMN Collaboration Server...');
      
      // WebSocket 연결들 정리
      if (this.wss) {
        this.wss.clients.forEach(ws => {
          ws.terminate();
        });
        this.wss.close();
      }
      
      // HTTP 서버 중지
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      
      // 서비스 매니저들 정리
      await this.collaborationManager.destroy();
      await this.documentManager.destroy();
      await this.userManager.destroy();
      await this.sessionManager.destroy();
      
      this.isRunning = false;
      this.logger.info('Server stopped successfully');
      
    } catch (error) {
      this.logger.error('Error stopping server:', error);
      throw error;
    }
  }

  /**
   * 미들웨어 설정
   * @private
   */
  _setupMiddleware() {
    // CORS 설정
    if (this.options.enableCORS) {
      this.app.use(cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      }));
    }

    // JSON 파싱
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // 정적 파일 서빙
    this.app.use('/static', express.static(this.options.staticPath));

    // 로깅 미들웨어
    if (this.options.enableLogging) {
      this.app.use((req, res, next) => {
        const start = Date.now();
        
        res.on('finish', () => {
          const duration = Date.now() - start;
          this.logger.info(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
        });
        
        next();
      });
    }
  }

  /**
   * 라우트 설정
   * @private
   */
  _setupRoutes() {
    // 헬스 체크
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: this.isRunning ? Date.now() - this.startTime : 0,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // 서버 정보
    this.app.get('/info', (req, res) => {
      res.json({
        server: 'BPMN Collaboration Server',
        version: '1.0.0',
        features: ['real-time-collaboration', 'diff-synchronization', 'y-js-crdt'],
        limits: {
          maxDocuments: this.options.maxDocuments,
          maxUsersPerDocument: this.options.maxUsersPerDocument
        }
      });
    });

    // 문서 관련 API
    this.app.get('/api/documents', async (req, res) => {
      try {
        const documents = await this.documentManager.getDocuments();
        res.json(documents);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/documents', async (req, res) => {
      try {
        const { name, initialData } = req.body;
        const document = await this.documentManager.createDocument(name, initialData);
        res.status(201).json(document);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/documents/:id', async (req, res) => {
      try {
        const document = await this.documentManager.getDocument(req.params.id);
        if (!document) {
          return res.status(404).json({ error: 'Document not found' });
        }
        res.json(document);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/documents/:id', async (req, res) => {
      try {
        await this.documentManager.deleteDocument(req.params.id);
        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 사용자 관련 API
    this.app.get('/api/documents/:id/users', async (req, res) => {
      try {
        const users = await this.userManager.getDocumentUsers(req.params.id);
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 협업 세션 API
    this.app.get('/api/documents/:id/sessions', async (req, res) => {
      try {
        const sessions = await this.sessionManager.getDocumentSessions(req.params.id);
        res.json(sessions);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 메트릭스 API
    if (this.options.enableMetrics) {
      this.app.get('/api/metrics', (req, res) => {
        res.json({
          server: {
            uptime: this.isRunning ? Date.now() - this.startTime : 0,
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
          },
          collaboration: this.collaborationManager.getMetrics(),
          documents: this.documentManager.getMetrics(),
          users: this.userManager.getMetrics(),
          websockets: {
            connections: this.wss ? this.wss.clients.size : 0
          }
        });
      });
    }

    // 기본 라우트
    this.app.get('/', (req, res) => {
      res.json({
        message: 'BPMN Collaboration Server',
        version: '1.0.0',
        documentation: '/api/docs'
      });
    });
  }

  /**
   * WebSocket 서버 설정
   * @private
   */
  _setupWebSocketServer() {
    this.wss = new WebSocketServer({ 
      server: this.server
    });

    this.wss.on('connection', async (ws, req) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;
        
        // Y.js 연결과 일반 협업 연결 구분
        if (pathname.startsWith('/collaboration/')) {
          // Y.js의 내장 WebSocket 처리 사용 (기존 방식)
          const documentId = pathname.replace('/collaboration/', '') || 'default';
          
          // DocumentManager에서 Y.js 문서 가져오기 또는 생성
          let yjsDoc = this.documentManager.getYjsDocument(documentId);
          if (!yjsDoc) {
            // 문서가 없으면 새로 생성
            const docInfo = await this.documentManager.createDocument(`Document ${documentId}`);
            yjsDoc = this.documentManager.getYjsDocument(docInfo.id);
            this.logger.info(`Created new document for Y.js: ${documentId}`);
          }
          
          // Y.js 연결 설정 (DocumentManager의 문서 사용)
          setupWSConnection(ws, req, {
            gc: true,
            docName: documentId,
            getYDoc: () => yjsDoc
          });
          
          this.logger.info(`New Y.js WebSocket connection for document: ${documentId}`);
          
        } else {
          // 새로운 Silent Update 협업 연결 처리
          this._handleCollaborationConnection(ws, req);
        }
        
      } catch (error) {
        this.logger.error('Connection handling error:', error.message);
        ws.close();
      }
    });

    this.logger.info('WebSocket server initialized - Y.js on /collaboration, Collaboration on /');
  }

  /**
   * 새로운 협업 연결 처리
   * @private
   */
  _handleCollaborationConnection(ws, req) {
    // 연결 메타데이터
    ws.userId = null;
    ws.documentId = null;
    ws.userInfo = null;
    ws.isAlive = true;

    // 하트비트 설정
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 메시지 처리
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this._handleWebSocketMessage(ws, message);
      } catch (error) {
        this.logger.error('Invalid WebSocket message:', error.message);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format'
        }));
      }
    });

    // 연결 해제 처리
    ws.on('close', () => {
      this._handleWebSocketDisconnection(ws);
    });

    // 오류 처리
    ws.on('error', (error) => {
      this.logger.error('WebSocket error:', error.message);
    });

    this.logger.info('New collaboration WebSocket connection established');
  }

  /**
   * WebSocket 메시지 처리
   * @private
   */
  _handleWebSocketMessage(ws, message) {
    try {
      switch (message.type) {
        case 'user_join':
          this._handleUserJoin(ws, message);
          break;
        case 'user_leave':
          this._handleUserLeave(ws, message);
          break;
        case 'model_change':
          this._handleModelChange(ws, message);
          break;
        case 'batch_update':
          this._handleBatchUpdate(ws, message);
          break;
        case 'cursor_position':
          this._handleCursorPosition(ws, message);
          break;
        case 'cursor_hidden':
          this._handleCursorHidden(ws, message);
          break;
        case 'user_selection':
          this._handleUserSelection(ws, message);
          break;
        case 'heartbeat':
          this._handleHeartbeat(ws, message);
          break;
        case 'heartbeat_response':
          // 하트비트 응답은 로깅만
          break;
        case 'sync_request':
          this._handleSyncRequest(ws, message);
          break;
        case 'sync_response':
          this._handleSyncResponse(ws, message);
          break;
        default:
          this.logger.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      this.logger.error('Error handling WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Message processing failed'
      }));
    }
  }

  /**
   * 사용자 참가 처리
   * @private
   */
  _handleUserJoin(ws, message) {
    ws.userId = message.user.id;
    ws.userInfo = message.user;
    
    // 현재 연결된 모든 사용자 목록 수집
    const connectedUsers = [];
    this.wss.clients.forEach(client => {
      if (client.userInfo && client.readyState === 1) { // OPEN state
        connectedUsers.push(client.userInfo);
      }
    });

    // 새 사용자에게 현재 사용자 목록 전송
    ws.send(JSON.stringify({
      type: 'users_list',
      users: connectedUsers,
      timestamp: Date.now()
    }));
    
    // 다른 클라이언트들에게 사용자 참가 알림
    this._broadcast(ws, {
      type: 'user_joined',
      user: message.user,
      timestamp: Date.now()
    });

    // 참가 확인 응답
    ws.send(JSON.stringify({
      type: 'user_join_confirmed',
      userId: message.user.id,
      timestamp: Date.now()
    }));

    this.logger.info(`User joined: ${message.user.name} (${message.user.id}), total users: ${connectedUsers.length}`);
  }

  /**
   * 사용자 퇴장 처리
   * @private
   */
  _handleUserLeave(ws, message) {
    this._broadcast(ws, {
      type: 'user_left',
      userId: message.userId,
      timestamp: Date.now()
    });

    this.logger.info(`User left: ${message.userId}`);
  }

  /**
   * 모델 변경 처리
   * @private
   */
  _handleModelChange(ws, message) {
    // 다른 클라이언트들에게 변경사항 브로드캐스트
    this._broadcast(ws, message);
    
    this.logger.debug(`Model change from ${message.userId}:`, message.operation?.type);
  }

  /**
   * 배치 업데이트 처리
   * @private
   */
  _handleBatchUpdate(ws, message) {
    // 배치 업데이트를 개별 업데이트로 분해하여 브로드캐스트
    message.updates.forEach(update => {
      this._broadcast(ws, update);
    });

    this.logger.debug(`Batch update from ${message.userId}: ${message.updates.length} updates`);
  }

  /**
   * 커서 위치 처리
   * @private
   */
  _handleCursorPosition(ws, message) {
    this._broadcast(ws, message);
  }

  /**
   * 커서 숨김 처리
   * @private
   */
  _handleCursorHidden(ws, message) {
    this._broadcast(ws, message);
  }

  /**
   * 사용자 선택 처리
   * @private
   */
  _handleUserSelection(ws, message) {
    this._broadcast(ws, message);
  }

  /**
   * 하트비트 처리
   * @private
   */
  _handleHeartbeat(ws, message) {
    ws.send(JSON.stringify({
      type: 'heartbeat',
      timestamp: Date.now()
    }));
  }

  /**
   * 동기화 요청 처리
   * @private
   */
  _handleSyncRequest(ws, message) {
    // 다른 클라이언트들에게 동기화 요청 전달
    this._broadcast(ws, message);
  }

  /**
   * 동기화 응답 처리
   * @private
   */
  _handleSyncResponse(ws, message) {
    // 동기화 요청자에게 응답 전달 (구현 필요시)
    this.logger.debug('Sync response received from:', message.userId);
  }

  /**
   * WebSocket 연결 해제 처리
   * @private
   */
  _handleWebSocketDisconnection(ws) {
    if (ws.userId) {
      // 다른 클라이언트들에게 사용자 퇴장 알림
      this._broadcast(ws, {
        type: 'user_left',
        userId: ws.userId,
        timestamp: Date.now()
      });

      this.logger.info(`User disconnected: ${ws.userId}`);
    }
  }

  /**
   * 메시지 브로드캐스트 (발신자 제외)
   * @private
   */
  _broadcast(sender, message) {
    if (!this.wss) return;

    const messageStr = JSON.stringify(message);
    
    this.wss.clients.forEach(client => {
      if (client !== sender && client.readyState === client.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          this.logger.error('Error broadcasting message:', error.message);
        }
      }
    });
  }

  /**
   * 오류 처리 설정
   * @private
   */
  _setupErrorHandling() {
    // 404 처리
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} not found`
      });
    });

    // 글로벌 오류 처리
    this.app.use((error, req, res, next) => {
      this.logger.error('Unhandled error:', error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });

    // 프로세스 오류 처리
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  /**
   * 이벤트 핸들러 설정
   * @private
   */
  _setupEventHandlers() {
    // 협업 이벤트
    this.eventBus.on('collaboration:user-joined', (data) => {
      this.logger.info(`User joined: ${data.userId} in document ${data.documentId}`);
    });

    this.eventBus.on('collaboration:user-left', (data) => {
      this.logger.info(`User left: ${data.userId} from document ${data.documentId}`);
    });

    this.eventBus.on('collaboration:document-changed', (data) => {
      this.logger.debug(`Document changed: ${data.documentId} by ${data.userId}`);
    });

    // 시스템 이벤트
    this.eventBus.on('system:error', (error) => {
      this.logger.error('System error:', error);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      this.logger.info('SIGTERM received, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      this.logger.info('SIGINT received, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });
  }

  /**
   * 서버 상태 조회
   * @returns {Object} 서버 상태
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      host: this.options.host,
      port: this.options.port,
      connections: this.wss ? this.wss.clients.size : 0
    };
  }
}

// 서버 인스턴스 생성 및 시작 (항상 실행)
console.log('Starting BPMN Collaboration Server...');
const server = new BpmnCollaborationServer();

server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export { BpmnCollaborationServer };