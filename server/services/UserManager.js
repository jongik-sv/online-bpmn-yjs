/**
 * 사용자 관리자
 * 협업 세션의 사용자 관리 및 권한 제어
 */

export class UserManager {
  constructor(options = {}) {
    this.options = {
      maxUsersPerDocument: 50,
      enableUserProfiles: true,
      enablePermissions: true,
      sessionTimeout: 300000, // 5분
      ...options
    };

    this.logger = options.logger;
    
    // 사용자 정보 저장소
    this.users = new Map();
    
    // 문서별 사용자 목록
    this.documentUsers = new Map();
    
    // 사용자별 세션 정보
    this.userSessions = new Map();
    
    // 권한 정보
    this.permissions = new Map();
    
    // 메트릭스
    this.metrics = {
      totalUsers: 0,
      activeUsers: 0,
      connectionsToday: 0,
      averageSessionDuration: 0
    };

    this.isInitialized = false;
  }

  /**
   * 사용자 관리자 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing UserManager...');
      
      // 정리 타이머 시작
      this._startCleanupTimer();
      
      this.isInitialized = true;
      this.logger.info('UserManager initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize UserManager:', error);
      throw error;
    }
  }

  /**
   * 사용자 추가
   * @param {string} documentId - 문서 ID
   * @param {string} userId - 사용자 ID
   * @param {Object} userInfo - 사용자 정보
   * @returns {Object} 추가된 사용자 정보
   */
  addUser(documentId, userId, userInfo = {}) {
    // 문서별 사용자 수 제한 확인
    const documentUserSet = this.documentUsers.get(documentId) || new Set();
    
    if (documentUserSet.size >= this.options.maxUsersPerDocument && !documentUserSet.has(userId)) {
      throw new Error(`Maximum users (${this.options.maxUsersPerDocument}) reached for document ${documentId}`);
    }

    // 사용자 정보 생성/업데이트
    const user = {
      id: userId,
      name: userInfo.name || `User ${userId}`,
      email: userInfo.email || null,
      avatar: userInfo.avatar || null,
      role: userInfo.role || 'editor',
      status: 'online',
      joinedAt: Date.now(),
      lastActivity: Date.now(),
      currentDocument: documentId,
      sessionInfo: {
        websocket: userInfo.websocket || null,
        connectedAt: userInfo.connectedAt || Date.now(),
        ipAddress: userInfo.ipAddress || null,
        userAgent: userInfo.userAgent || null
      }
    };

    this.users.set(userId, user);

    // 문서별 사용자 목록에 추가
    if (!this.documentUsers.has(documentId)) {
      this.documentUsers.set(documentId, new Set());
    }
    this.documentUsers.get(documentId).add(userId);

    // 세션 정보 업데이트
    this._updateUserSession(userId, documentId, user.sessionInfo);

    // 권한 설정
    if (this.options.enablePermissions) {
      this._setUserPermissions(userId, documentId, user.role);
    }

    // 메트릭스 업데이트
    if (!this.userSessions.has(userId)) {
      this.metrics.totalUsers++;
      this.metrics.connectionsToday++;
    }
    this._updateActiveUserCount();

    this.logger.debug(`User added: ${userId} to document ${documentId}`);

    return {
      id: userId,
      name: user.name,
      role: user.role,
      status: user.status,
      joinedAt: user.joinedAt,
      permissions: this.getUserPermissions(userId, documentId)
    };
  }

  /**
   * 사용자 제거
   * @param {string} documentId - 문서 ID
   * @param {string} userId - 사용자 ID
   */
  removeUser(documentId, userId) {
    const user = this.users.get(userId);
    
    if (!user) {
      this.logger.warn(`Attempted to remove non-existent user: ${userId}`);
      return;
    }

    // 문서별 사용자 목록에서 제거
    const documentUserSet = this.documentUsers.get(documentId);
    if (documentUserSet) {
      documentUserSet.delete(userId);
      
      // 빈 문서 사용자 목록 정리
      if (documentUserSet.size === 0) {
        this.documentUsers.delete(documentId);
      }
    }

    // 사용자가 다른 문서에 있지 않으면 완전 제거
    const isInOtherDocuments = Array.from(this.documentUsers.values())
      .some(userSet => userSet.has(userId));

    if (!isInOtherDocuments) {
      this.users.delete(userId);
      this.userSessions.delete(userId);
      this.permissions.delete(userId);
    } else {
      // 현재 문서 정보만 업데이트
      user.currentDocument = null;
      user.status = 'idle';
    }

    this._updateActiveUserCount();

    this.logger.debug(`User removed: ${userId} from document ${documentId}`);
  }

  /**
   * 사용자 정보 조회
   * @param {string} userId - 사용자 ID
   * @returns {Object|null} 사용자 정보
   */
  getUser(userId) {
    const user = this.users.get(userId);
    
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      joinedAt: user.joinedAt,
      lastActivity: user.lastActivity,
      currentDocument: user.currentDocument
    };
  }

  /**
   * 문서의 사용자 목록 조회
   * @param {string} documentId - 문서 ID
   * @returns {Array} 사용자 목록
   */
  getDocumentUsers(documentId) {
    const userIds = this.documentUsers.get(documentId) || new Set();
    const users = [];

    for (const userId of userIds) {
      const user = this.users.get(userId);
      if (user) {
        users.push({
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
          status: user.status,
          joinedAt: user.joinedAt,
          lastActivity: user.lastActivity,
          permissions: this.getUserPermissions(userId, documentId)
        });
      }
    }

    return users.sort((a, b) => a.joinedAt - b.joinedAt);
  }

  /**
   * 사용자 활동 업데이트
   * @param {string} userId - 사용자 ID
   * @param {Object} activity - 활동 정보
   */
  updateUserActivity(userId, activity = {}) {
    const user = this.users.get(userId);
    
    if (!user) {
      return;
    }

    user.lastActivity = Date.now();
    
    if (activity.status) {
      user.status = activity.status;
    }

    // 세션 정보 업데이트
    const session = this.userSessions.get(userId);
    if (session) {
      session.lastActivity = Date.now();
      
      if (activity.cursor) {
        session.cursor = activity.cursor;
      }
      
      if (activity.selection) {
        session.selection = activity.selection;
      }
    }

    this.logger.debug(`User activity updated: ${userId}`);
  }

  /**
   * 사용자 권한 설정
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @param {Array|string} permissions - 권한 목록
   */
  setUserPermissions(userId, documentId, permissions) {
    if (!this.options.enablePermissions) {
      return;
    }

    this._setUserPermissions(userId, documentId, permissions);
    this.logger.debug(`Permissions set for user ${userId} in document ${documentId}: ${permissions}`);
  }

  /**
   * 사용자 권한 조회
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @returns {Array} 권한 목록
   */
  getUserPermissions(userId, documentId) {
    if (!this.options.enablePermissions) {
      return ['read', 'write']; // 기본 권한
    }

    const userPermissions = this.permissions.get(userId) || new Map();
    return userPermissions.get(documentId) || [];
  }

  /**
   * 권한 확인
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @param {string} permission - 확인할 권한
   * @returns {boolean} 권한 보유 여부
   */
  hasPermission(userId, documentId, permission) {
    const permissions = this.getUserPermissions(userId, documentId);
    return permissions.includes(permission) || permissions.includes('admin');
  }

  /**
   * 문서별 사용자 수 조회
   * @param {string} documentId - 문서 ID
   * @returns {number} 사용자 수
   */
  getDocumentUserCount(documentId) {
    const userSet = this.documentUsers.get(documentId);
    return userSet ? userSet.size : 0;
  }

  /**
   * 전체 활성 사용자 수 조회
   * @returns {number} 활성 사용자 수
   */
  getActiveUserCount() {
    return this.metrics.activeUsers;
  }

  /**
   * 사용자 세션 정보 조회
   * @param {string} userId - 사용자 ID
   * @returns {Object|null} 세션 정보
   */
  getUserSession(userId) {
    return this.userSessions.get(userId) || null;
  }

  /**
   * 메트릭스 조회
   * @returns {Object} 사용자 메트릭스
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeUsers: this.metrics.activeUsers,
      documentsWithUsers: this.documentUsers.size,
      averageUsersPerDocument: this.documentUsers.size > 0 ?
        Array.from(this.documentUsers.values()).reduce((acc, set) => acc + set.size, 0) / this.documentUsers.size : 0
    };
  }

  /**
   * 사용자 세션 업데이트
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @param {Object} sessionInfo - 세션 정보
   */
  _updateUserSession(userId, documentId, sessionInfo) {
    const session = {
      userId,
      documentId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      ...sessionInfo
    };

    this.userSessions.set(userId, session);
  }

  /**
   * 사용자 권한 설정 (내부)
   * @private
   * @param {string} userId - 사용자 ID
   * @param {string} documentId - 문서 ID
   * @param {string|Array} roleOrPermissions - 역할 또는 권한 목록
   */
  _setUserPermissions(userId, documentId, roleOrPermissions) {
    let permissions = [];

    if (typeof roleOrPermissions === 'string') {
      // 역할 기반 권한
      switch (roleOrPermissions) {
        case 'admin':
          permissions = ['read', 'write', 'delete', 'admin', 'invite'];
          break;
        case 'editor':
          permissions = ['read', 'write'];
          break;
        case 'viewer':
          permissions = ['read'];
          break;
        default:
          permissions = ['read'];
      }
    } else if (Array.isArray(roleOrPermissions)) {
      permissions = roleOrPermissions;
    }

    if (!this.permissions.has(userId)) {
      this.permissions.set(userId, new Map());
    }

    this.permissions.get(userId).set(documentId, permissions);
  }

  /**
   * 활성 사용자 수 업데이트
   * @private
   */
  _updateActiveUserCount() {
    let activeCount = 0;
    const now = Date.now();

    for (const user of this.users.values()) {
      // 최근 5분 내에 활동한 사용자를 활성으로 간주
      if (now - user.lastActivity < this.options.sessionTimeout) {
        activeCount++;
      }
    }

    this.metrics.activeUsers = activeCount;
  }

  /**
   * 정리 타이머 시작
   * @private
   */
  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupInactiveUsers();
    }, 60000); // 1분마다 정리
  }

  /**
   * 비활성 사용자 정리
   * @private
   */
  _cleanupInactiveUsers() {
    const now = Date.now();
    const usersToRemove = [];

    for (const [userId, user] of this.users.entries()) {
      // 세션 타임아웃된 사용자 찾기
      if (now - user.lastActivity > this.options.sessionTimeout) {
        usersToRemove.push({ userId, documentId: user.currentDocument });
      }
    }

    usersToRemove.forEach(({ userId, documentId }) => {
      this.logger.debug(`Cleaning up inactive user: ${userId}`);
      if (documentId) {
        this.removeUser(documentId, userId);
      }
    });

    if (usersToRemove.length > 0) {
      this.logger.info(`Cleaned up ${usersToRemove.length} inactive users`);
    }

    // 활성 사용자 수 업데이트
    this._updateActiveUserCount();
  }

  /**
   * 사용자 관리자 정리
   */
  async destroy() {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Destroying UserManager...');

    // 정리 타이머 중지
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // 모든 사용자 연결 해제
    for (const [userId, user] of this.users.entries()) {
      if (user.sessionInfo.websocket) {
        user.sessionInfo.websocket.close();
      }
    }

    // 데이터 정리
    this.users.clear();
    this.documentUsers.clear();
    this.userSessions.clear();
    this.permissions.clear();

    this.isInitialized = false;
    this.logger.info('UserManager destroyed');
  }
}