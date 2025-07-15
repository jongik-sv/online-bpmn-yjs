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

    this.wss.on('connection', (ws, req) => {
      try {
        // Y.js의 내장 WebSocket 처리 사용 (참고: online-bpmn-design 프로젝트)
        setupWSConnection(ws, req, {
          gc: true
        });
        
        // 연결 로깅
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;
        const documentId = pathname.replace('/collaboration/', '') || 'default';
        
        this.logger.info(`New WebSocket connection for document: ${documentId}`);
        
      } catch (error) {
        this.logger.error('Connection handling error:', error.message);
        ws.close();
      }
    });

    this.logger.info('WebSocket server initialized on /collaboration');
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