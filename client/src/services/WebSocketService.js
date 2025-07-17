/**
 * WebSocket 통신 서비스
 * 서버와의 실시간 통신 관리
 */
export class WebSocketService {
  constructor(serverUrl, wsUrl) {
    this.serverUrl = serverUrl;
    this.wsUrl = wsUrl;
    this.websocket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 5000;
    this.connectedUsers = new Map();
  }

  /**
   * 서버에 연결
   */
  async connectToServer() {
    try {
      console.log('🔌 서버 연결 시도...');
      
      const response = await fetch(`${this.serverUrl}/health`);
      if (!response.ok) {
        throw new Error(`서버 응답 오류: ${response.status}`);
      }

      console.log('✅ 서버 연결 성공');
      return true;
    } catch (error) {
      console.error('❌ 서버 연결 실패:', error);
      throw error;
    }
  }

  /**
   * WebSocket 연결
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(this.wsUrl);

        this.websocket.onopen = () => {
          console.log('🔗 WebSocket 연결 성공');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.onConnectionEstablished?.();
          resolve();
        };

        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };

        this.websocket.onclose = (event) => {
          console.log('🔌 WebSocket 연결 종료:', event.code, event.reason);
          this.isConnected = false;
          this.onConnectionClosed?.(event);
          this.attemptReconnect();
        };

        this.websocket.onerror = (error) => {
          console.error('❌ WebSocket 오류:', error);
          this.onConnectionError?.(error);
          reject(error);
        };

        // 연결 타임아웃
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket 연결 타임아웃'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * WebSocket 메시지 처리
   */
  handleWebSocketMessage(event) {
    try {
      // Y.js WebSocket provider는 바이너리 데이터를 전송하므로 무시
      if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
        console.log('Y.js 바이너리 메시지 무시:', typeof event.data);
        return;
      }
      
      // 문자열이 아닌 경우도 무시
      if (typeof event.data !== 'string') {
        console.log('비문자열 메시지 무시:', typeof event.data);
        return;
      }
      
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'connection-established':
          this.handleConnectionEstablished(message);
          break;
        case 'users-list':
          this.handleUsersList(message);
          break;
        case 'user-joined':
          this.handleUserJoined(message);
          break;
        case 'user-left':
          this.handleUserLeft(message);
          break;
        case 'document-changed':
          this.handleDocumentChanged(message);
          break;
        case 'element-changed':
          this.handleElementChanged(message);
          break;
        case 'cursor-update':
          this.handleCursorUpdate(message);
          break;
        default:
          console.warn('알 수 없는 메시지 타입:', message.type);
      }
    } catch (error) {
      console.error('WebSocket 메시지 처리 실패:', error);
    }
  }

  /**
   * 연결 확립 처리
   */
  handleConnectionEstablished(message) {
    console.log('✅ 연결 확립:', message);
    this.onConnectionEstablished?.(message);
  }

  /**
   * 사용자 목록 처리
   */
  handleUsersList(message) {
    this.connectedUsers.clear();
    message.users.forEach(user => {
      this.connectedUsers.set(user.id, user);
    });
    this.onUsersListUpdated?.(Array.from(this.connectedUsers.values()));
  }

  /**
   * 사용자 참가 처리
   */
  handleUserJoined(message) {
    this.connectedUsers.set(message.user.id, message.user);
    this.onUserJoined?.(message.user);
  }

  /**
   * 사용자 떠남 처리
   */
  handleUserLeft(message) {
    this.connectedUsers.delete(message.userId);
    this.onUserLeft?.(message.userId);
  }

  /**
   * 문서 변경 처리
   */
  handleDocumentChanged(message) {
    this.onDocumentChanged?.(message);
  }

  /**
   * 요소 변경 처리
   */
  handleElementChanged(message) {
    this.onElementChanged?.(message);
  }

  /**
   * 커서 업데이트 처리
   */
  handleCursorUpdate(message) {
    this.onCursorUpdate?.(message);
  }

  /**
   * 메시지 전송
   */
  sendMessage(message) {
    if (!this.isConnected || !this.websocket) {
      console.warn('WebSocket이 연결되지 않음');
      return false;
    }

    try {
      this.websocket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      return false;
    }
  }

  /**
   * 문서 참가
   */
  joinDocument(documentId, userName) {
    return this.sendMessage({
      type: 'join-document',
      documentId,
      userName
    });
  }

  /**
   * 문서 떠나기
   */
  leaveDocument(documentId) {
    return this.sendMessage({
      type: 'leave-document',
      documentId
    });
  }

  /**
   * 요소 변경 알림
   */
  notifyElementChange(elementId, elementData) {
    return this.sendMessage({
      type: 'element-changed',
      elementId,
      elementData,
      timestamp: Date.now()
    });
  }

  /**
   * 커서 위치 업데이트
   */
  updateCursor(position) {
    return this.sendMessage({
      type: 'cursor-update',
      position,
      timestamp: Date.now()
    });
  }

  /**
   * 재연결 시도
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('최대 재연결 시도 횟수 초과');
      this.onMaxReconnectAttemptsReached?.();
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    setTimeout(() => {
      this.connectWebSocket().catch(error => {
        console.error('재연결 실패:', error);
      });
    }, this.reconnectInterval);
  }

  /**
   * 연결된 사용자 목록 가져오기
   */
  getConnectedUsers() {
    return Array.from(this.connectedUsers.values());
  }

  /**
   * 연결 상태 확인
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * 이벤트 핸들러 설정
   */
  setEventHandlers({
    onConnectionEstablished,
    onConnectionClosed,
    onConnectionError,
    onUsersListUpdated,
    onUserJoined,
    onUserLeft,
    onDocumentChanged,
    onElementChanged,
    onCursorUpdate,
    onMaxReconnectAttemptsReached
  }) {
    this.onConnectionEstablished = onConnectionEstablished;
    this.onConnectionClosed = onConnectionClosed;
    this.onConnectionError = onConnectionError;
    this.onUsersListUpdated = onUsersListUpdated;
    this.onUserJoined = onUserJoined;
    this.onUserLeft = onUserLeft;
    this.onDocumentChanged = onDocumentChanged;
    this.onElementChanged = onElementChanged;
    this.onCursorUpdate = onCursorUpdate;
    this.onMaxReconnectAttemptsReached = onMaxReconnectAttemptsReached;
  }

  /**
   * 연결 종료
   */
  disconnect() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.isConnected = false;
    this.connectedUsers.clear();
  }

  /**
   * 서비스 종료
   */
  destroy() {
    this.disconnect();
    this.reconnectAttempts = 0;
  }
}