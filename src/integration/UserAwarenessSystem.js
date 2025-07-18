/**
 * 사용자 인식 시스템
 * 
 * 다중 사용자 환경에서 사용자들의 커서, 선택, 상태를 실시간으로 표시하여
 * 협업 상황을 시각적으로 인식할 수 있게 해줍니다.
 */
export class UserAwarenessSystem {
  constructor(modeler, websocket, localUser, options = {}) {
    this.modeler = modeler;
    this.websocket = websocket;
    this.localUser = localUser;
    this.options = {
      enableCursorTracking: true,
      enableSelectionTracking: true,
      cursorUpdateInterval: 100, // 100ms마다 커서 위치 전송
      maxCursorDistance: 10, // 10px 이상 이동시에만 전송
      fadeOutDelay: 3000, // 3초 후 커서 페이드아웃
      showUserNames: true,
      showUserList: true,
      ...options
    };

    // 원격 사용자 관리
    this.remoteUsers = new Map();
    this.remoteCursors = new Map();
    this.remoteSelections = new Map();

    // 로컬 상태 추적
    this.lastCursorPosition = { x: 0, y: 0 };
    this.lastMouseMove = 0;
    this.cursorTimer = null;

    // UI 요소들
    this.cursorContainer = null;
    this.userListContainer = null;
    this.selectionOverlays = new Map();

    this.initializeUI();
    this.setupEventListeners();
  }

  /**
   * UI 요소 초기화
   */
  initializeUI() {
    const canvas = this.modeler.get('canvas');
    const container = canvas.getContainer();

    // 커서 컨테이너 생성
    this.cursorContainer = document.createElement('div');
    this.cursorContainer.className = 'collaboration-cursors';
    this.cursorContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;
    container.appendChild(this.cursorContainer);

    // 사용자 목록 컨테이너 생성 (옵션)
    if (this.options.showUserList) {
      this.createUserListContainer();
    }

    // CSS 스타일 추가
    this.addStyles();
  }

  /**
   * 사용자 목록 컨테이너 생성
   */
  createUserListContainer() {
    // 기존 HTML의 사용자 목록 컨테이너 사용
    this.userListContainer = document.getElementById('users-list');
    
    if (!this.userListContainer) {
      // fallback: 새로 생성
      const canvas = this.modeler.get('canvas');
      const container = canvas.getContainer();
      const parent = container.parentElement;

      this.userListContainer = document.createElement('div');
      this.userListContainer.className = 'collaboration-user-list';
      this.userListContainer.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 1001;
        max-width: 200px;
      `;

      // 제목 추가
      const title = document.createElement('div');
      title.textContent = 'Online Users';
      title.style.cssText = `
        font-weight: bold;
        margin-bottom: 4px;
        color: #333;
      `;
      this.userListContainer.appendChild(title);

      parent.appendChild(this.userListContainer);
    } else {
      // 기존 컨테이너 초기화
      this.userListContainer.innerHTML = '';
    }

    // 로컬 사용자 추가
    this.addUserToList(this.localUser, true);
    this.updateUserCount();
  }

  /**
   * CSS 스타일 추가
   */
  addStyles() {
    if (document.getElementById('collaboration-styles')) return;

    const style = document.createElement('style');
    style.id = 'collaboration-styles';
    style.textContent = `
      .remote-cursor {
        position: absolute;
        pointer-events: none;
        transition: all 0.1s ease-out;
        z-index: 1000;
      }

      .remote-cursor::before {
        content: '';
        position: absolute;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 12px solid currentColor;
        transform: rotate(-45deg);
        top: -6px;
        left: -4px;
      }

      .remote-cursor::after {
        content: attr(data-user-name);
        position: absolute;
        top: 12px;
        left: 8px;
        background: currentColor;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        font-family: Arial, sans-serif;
        white-space: nowrap;
        transform: scale(0.9);
      }

      .remote-cursor.fade-out {
        opacity: 0.3;
        transition: opacity 1s ease-out;
      }

      .remote-selection {
        position: absolute;
        border: 2px dashed currentColor;
        background: currentColor;
        opacity: 0.1;
        pointer-events: none;
        border-radius: 2px;
        animation: selection-pulse 2s infinite;
      }

      @keyframes selection-pulse {
        0%, 100% { opacity: 0.1; }
        50% { opacity: 0.2; }
      }

      .user-list-item {
        display: flex;
        align-items: center;
        margin: 2px 0;
        padding: 2px 4px;
        border-radius: 2px;
      }

      .user-list-item.local {
        background: #f0f0f0;
      }

      .user-color-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 6px;
        flex-shrink: 0;
      }

      .user-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .user-status {
        font-size: 10px;
        color: #666;
        margin-left: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    const canvas = this.modeler.get('canvas');
    const container = canvas.getContainer();

    if (this.options.enableCursorTracking) {
      // 마우스 이동 추적
      container.addEventListener('mousemove', (event) => {
        this.handleMouseMove(event);
      });

      // 마우스 나감 처리
      container.addEventListener('mouseleave', () => {
        this.handleMouseLeave();
      });
    }

    // 창 크기 변경 대응
    window.addEventListener('resize', () => {
      this.repositionCursors();
    });
  }

  /**
   * 마우스 이동 처리
   * @param {MouseEvent} event - 마우스 이벤트
   */
  handleMouseMove(event) {
    if (!this.options.enableCursorTracking) return;

    const position = this.getCanvasPosition(event);
    const distance = this.calculateDistance(this.lastCursorPosition, position);

    // 최소 이동 거리 체크
    if (distance >= this.options.maxCursorDistance) {
      this.lastCursorPosition = position;
      this.lastMouseMove = Date.now();

      // 커서 위치 브로드캐스트 (throttled)
      this.throttledBroadcastCursorPosition(position);
    }
  }

  /**
   * 마우스 나감 처리
   */
  handleMouseLeave() {
    this.broadcastCursorHidden();
  }

  /**
   * 캔버스 좌표 계산
   * @param {MouseEvent} event - 마우스 이벤트
   * @returns {Object} 캔버스 좌표
   */
  getCanvasPosition(event) {
    const canvas = this.modeler.get('canvas');
    const container = canvas.getContainer();
    const rect = container.getBoundingClientRect();
    const viewbox = canvas.viewbox();

    return {
      x: (event.clientX - rect.left) * viewbox.scale,
      y: (event.clientY - rect.top) * viewbox.scale
    };
  }

  /**
   * 두 점 사이의 거리 계산
   * @param {Object} pos1 - 첫 번째 위치
   * @param {Object} pos2 - 두 번째 위치
   * @returns {number} 거리
   */
  calculateDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 커서 위치 브로드캐스트 (쓰로틀링)
   * @param {Object} position - 커서 위치
   */
  throttledBroadcastCursorPosition(position) {
    if (this.cursorTimer) return;

    this.cursorTimer = setTimeout(() => {
      this.broadcastCursorPosition(position);
      this.cursorTimer = null;
    }, this.options.cursorUpdateInterval);
  }

  /**
   * 커서 위치 브로드캐스트
   * @param {Object} position - 커서 위치
   */
  broadcastCursorPosition(position) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'cursor_position',
        userId: this.localUser.id,
        user: this.localUser,
        position: position,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 커서 숨김 브로드캐스트
   */
  broadcastCursorHidden() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'cursor_hidden',
        userId: this.localUser.id,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 원격 사용자 추가
   * @param {Object} user - 사용자 정보
   */
  addRemoteUser(user) {
    this.remoteUsers.set(user.id, user);
    
    if (this.options.showUserList) {
      this.addUserToList(user, false);
      this.updateUserCount();
    }
    
    console.log(`Remote user added: ${user.name}`);
  }

  /**
   * 원격 사용자 제거
   * @param {string} userId - 사용자 ID
   */
  removeRemoteUser(userId) {
    this.remoteUsers.delete(userId);
    this.removeRemoteCursor(userId);
    this.clearRemoteSelection(userId);
    
    if (this.options.showUserList) {
      this.removeUserFromList(userId);
      this.updateUserCount();
    }
    
    console.log(`Remote user removed: ${userId}`);
  }

  /**
   * 사용자 목록에 추가
   * @param {Object} user - 사용자 정보
   * @param {boolean} isLocal - 로컬 사용자 여부
   */
  addUserToList(user, isLocal = false) {
    if (!this.userListContainer) return;

    const userItem = document.createElement('div');
    userItem.className = `user-item ${isLocal ? 'local' : ''}`;
    userItem.id = `user-${user.id}`;

    // 사용자 아바타
    const userAvatar = document.createElement('div');
    userAvatar.className = 'user-avatar';
    userAvatar.style.backgroundColor = user.color;
    userAvatar.textContent = user.name.charAt(0).toUpperCase();

    // 사용자 정보
    const userDetails = document.createElement('div');
    userDetails.className = 'user-details';

    const userName = document.createElement('div');
    userName.className = 'user-name';
    userName.textContent = user.name;

    const userStatus = document.createElement('div');
    userStatus.className = 'user-status';
    userStatus.textContent = isLocal ? '(나)' : '온라인';

    userDetails.appendChild(userName);
    userDetails.appendChild(userStatus);

    userItem.appendChild(userAvatar);
    userItem.appendChild(userDetails);

    this.userListContainer.appendChild(userItem);
  }

  /**
   * 사용자 목록에서 제거
   * @param {string} userId - 사용자 ID
   */
  removeUserFromList(userId) {
    const userItem = document.getElementById(`user-${userId}`);
    if (userItem) {
      userItem.remove();
    }
  }

  /**
   * 원격 커서 업데이트
   * @param {string} userId - 사용자 ID
   * @param {Object} position - 커서 위치
   * @param {Object} user - 사용자 정보
   */
  updateRemoteCursor(userId, position, user = null) {
    if (!this.options.enableCursorTracking) return;

    let cursor = this.remoteCursors.get(userId);
    if (!cursor) {
      cursor = this.createRemoteCursor(userId, user || this.remoteUsers.get(userId));
      this.remoteCursors.set(userId, cursor);
    }

    // 위치 업데이트
    cursor.style.left = position.x + 'px';
    cursor.style.top = position.y + 'px';
    cursor.classList.remove('fade-out');

    // 페이드아웃 타이머 설정
    this.setFadeOutTimer(cursor);
  }

  /**
   * 원격 커서 생성
   * @param {string} userId - 사용자 ID
   * @param {Object} user - 사용자 정보
   * @returns {HTMLElement} 커서 요소
   */
  createRemoteCursor(userId, user) {
    const cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.setAttribute('data-user-id', userId);
    cursor.setAttribute('data-user-name', user?.name || 'Anonymous');
    cursor.style.color = user?.color || '#666';

    this.cursorContainer.appendChild(cursor);
    return cursor;
  }

  /**
   * 원격 커서 제거
   * @param {string} userId - 사용자 ID
   */
  removeRemoteCursor(userId) {
    const cursor = this.remoteCursors.get(userId);
    if (cursor) {
      cursor.remove();
      this.remoteCursors.delete(userId);
    }
  }

  /**
   * 페이드아웃 타이머 설정
   * @param {HTMLElement} cursor - 커서 요소
   */
  setFadeOutTimer(cursor) {
    // 기존 타이머 제거
    if (cursor.fadeTimer) {
      clearTimeout(cursor.fadeTimer);
    }

    cursor.fadeTimer = setTimeout(() => {
      cursor.classList.add('fade-out');
    }, this.options.fadeOutDelay);
  }

  /**
   * 원격 선택 하이라이트
   * @param {string} userId - 사용자 ID
   * @param {Array} elementIds - 선택된 요소 ID 배열
   * @param {Object} user - 사용자 정보
   */
  highlightRemoteSelection(userId, elementIds, user = null) {
    if (!this.options.enableSelectionTracking) return;

    // 기존 선택 지우기
    this.clearRemoteSelection(userId);

    if (elementIds.length === 0) return;

    const elementRegistry = this.modeler.get('elementRegistry');
    const userInfo = user || this.remoteUsers.get(userId);
    const color = userInfo?.color || '#666';

    elementIds.forEach(elementId => {
      const element = elementRegistry.get(elementId);
      if (element) {
        const overlay = this.createSelectionOverlay(element, color, userInfo);
        
        if (!this.selectionOverlays.has(userId)) {
          this.selectionOverlays.set(userId, []);
        }
        this.selectionOverlays.get(userId).push(overlay);
      }
    });
  }

  /**
   * 선택 오버레이 생성
   * @param {Object} element - BPMN 요소
   * @param {string} color - 사용자 색상
   * @param {Object} userInfo - 사용자 정보
   * @returns {HTMLElement} 오버레이 요소
   */
  createSelectionOverlay(element, color, userInfo) {
    const overlay = document.createElement('div');
    overlay.className = 'remote-selection';
    overlay.style.cssText = `
      left: ${element.x}px;
      top: ${element.y}px;
      width: ${element.width}px;
      height: ${element.height}px;
      color: ${color};
    `;

    if (userInfo?.name && this.options.showUserNames) {
      overlay.title = `Selected by ${userInfo.name}`;
    }

    this.cursorContainer.appendChild(overlay);
    return overlay;
  }

  /**
   * 원격 선택 지우기
   * @param {string} userId - 사용자 ID
   */
  clearRemoteSelection(userId) {
    const overlays = this.selectionOverlays.get(userId);
    if (overlays) {
      overlays.forEach(overlay => overlay.remove());
      this.selectionOverlays.delete(userId);
    }
  }

  /**
   * 커서 위치 재정렬 (창 크기 변경 시)
   */
  repositionCursors() {
    // 현재는 단순히 재그리기만 함
    // 필요에 따라 더 정교한 위치 재계산 가능
    this.remoteCursors.forEach(cursor => {
      // 위치 재계산 로직
    });
  }

  /**
   * 현재 온라인 사용자 수 반환
   * @returns {number} 온라인 사용자 수
   */
  getOnlineUserCount() {
    return this.remoteUsers.size + 1; // +1 for local user
  }

  /**
   * 사용자 수 표시 업데이트
   */
  updateUserCount() {
    const userCountElement = document.getElementById('user-count');
    if (userCountElement) {
      userCountElement.textContent = this.getOnlineUserCount();
    }
  }

  /**
   * 모든 사용자 정보 반환
   * @returns {Array} 사용자 정보 배열
   */
  getAllUsers() {
    return [
      { ...this.localUser, isLocal: true },
      ...Array.from(this.remoteUsers.values()).map(user => ({ ...user, isLocal: false }))
    ];
  }

  /**
   * 사용자 인식 시스템 정리
   */
  destroy() {
    // 타이머 정리
    if (this.cursorTimer) {
      clearTimeout(this.cursorTimer);
    }

    // 커서들의 페이드아웃 타이머 정리
    this.remoteCursors.forEach(cursor => {
      if (cursor.fadeTimer) {
        clearTimeout(cursor.fadeTimer);
      }
    });

    // DOM 요소 제거
    if (this.cursorContainer) {
      this.cursorContainer.remove();
    }

    if (this.userListContainer) {
      this.userListContainer.remove();
    }

    // 맵 정리
    this.remoteUsers.clear();
    this.remoteCursors.clear();
    this.selectionOverlays.clear();

    // 스타일 제거
    const style = document.getElementById('collaboration-styles');
    if (style) {
      style.remove();
    }
  }
}

export default UserAwarenessSystem;