/**
 * 협업 관리자
 * 실시간 협업 세션과 사용자 상호작용을 관리
 */

export class CollaborationManager {
  constructor(options = {}) {
    this.options = {
      maxConcurrentSessions: 50,
      sessionTimeout: 3600000, // 1시간
      enableAwareness: true,
      enablePresence: true,
      enableCursors: true,
      ...options
    };

    this.eventBus = options.eventBus;
    this.logger = options.logger;
    
    // 활성 협업 세션들
    this.activeSessions = new Map();
    
    // 사용자 프레즌스 정보
    this.userPresence = new Map();
    
    // 커서 위치 정보
    this.cursors = new Map();
    
    // 메트릭스
    this.metrics = {
      totalSessions: 0,
      activeUsers: 0,
      messagesProcessed: 0,
      lastActivity: null
    };

    this.isInitialized = false;
  }

  /**
   * 협업 관리자 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing CollaborationManager...');
      
      // 이벤트 리스너 설정
      this._setupEventListeners();
      
      // 정리 타이머 시작
      this._startCleanupTimer();
      
      this.isInitialized = true;
      this.logger.info('CollaborationManager initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize CollaborationManager:', error);
      throw error;
    }
  }

  /**
   * 협업 세션 생성
   * @param {string} documentId - 문서 ID
   * @param {string} userId - 사용자 ID
   * @param {Object} options - 세션 옵션
   * @returns {Object} 세션 정보
   */
  createSession(documentId, userId, options = {}) {
    const sessionId = this._generateSessionId();
    
    const session = {
      id: sessionId,
      documentId,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      permissions: options.permissions || ['read', 'write'],
      metadata: {
        clientInfo: options.clientInfo || {},
        features: {
          awareness: this.options.enableAwareness,
          presence: this.options.enablePresence,
          cursors: this.options.enableCursors
        }
      }
    };

    this.activeSessions.set(sessionId, session);
    this.metrics.totalSessions++;
    
    // 사용자 프레즌스 설정
    if (this.options.enablePresence) {
      this._updateUserPresence(userId, documentId, {
        status: 'active',
        sessionId,
        joinedAt: Date.now()
      });
    }

    this.eventBus.emit('collaboration:session-created', {
      sessionId,
      documentId,
      userId,
      timestamp: Date.now()
    });

    this.logger.debug(`Collaboration session created: ${sessionId} for user ${userId} in document ${documentId}`);
    
    return session;
  }

  /**
   * 협업 세션 종료
   * @param {string} sessionId - 세션 ID
   */
  endSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      this.logger.warn(`Attempted to end non-existent session: ${sessionId}`);
      return;
    }

    // 사용자 프레즌스 업데이트
    if (this.options.enablePresence) {
      this._updateUserPresence(session.userId, session.documentId, {
        status: 'offline',
        sessionId: null,
        leftAt: Date.now()
      });
    }

    // 커서 정보 제거
    if (this.options.enableCursors) {
      this._removeCursor(session.userId, session.documentId);
    }

    this.activeSessions.delete(sessionId);

    this.eventBus.emit('collaboration:session-ended', {
      sessionId,
      documentId: session.documentId,
      userId: session.userId,
      duration: Date.now() - session.createdAt,
      timestamp: Date.now()
    });

    this.logger.debug(`Collaboration session ended: ${sessionId}`);
  }

  /**
   * 사용자 활동 업데이트
   * @param {string} sessionId - 세션 ID
   * @param {Object} activity - 활동 정보
   */
  updateActivity(sessionId, activity) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return;
    }

    session.lastActivity = Date.now();
    this.metrics.lastActivity = Date.now();
    this.metrics.messagesProcessed++;

    // 커서 위치 업데이트
    if (activity.cursor && this.options.enableCursors) {
      this._updateCursor(session.userId, session.documentId, activity.cursor);
    }

    // 프레즌스 업데이트
    if (activity.presence && this.options.enablePresence) {
      this._updateUserPresence(session.userId, session.documentId, {
        ...activity.presence,
        lastSeen: Date.now()
      });
    }

    this.eventBus.emit('collaboration:activity-updated', {
      sessionId,
      documentId: session.documentId,
      userId: session.userId,
      activity,
      timestamp: Date.now()
    });
  }

  /**
   * 문서의 활성 사용자 조회
   * @param {string} documentId - 문서 ID
   * @returns {Array} 활성 사용자 목록
   */
  getActiveUsers(documentId) {
    const activeUsers = [];
    
    for (const session of this.activeSessions.values()) {
      if (session.documentId === documentId && session.status === 'active') {
        const presence = this.userPresence.get(`${session.userId}:${documentId}`);
        const cursor = this.cursors.get(`${session.userId}:${documentId}`);
        
        activeUsers.push({
          userId: session.userId,
          sessionId: session.id,
          joinedAt: session.createdAt,
          lastActivity: session.lastActivity,
          permissions: session.permissions,
          presence: presence || null,
          cursor: cursor || null
        });
      }
    }
    
    return activeUsers;
  }

  /**
   * 협업 세션 정보 조회
   * @param {string} sessionId - 세션 ID
   * @returns {Object|null} 세션 정보
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * 문서별 세션 목록 조회
   * @param {string} documentId - 문서 ID
   * @returns {Array} 세션 목록
   */
  getDocumentSessions(documentId) {
    const sessions = [];
    
    for (const session of this.activeSessions.values()) {
      if (session.documentId === documentId) {
        sessions.push(session);
      }
    }
    
    return sessions;
  }

  /**
   * 메트릭스 조회
   * @returns {Object} 협업 메트릭스
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeSessions: this.activeSessions.size,
      activeUsers: this._countActiveUsers(),
      documentsWithUsers: this._countDocumentsWithUsers(),
      averageSessionDuration: this._calculateAverageSessionDuration()
    };
  }

  /**
   * 이벤트 리스너 설정
   * @private
   */
  _setupEventListeners() {
    // 문서 변경 이벤트
    this.eventBus.on('document:changed', (data) => {
      this._broadcastDocumentChange(data);
    });

    // 사용자 연결 해제 이벤트
    this.eventBus.on('user:disconnected', (data) => {
      this._handleUserDisconnection(data);
    });
  }

  /**
   * 문서 변경 사항 브로드캐스트
   * @private
   * @param {Object} data - 변경 데이터
   */
  _broadcastDocumentChange(data) {
    const sessions = this.getDocumentSessions(data.documentId);
    
    sessions.forEach(session => {
      // 변경을 수행한 사용자 제외
      if (session.userId !== data.userId) {
        this.eventBus.emit('collaboration:broadcast-change', {
          targetSessionId: session.id,
          change: data.change,
          sourceUserId: data.userId,
          timestamp: Date.now()
        });
      }
    });
  }

  /**
   * 사용자 연결 해제 처리
   * @private
   * @param {Object} data - 연결 해제 데이터
   */
  _handleUserDisconnection(data) {
    // 해당 사용자의 모든 세션 종료
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.userId === data.userId) {
        this.endSession(sessionId);
      }
    }
  }

  /**
   * 사용자 프레즌스 업데이트
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @param {Object} presence - 프레즌스 정보
   */
  _updateUserPresence(userId, documentId, presence) {
    const key = `${userId}:${documentId}`;
    const existing = this.userPresence.get(key) || {};
    
    this.userPresence.set(key, {
      ...existing,
      ...presence,
      updatedAt: Date.now()
    });

    this.eventBus.emit('collaboration:presence-updated', {
      userId,
      documentId,
      presence: this.userPresence.get(key),
      timestamp: Date.now()
    });
  }

  /**
   * 커서 위치 업데이트
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @param {Object} cursor - 커서 정보
   */
  _updateCursor(userId, documentId, cursor) {
    const key = `${userId}:${documentId}`;
    
    this.cursors.set(key, {
      ...cursor,
      userId,
      documentId,
      updatedAt: Date.now()
    });

    this.eventBus.emit('collaboration:cursor-updated', {
      userId,
      documentId,
      cursor: this.cursors.get(key),
      timestamp: Date.now()
    });
  }

  /**
   * 커서 제거
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   */
  _removeCursor(userId, documentId) {
    const key = `${userId}:${documentId}`;
    this.cursors.delete(key);

    this.eventBus.emit('collaboration:cursor-removed', {
      userId,
      documentId,
      timestamp: Date.now()
    });
  }

  /**
   * 정리 타이머 시작
   * @private
   */
  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupInactiveSessions();
    }, 60000); // 1분마다 정리
  }

  /**
   * 비활성 세션 정리
   * @private
   */
  _cleanupInactiveSessions() {
    const now = Date.now();
    const sessionsToRemove = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > this.options.sessionTimeout) {
        sessionsToRemove.push(sessionId);
      }
    }

    sessionsToRemove.forEach(sessionId => {
      this.logger.debug(`Cleaning up inactive session: ${sessionId}`);
      this.endSession(sessionId);
    });

    if (sessionsToRemove.length > 0) {
      this.logger.info(`Cleaned up ${sessionsToRemove.length} inactive sessions`);
    }
  }

  /**
   * 활성 사용자 수 계산
   * @private
   * @returns {number} 활성 사용자 수
   */
  _countActiveUsers() {
    const activeUserIds = new Set();
    
    for (const session of this.activeSessions.values()) {
      if (session.status === 'active') {
        activeUserIds.add(session.userId);
      }
    }
    
    return activeUserIds.size;
  }

  /**
   * 사용자가 있는 문서 수 계산
   * @private
   * @returns {number} 문서 수
   */
  _countDocumentsWithUsers() {
    const documentsWithUsers = new Set();
    
    for (const session of this.activeSessions.values()) {
      if (session.status === 'active') {
        documentsWithUsers.add(session.documentId);
      }
    }
    
    return documentsWithUsers.size;
  }

  /**
   * 평균 세션 지속 시간 계산
   * @private
   * @returns {number} 평균 지속 시간 (밀리초)
   */
  _calculateAverageSessionDuration() {
    if (this.activeSessions.size === 0) {
      return 0;
    }

    const now = Date.now();
    let totalDuration = 0;

    for (const session of this.activeSessions.values()) {
      totalDuration += now - session.createdAt;
    }

    return totalDuration / this.activeSessions.size;
  }

  /**
   * 세션 ID 생성
   * @private
   * @returns {string} 세션 ID
   */
  _generateSessionId() {
    return 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 협업 관리자 정리
   */
  async destroy() {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Destroying CollaborationManager...');

    // 정리 타이머 중지
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 모든 세션 종료
    const sessionIds = Array.from(this.activeSessions.keys());
    sessionIds.forEach(sessionId => {
      this.endSession(sessionId);
    });

    // 데이터 정리
    this.activeSessions.clear();
    this.userPresence.clear();
    this.cursors.clear();

    this.isInitialized = false;
    this.logger.info('CollaborationManager destroyed');
  }
}