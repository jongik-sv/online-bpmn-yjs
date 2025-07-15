/**
 * 세션 관리자
 * 협업 세션의 상태와 이벤트를 추적 및 관리
 */

export class SessionManager {
  constructor(options = {}) {
    this.options = {
      maxSessionHistory: 1000,
      sessionTimeout: 3600000, // 1시간
      enableSessionRecording: true,
      enableAnalytics: true,
      cleanupInterval: 300000, // 5분
      ...options
    };

    this.logger = options.logger;
    this.eventBus = options.eventBus;
    
    // 활성 세션들
    this.activeSessions = new Map();
    
    // 세션 히스토리
    this.sessionHistory = [];
    
    // 세션 이벤트 로그
    this.sessionEvents = new Map();
    
    // 세션 통계
    this.sessionStats = new Map();
    
    // 메트릭스
    this.metrics = {
      totalSessions: 0,
      activeSessions: 0,
      averageSessionDuration: 0,
      totalEvents: 0,
      peakConcurrentSessions: 0
    };

    this.isInitialized = false;
    this.cleanupTimer = null;
  }

  /**
   * 세션 관리자 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing SessionManager...');
      
      // 이벤트 리스너 설정
      this._setupEventListeners();
      
      // 정리 타이머 시작
      this._startCleanupTimer();
      
      this.isInitialized = true;
      this.logger.info('SessionManager initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize SessionManager:', error);
      throw error;
    }
  }

  /**
   * 새 세션 생성
   * @param {string} documentId - 문서 ID
   * @param {string} userId - 사용자 ID
   * @param {Object} metadata - 세션 메타데이터
   * @returns {Object} 생성된 세션 정보
   */
  createSession(documentId, userId, metadata = {}) {
    const sessionId = this._generateSessionId();
    
    const session = {
      id: sessionId,
      documentId,
      userId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      events: [],
      metadata: {
        userAgent: metadata.userAgent || null,
        ipAddress: metadata.ipAddress || null,
        clientVersion: metadata.clientVersion || null,
        features: metadata.features || [],
        ...metadata
      },
      stats: {
        totalEvents: 0,
        documentsEdited: new Set([documentId]),
        collaborators: new Set(),
        peakCollaborators: 0
      }
    };

    this.activeSessions.set(sessionId, session);
    this.metrics.totalSessions++;
    this.metrics.activeSessions++;
    
    // 피크 동시 세션 수 업데이트
    if (this.metrics.activeSessions > this.metrics.peakConcurrentSessions) {
      this.metrics.peakConcurrentSessions = this.metrics.activeSessions;
    }

    // 세션 이벤트 로그 초기화
    if (this.options.enableSessionRecording) {
      this.sessionEvents.set(sessionId, []);
    }

    // 세션 생성 이벤트 기록
    this._recordSessionEvent(sessionId, 'session_created', {
      documentId,
      userId,
      metadata: session.metadata
    });

    this.logger.debug(`Session created: ${sessionId} for user ${userId} in document ${documentId}`);

    return {
      sessionId,
      documentId,
      userId,
      startTime: session.startTime,
      features: session.metadata.features
    };
  }

  /**
   * 세션 종료
   * @param {string} sessionId - 세션 ID
   */
  endSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      this.logger.warn(`Attempted to end non-existent session: ${sessionId}`);
      return;
    }

    const duration = Date.now() - session.startTime;
    
    // 세션 히스토리에 추가
    const sessionSummary = {
      id: sessionId,
      documentId: session.documentId,
      userId: session.userId,
      startTime: session.startTime,
      endTime: Date.now(),
      duration,
      totalEvents: session.stats.totalEvents,
      documentsEdited: Array.from(session.stats.documentsEdited),
      collaborators: Array.from(session.stats.collaborators),
      peakCollaborators: session.stats.peakCollaborators,
      metadata: session.metadata
    };

    this.sessionHistory.push(sessionSummary);
    
    // 히스토리 크기 제한
    if (this.sessionHistory.length > this.options.maxSessionHistory) {
      this.sessionHistory.shift();
    }

    // 세션 종료 이벤트 기록
    this._recordSessionEvent(sessionId, 'session_ended', {
      duration,
      totalEvents: session.stats.totalEvents
    });

    // 활성 세션에서 제거
    this.activeSessions.delete(sessionId);
    this.metrics.activeSessions--;
    
    // 평균 세션 지속 시간 업데이트
    this._updateAverageSessionDuration();

    this.logger.debug(`Session ended: ${sessionId}, duration: ${duration}ms`);

    return sessionSummary;
  }

  /**
   * 세션 활동 업데이트
   * @param {string} sessionId - 세션 ID
   * @param {string} eventType - 이벤트 타입
   * @param {Object} eventData - 이벤트 데이터
   */
  recordActivity(sessionId, eventType, eventData = {}) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return;
    }

    session.lastActivity = Date.now();
    session.stats.totalEvents++;
    this.metrics.totalEvents++;

    // 문서 편집 추적
    if (eventData.documentId && eventData.documentId !== session.documentId) {
      session.stats.documentsEdited.add(eventData.documentId);
    }

    // 협업자 추적
    if (eventData.collaboratorId) {
      session.stats.collaborators.add(eventData.collaboratorId);
      if (session.stats.collaborators.size > session.stats.peakCollaborators) {
        session.stats.peakCollaborators = session.stats.collaborators.size;
      }
    }

    // 이벤트 기록
    this._recordSessionEvent(sessionId, eventType, eventData);

    this.logger.debug(`Activity recorded for session ${sessionId}: ${eventType}`);
  }

  /**
   * 세션 정보 조회
   * @param {string} sessionId - 세션 ID
   * @returns {Object|null} 세션 정보
   */
  getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      documentId: session.documentId,
      userId: session.userId,
      startTime: session.startTime,
      lastActivity: session.lastActivity,
      duration: Date.now() - session.startTime,
      status: session.status,
      stats: {
        totalEvents: session.stats.totalEvents,
        documentsEdited: Array.from(session.stats.documentsEdited),
        collaborators: Array.from(session.stats.collaborators),
        peakCollaborators: session.stats.peakCollaborators
      },
      metadata: session.metadata
    };
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
        sessions.push(this.getSession(session.id));
      }
    }

    return sessions.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * 사용자별 세션 목록 조회
   * @param {string} userId - 사용자 ID
   * @returns {Array} 세션 목록
   */
  getUserSessions(userId) {
    const sessions = [];
    
    // 활성 세션
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        sessions.push(this.getSession(session.id));
      }
    }

    // 히스토리에서 최근 세션들
    const recentHistory = this.sessionHistory
      .filter(session => session.userId === userId)
      .slice(-10) // 최근 10개
      .map(session => ({
        ...session,
        status: 'completed'
      }));

    return [...sessions, ...recentHistory]
      .sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * 세션 이벤트 조회
   * @param {string} sessionId - 세션 ID
   * @param {Object} filters - 필터 조건
   * @returns {Array} 이벤트 목록
   */
  getSessionEvents(sessionId, filters = {}) {
    if (!this.options.enableSessionRecording) {
      return [];
    }

    const events = this.sessionEvents.get(sessionId) || [];
    
    let filteredEvents = events;

    if (filters.eventType) {
      filteredEvents = filteredEvents.filter(event => event.type === filters.eventType);
    }

    if (filters.since) {
      filteredEvents = filteredEvents.filter(event => event.timestamp >= filters.since);
    }

    if (filters.until) {
      filteredEvents = filteredEvents.filter(event => event.timestamp <= filters.until);
    }

    return filteredEvents;
  }

  /**
   * 세션 통계 조회
   * @param {Object} filters - 필터 조건
   * @returns {Object} 통계 정보
   */
  getSessionStatistics(filters = {}) {
    let sessions = this.sessionHistory;

    // 필터 적용
    if (filters.startDate || filters.endDate) {
      sessions = sessions.filter(session => {
        if (filters.startDate && session.startTime < filters.startDate) {
          return false;
        }
        if (filters.endDate && session.endTime > filters.endDate) {
          return false;
        }
        return true;
      });
    }

    if (filters.documentId) {
      sessions = sessions.filter(session => session.documentId === filters.documentId);
    }

    if (filters.userId) {
      sessions = sessions.filter(session => session.userId === filters.userId);
    }

    // 통계 계산
    const totalSessions = sessions.length;
    const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
    const averageDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

    const userCounts = new Map();
    const documentCounts = new Map();

    sessions.forEach(session => {
      userCounts.set(session.userId, (userCounts.get(session.userId) || 0) + 1);
      documentCounts.set(session.documentId, (documentCounts.get(session.documentId) || 0) + 1);
    });

    return {
      totalSessions,
      averageDuration,
      totalDuration,
      uniqueUsers: userCounts.size,
      uniqueDocuments: documentCounts.size,
      mostActiveUser: this._getTopEntry(userCounts),
      mostActiveDocument: this._getTopEntry(documentCounts),
      sessionsByHour: this._groupSessionsByHour(sessions)
    };
  }

  /**
   * 메트릭스 조회
   * @returns {Object} 세션 메트릭스
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeSessions: this.activeSessions.size,
      sessionHistorySize: this.sessionHistory.length
    };
  }

  /**
   * 이벤트 리스너 설정
   * @private
   */
  _setupEventListeners() {
    // 협업 이벤트들을 세션에 기록
    this.eventBus.on('collaboration:user-joined', (data) => {
      this._findAndUpdateSession(data.userId, data.documentId, 'user_joined', data);
    });

    this.eventBus.on('collaboration:user-left', (data) => {
      this._findAndUpdateSession(data.userId, data.documentId, 'user_left', data);
    });

    this.eventBus.on('collaboration:document-changed', (data) => {
      this._findAndUpdateSession(data.userId, data.documentId, 'document_changed', data);
    });

    this.eventBus.on('collaboration:cursor-updated', (data) => {
      this._findAndUpdateSession(data.userId, data.documentId, 'cursor_updated', data);
    });
  }

  /**
   * 세션 찾기 및 활동 업데이트
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @param {string} eventType - 이벤트 타입
   * @param {Object} eventData - 이벤트 데이터
   */
  _findAndUpdateSession(userId, documentId, eventType, eventData) {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId && session.documentId === documentId) {
        this.recordActivity(session.id, eventType, eventData);
        break;
      }
    }
  }

  /**
   * 세션 이벤트 기록
   * @private
   * @param {string} sessionId - 세션 ID
   * @param {string} eventType - 이벤트 타입
   * @param {Object} eventData - 이벤트 데이터
   */
  _recordSessionEvent(sessionId, eventType, eventData) {
    if (!this.options.enableSessionRecording) {
      return;
    }

    const event = {
      id: this._generateEventId(),
      sessionId,
      type: eventType,
      timestamp: Date.now(),
      data: eventData
    };

    if (!this.sessionEvents.has(sessionId)) {
      this.sessionEvents.set(sessionId, []);
    }

    this.sessionEvents.get(sessionId).push(event);

    // 세션 이벤트 수 제한 (메모리 관리)
    const events = this.sessionEvents.get(sessionId);
    if (events.length > 1000) {
      events.shift();
    }
  }

  /**
   * 평균 세션 지속 시간 업데이트
   * @private
   */
  _updateAverageSessionDuration() {
    if (this.sessionHistory.length === 0) {
      this.metrics.averageSessionDuration = 0;
      return;
    }

    const totalDuration = this.sessionHistory.reduce((sum, session) => sum + session.duration, 0);
    this.metrics.averageSessionDuration = totalDuration / this.sessionHistory.length;
  }

  /**
   * 상위 엔트리 찾기
   * @private
   * @param {Map} countMap - 카운트 맵
   * @returns {Object|null} 상위 엔트리
   */
  _getTopEntry(countMap) {
    if (countMap.size === 0) return null;

    let topKey = null;
    let topCount = 0;

    for (const [key, count] of countMap.entries()) {
      if (count > topCount) {
        topKey = key;
        topCount = count;
      }
    }

    return { key: topKey, count: topCount };
  }

  /**
   * 시간별 세션 그룹화
   * @private
   * @param {Array} sessions - 세션 배열
   * @returns {Object} 시간별 세션 수
   */
  _groupSessionsByHour(sessions) {
    const hourlyGroups = {};

    sessions.forEach(session => {
      const hour = new Date(session.startTime).getHours();
      hourlyGroups[hour] = (hourlyGroups[hour] || 0) + 1;
    });

    return hourlyGroups;
  }

  /**
   * 정리 타이머 시작
   * @private
   */
  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupOldSessions();
    }, this.options.cleanupInterval);
  }

  /**
   * 오래된 세션 정리
   * @private
   */
  _cleanupOldSessions() {
    const now = Date.now();
    const sessionsToEnd = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > this.options.sessionTimeout) {
        sessionsToEnd.push(sessionId);
      }
    }

    sessionsToEnd.forEach(sessionId => {
      this.logger.debug(`Cleaning up inactive session: ${sessionId}`);
      this.endSession(sessionId);
    });

    if (sessionsToEnd.length > 0) {
      this.logger.info(`Cleaned up ${sessionsToEnd.length} inactive sessions`);
    }
  }

  /**
   * 세션 ID 생성
   * @private
   * @returns {string} 세션 ID
   */
  _generateSessionId() {
    return 'sess-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
  }

  /**
   * 이벤트 ID 생성
   * @private
   * @returns {string} 이벤트 ID
   */
  _generateEventId() {
    return 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  }

  /**
   * 세션 관리자 정리
   */
  async destroy() {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Destroying SessionManager...');

    // 정리 타이머 중지
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 모든 활성 세션 종료
    const sessionIds = Array.from(this.activeSessions.keys());
    sessionIds.forEach(sessionId => {
      this.endSession(sessionId);
    });

    // 데이터 정리
    this.activeSessions.clear();
    this.sessionEvents.clear();
    this.sessionStats.clear();

    this.isInitialized = false;
    this.logger.info('SessionManager destroyed');
  }
}