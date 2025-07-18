/**
 * BPMN 협업 시스템 통합 구현
 * 
 * 모든 협업 컴포넌트를 통합하여 완전한 실시간 협업 시스템을 제공합니다.
 * WebSocket을 통한 실시간 통신, 사용자 인식, 변경사항 동기화를 담당합니다.
 */

import { CollaborationManager } from '../collaboration/CollaborationManager.js';
import { ChangeTracker } from '../collaboration/ChangeTracker.js';
import { SilentUpdateService } from '../silent-update/SilentUpdateService.js';
import { SynchronizationManager } from '../synchronization/SynchronizationManager.js';
import { UserAwarenessSystem } from './UserAwarenessSystem.js';
import { EventBusManager } from '../silent-update/EventBusManager.js';

export class BPMNCollaborationImplementation {
  constructor(modeler, websocketUrl, options = {}) {
    this.modeler = modeler;
    this.websocketUrl = websocketUrl;
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 3000,
      heartbeatInterval: 30000,
      userId: options.userId || this.generateUserId(),
      userName: options.userName || 'Anonymous',
      userColor: options.userColor || this.generateUserColor(),
      enableCursorTracking: true,
      enableSelectionTracking: true,
      batchDelayMs: 50,
      maxBatchSize: 20,
      ...options
    };

    // 연결 상태
    this.isConnected = false;
    this.reconnectCount = 0;
    this.heartbeatTimer = null;

    // 메시지 큐 (연결 끊김 시 대기)
    this.messageQueue = [];
    this.maxQueueSize = 100;

    // 사용자 정보
    this.localUser = {
      id: this.options.userId,
      name: this.options.userName,
      color: this.options.userColor,
      isOnline: true
    };

    // 배치 처리
    this.pendingBroadcasts = [];
    this.batchTimer = null;

    this.initializeComponents();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  /**
   * 협업 컴포넌트들 초기화
   */
  initializeComponents() {
    // 핵심 서비스들
    this.collaborationManager = new CollaborationManager(this.modeler);
    this.changeTracker = new ChangeTracker();
    this.silentUpdater = new SilentUpdateService(this.modeler);
    this.syncManager = new SynchronizationManager(this.modeler);
    this.eventBusManager = new EventBusManager(this.modeler);
    
    // 의존성 주입 (중요!)
    this.collaborationManager.setDependencies(this.silentUpdater, this.changeTracker);
    
    // CollaborationManager의 브로드캐스트 이벤트 수신
    this.modeler.get('eventBus').on('collaboration.change', (event) => {
      if (event.operation && event.source === 'CollaborationManager') {
        this.queueBroadcast({
          type: 'model_change',
          operation: event.operation,
          userId: this.localUser.id,
          timestamp: Date.now()
        });
      }
    });
    
    // 사용자 인식 시스템 (WebSocket 연결 후 설정)
    this.userAwarenessSystem = null;

    console.log('BPMN Collaboration components initialized with dependencies');
  }

  /**
   * WebSocket 연결 설정
   */
  setupWebSocket() {
    try {
      this.websocket = new WebSocket(this.websocketUrl);
      this.setupWebSocketHandlers();
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * WebSocket 이벤트 핸들러 설정
   */
  setupWebSocketHandlers() {
    this.websocket.onopen = (event) => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectCount = 0;
      
      // 사용자 인식 시스템 초기화 (비활성화)
      // if (!this.userAwarenessSystem) {
      //   this.userAwarenessSystem = new UserAwarenessSystem(
      //     this.modeler, 
      //     this.websocket, 
      //     this.localUser,
      //     this.options
      //   );
      // }

      // 사용자 정보 전송
      this.sendUserJoin();
      
      // 대기 중인 메시지 전송
      this.flushMessageQueue();
      
      // 하트비트 시작
      this.startHeartbeat();
    };

    this.websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error, event.data);
      }
    };

    this.websocket.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      this.isConnected = false;
      this.stopHeartbeat();
      
      if (this.options.autoReconnect && this.reconnectCount < this.options.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };

    this.websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  /**
   * WebSocket 메시지 처리
   * @param {Object} data - 수신된 데이터
   */
  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'model_change':
        this.handleRemoteModelChange(data);
        break;
      case 'cursor_position':
        this.handleRemoteCursorPosition(data);
        break;
      case 'user_selection':
        this.handleRemoteUserSelection(data);
        break;
      case 'user_join':
        this.handleUserJoin(data);
        break;
      case 'user_leave':
        this.handleUserLeave(data);
        break;
      case 'user_join_confirmed':
        this.handleUserJoinConfirmed(data);
        break;
      case 'users_list':
        this.handleUsersList(data);
        break;
      case 'user_joined':
        this.handleUserJoined(data);
        break;
      case 'user_left':
        this.handleUserLeft(data);
        break;
      case 'heartbeat':
        this.handleHeartbeat(data);
        break;
      case 'error':
        this.handleServerError(data);
        break;
      case 'sync_request':
        this.handleSyncRequest(data);
        break;
      default:
        console.warn('Unknown message type:', data.type);
    }
  }

  /**
   * 로컬 이벤트 핸들러 설정
   */
  setupEventHandlers() {
    // 모델 변경사항 감지
    this.modeler.on('commandStack.changed', (event) => {
      if (!this.collaborationManager.isProcessingRemoteEvent) {
        this.handleLocalModelChange(event);
      }
    });

    // 선택 변경 감지
    this.modeler.on('selection.changed', (event) => {
      this.handleLocalSelectionChange(event);
    });

    // 요소 변경 감지 (추가 이벤트)
    this.modeler.on('element.changed', (event) => {
      if (event.source !== 'collaboration' && event.source !== 'synchronization') {
        this.handleLocalElementChange(event);
      }
    });

    // 요소 추가/제거 감지
    this.modeler.on(['shape.added', 'connection.added'], (event) => {
      if (event.source !== 'collaboration' && event.source !== 'synchronization') {
        this.handleLocalElementAdded(event);
      }
    });

    this.modeler.on(['shape.removed', 'connection.removed'], (event) => {
      if (event.source !== 'collaboration' && event.source !== 'synchronization') {
        this.handleLocalElementRemoved(event);
      }
    });

    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', () => {
      this.destroy();
    });
  }

  /**
   * 로컬 모델 변경 처리
   * @param {Object} event - 변경 이벤트
   */
  handleLocalModelChange(event) {
    if (event.trigger === 'execute') {
      const operation = this.createOperationFromEvent(event);
      
      // 연결선 변경은 CollaborationManager에서 처리하므로 여기서는 제외
      if (operation.elementId && !this.isConnectionElement(operation.elementId)) {
        // 변경사항 추적
        if (this.changeTracker.shouldProcessChange(operation.elementId, operation.changes)) {
          this.queueBroadcast({
            type: 'model_change',
            operation: operation,
            userId: this.localUser.id,
            timestamp: Date.now()
          });
        }
      }
    }
  }

  /**
   * 로컬 선택 변경 처리
   * @param {Object} event - 선택 이벤트
   */
  handleLocalSelectionChange(event) {
    if (this.options.enableSelectionTracking) {
      const selectedIds = event.newSelection.map(element => element.id);
      
      this.queueBroadcast({
        type: 'user_selection',
        userId: this.localUser.id,
        elementIds: selectedIds,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 로컬 요소 변경 처리
   * @param {Object} event - 요소 변경 이벤트
   */
  handleLocalElementChange(event) {
    // 연결선은 CollaborationManager에서 처리하므로 제외
    if (event.element && !this.isConnectionElement(event.element.id)) {
      // 추가적인 요소 변경사항 처리
      const operation = {
        type: 'element_update',
        elementId: event.element.id,
        changes: {
          businessObject: { ...event.element.businessObject },
          visual: {
            x: event.element.x,
            y: event.element.y,
            width: event.element.width,
            height: event.element.height
          }
        },
        timestamp: Date.now()
      };

      this.queueBroadcast({
        type: 'model_change',
        operation: operation,
        userId: this.localUser.id,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 로컬 요소 추가 처리
   * @param {Object} event - 요소 추가 이벤트
   */
  handleLocalElementAdded(event) {
    if (event.element) {
      const operation = {
        type: 'element.added',
        elementId: event.element.id,
        element: this.serializeElement(event.element),
        parent: event.parent ? event.parent.id : null,
        timestamp: Date.now()
      };

      this.queueBroadcast({
        type: 'model_change',
        operation: operation,
        userId: this.localUser.id,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 로컬 요소 제거 처리
   * @param {Object} event - 요소 제거 이벤트
   */
  handleLocalElementRemoved(event) {
    if (event.element) {
      const operation = {
        type: 'element.removed',
        elementId: event.element.id,
        elementType: event.element.type,
        timestamp: Date.now()
      };

      this.queueBroadcast({
        type: 'model_change',
        operation: operation,
        userId: this.localUser.id,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 원격 모델 변경 처리
   * @param {Object} data - 수신된 데이터
   */
  handleRemoteModelChange(data) {
    if (data.userId === this.localUser.id) {
      return; // 자신의 변경사항은 무시
    }

    try {
      // 협업 매니저를 통해 원격 변경사항 적용
      this.collaborationManager.applyRemoteChanges([data.operation]);
      
      // 동기화 매니저에 작업 큐잉
      this.syncManager.queueSync({
        type: data.operation.type,
        elementId: data.operation.elementId,
        changes: data.operation.changes,
        source: 'remote',
        userId: data.userId
      });
    } catch (error) {
      console.error('Failed to apply remote model change:', error, data);
    }
  }

  /**
   * 원격 커서 위치 처리 (비활성화)
   * @param {Object} data - 커서 데이터
   */
  handleRemoteCursorPosition(data) {
    // 마우스 awareness 시스템 비활성화
    // if (this.userAwarenessSystem && data.userId !== this.localUser.id) {
    //   this.userAwarenessSystem.updateRemoteCursor(data.userId, data.position, data.user);
    // }
  }

  /**
   * 원격 사용자 선택 처리 (비활성화)
   * @param {Object} data - 선택 데이터
   */
  handleRemoteUserSelection(data) {
    // 마우스 awareness 시스템 비활성화
    // if (this.userAwarenessSystem && data.userId !== this.localUser.id) {
    //   this.userAwarenessSystem.highlightRemoteSelection(data.userId, data.elementIds, data.user);
    // }
  }

  /**
   * 사용자 참가 처리 (비활성화)
   * @param {Object} data - 사용자 데이터
   */
  handleUserJoin(data) {
    // 마우스 awareness 시스템 비활성화
    // if (this.userAwarenessSystem && data.user.id !== this.localUser.id) {
    //   this.userAwarenessSystem.addRemoteUser(data.user);
    //   console.log(`User joined: ${data.user.name}`);
    // }
  }

  /**
   * 사용자 퇴장 처리 (비활성화)
   * @param {Object} data - 사용자 데이터
   */
  handleUserLeave(data) {
    // 마우스 awareness 시스템 비활성화
    // if (this.userAwarenessSystem && data.userId !== this.localUser.id) {
    //   this.userAwarenessSystem.removeRemoteUser(data.userId);
    //   console.log(`User left: ${data.userId}`);
    // }
  }

  /**
   * 사용자 참가 확인 처리
   * @param {Object} data - 참가 확인 데이터
   */
  handleUserJoinConfirmed(data) {
    console.log(`User join confirmed for user: ${data.userId}`);
    // 참가 확인 후 필요한 추가 로직 (현재는 로깅만)
  }

  /**
   * 사용자 목록 처리
   * @param {Object} data - 사용자 목록 데이터
   */
  handleUsersList(data) {
    if (data.users && Array.isArray(data.users)) {
      // V3 데모 인스턴스에 사용자 목록 업데이트 알림
      if (window.demo && window.demo.clearUsersList) {
        window.demo.clearUsersList();
        data.users.forEach(user => {
          window.demo.addUser(user);
        });
      }
      console.log(`Received users list: ${data.users.length} users`);
    }
  }

  /**
   * 사용자 참가 처리
   * @param {Object} data - 사용자 참가 데이터  
   */
  handleUserJoined(data) {
    if (data.user) {
      // V3 데모 인스턴스에 사용자 추가 알림
      if (window.demo && window.demo.addUser) {
        window.demo.addUser(data.user);
      }
      console.log(`User joined: ${data.user.name}`);
    }
  }

  /**
   * 사용자 퇴장 처리
   * @param {Object} data - 사용자 퇴장 데이터
   */
  handleUserLeft(data) {
    if (data.userId) {
      // V3 데모 인스턴스에 사용자 제거 알림
      if (window.demo && window.demo.removeUser) {
        window.demo.removeUser(data.userId);
      }
      console.log(`User left: ${data.userId}`);
    }
  }

  /**
   * 하트비트 처리
   * @param {Object} data - 하트비트 데이터
   */
  handleHeartbeat(data) {
    // 하트비트 응답 전송
    this.sendMessage({
      type: 'heartbeat_response',
      userId: this.localUser.id,
      timestamp: Date.now()
    });
  }

  /**
   * 서버 오류 처리
   * @param {Object} data - 오류 데이터
   */
  handleServerError(data) {
    console.error('Server error:', data.error, data.message);
    
    // 필요에 따라 사용자에게 오류 알림
    if (data.fatal) {
      this.disconnect();
    }
  }

  /**
   * 동기화 요청 처리
   * @param {Object} data - 동기화 요청 데이터
   */
  handleSyncRequest(data) {
    // 현재 모델 상태를 전송
    const modelState = this.extractCurrentModelState();
    
    this.sendMessage({
      type: 'sync_response',
      userId: this.localUser.id,
      modelState: modelState,
      timestamp: Date.now()
    });
  }

  /**
   * 배치 브로드캐스트 큐잉
   * @param {Object} message - 전송할 메시지
   */
  queueBroadcast(message) {
    this.pendingBroadcasts.push(message);
    
    if (this.pendingBroadcasts.length >= this.options.maxBatchSize) {
      this.flushBroadcasts();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBroadcasts();
      }, this.options.batchDelayMs);
    }
  }

  /**
   * 대기 중인 브로드캐스트 전송
   */
  flushBroadcasts() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingBroadcasts.length === 0) return;

    if (this.pendingBroadcasts.length === 1) {
      // 단일 메시지
      this.sendMessage(this.pendingBroadcasts[0]);
    } else {
      // 배치 메시지
      this.sendMessage({
        type: 'batch_update',
        userId: this.localUser.id,
        updates: [...this.pendingBroadcasts],
        timestamp: Date.now()
      });
    }

    this.pendingBroadcasts = [];
  }

  /**
   * 메시지 전송
   * @param {Object} message - 전송할 메시지
   */
  sendMessage(message) {
    if (this.isConnected && this.websocket.readyState === WebSocket.OPEN) {
      try {
        this.websocket.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send message:', error);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  /**
   * 메시지 큐에 추가
   * @param {Object} message - 큐에 추가할 메시지
   */
  queueMessage(message) {
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift(); // 가장 오래된 메시지 제거
    }
    this.messageQueue.push(message);
  }

  /**
   * 대기 중인 메시지 전송
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.sendMessage(message);
    }
  }

  /**
   * 사용자 참가 알림 전송
   */
  sendUserJoin() {
    this.sendMessage({
      type: 'user_join',
      user: this.localUser,
      timestamp: Date.now()
    });
  }

  /**
   * 사용자 퇴장 알림 전송
   */
  sendUserLeave() {
    this.sendMessage({
      type: 'user_leave',
      userId: this.localUser.id,
      timestamp: Date.now()
    });
  }

  /**
   * 하트비트 시작
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({
        type: 'heartbeat',
        userId: this.localUser.id,
        timestamp: Date.now()
      });
    }, this.options.heartbeatInterval);
  }

  /**
   * 하트비트 중단
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 재연결 스케줄링
   */
  scheduleReconnect() {
    if (this.reconnectCount >= this.options.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectCount++;
    console.log(`Scheduling reconnection attempt ${this.reconnectCount}/${this.options.maxReconnectAttempts}`);
    
    setTimeout(() => {
      this.setupWebSocket();
    }, this.options.reconnectInterval);
  }

  /**
   * commandStack 이벤트에서 operation 생성
   * @param {Object} event - commandStack 이벤트
   * @returns {Object} operation 객체
   */
  createOperationFromEvent(event) {
    const element = event.element || event.context?.element;
    
    return {
      type: this.determineOperationType(event),
      elementId: element?.id,
      changes: this.extractChangesFromEvent(event),
      commandType: event.command?.constructor?.name,
      timestamp: Date.now()
    };
  }

  /**
   * 이벤트에서 operation 타입 결정
   * @param {Object} event - 이벤트
   * @returns {string} operation 타입
   */
  determineOperationType(event) {
    const commandName = event.command?.constructor?.name;
    
    if (commandName) {
      if (commandName.includes('Create')) return 'createElement';
      if (commandName.includes('Delete') || commandName.includes('Remove')) return 'removeElement';
      if (commandName.includes('Update') || commandName.includes('Change')) return 'updateElement';
      if (commandName.includes('Move')) return 'updateElement';
      if (commandName.includes('Connect')) return 'updateConnection';
    }
    
    return 'updateElement'; // 기본값
  }

  /**
   * 연결선 요소인지 확인
   * @param {string} elementId - 요소 ID
   * @returns {boolean} 연결선이면 true
   */
  isConnectionElement(elementId) {
    if (!elementId) return false;
    
    try {
      const elementRegistry = this.modeler.get('elementRegistry');
      const element = elementRegistry.get(elementId);
      return element && element.waypoints; // 연결선은 waypoints 속성을 가짐
    } catch (error) {
      return false;
    }
  }

  /**
   * 이벤트에서 변경사항 추출
   * @param {Object} event - 이벤트
   * @returns {Object} 변경사항
   */
  extractChangesFromEvent(event) {
    const element = event.element || event.context?.element;
    
    if (!element) return {};

    return {
      businessObject: element.businessObject ? { ...element.businessObject } : {},
      visual: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height
      },
      context: event.context || {}
    };
  }

  /**
   * 요소 직렬화 (원격 전송용)
   * @param {Object} element - 직렬화할 요소
   * @returns {Object} 직렬화된 요소 정보
   */
  serializeElement(element) {
    const serialized = {
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      businessObject: element.businessObject ? {
        $type: element.businessObject.$type,
        id: element.businessObject.id,
        name: element.businessObject.name
      } : null
    };

    // 연결선인 경우 추가 정보
    if (element.waypoints) {
      serialized.waypoints = element.waypoints;
      
      // 소스/타겟 정보 추가
      if (element.source) {
        serialized.source = element.source.id;
        if (serialized.businessObject) {
          serialized.businessObject.sourceRef = element.source.id;
        }
      }
      
      if (element.target) {
        serialized.target = element.target.id;
        if (serialized.businessObject) {
          serialized.businessObject.targetRef = element.target.id;
        }
      }
    }

    // BusinessObject의 추가 속성들 복사
    if (element.businessObject) {
      const businessObjectKeys = Object.keys(element.businessObject);
      businessObjectKeys.forEach(key => {
        if (key !== '$type' && key !== 'id' && key !== 'name' && 
            !serialized.businessObject.hasOwnProperty(key)) {
          serialized.businessObject[key] = element.businessObject[key];
        }
      });
    }

    return serialized;
  }

  /**
   * 현재 모델 상태 추출
   * @returns {Object} 모델 상태
   */
  extractCurrentModelState() {
    const elementRegistry = this.modeler.get('elementRegistry');
    const elements = elementRegistry.getAll();
    
    return {
      elements: elements.map(element => ({
        id: element.id,
        type: element.type,
        businessObject: element.businessObject,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        parent: element.parent?.id
      })),
      timestamp: Date.now()
    };
  }

  /**
   * 사용자 ID 생성
   * @returns {string} 고유 사용자 ID
   */
  generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 사용자 색상 생성
   * @returns {string} HEX 색상 코드
   */
  generateUserColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * 연결 상태 반환
   * @returns {Object} 연결 상태 정보
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectCount: this.reconnectCount,
      queuedMessages: this.messageQueue.length,
      pendingBroadcasts: this.pendingBroadcasts.length,
      localUser: this.localUser
    };
  }

  /**
   * 연결 해제
   */
  disconnect() {
    if (this.isConnected) {
      this.sendUserLeave();
    }
    
    this.stopHeartbeat();
    
    if (this.websocket) {
      this.websocket.close();
    }
    
    this.isConnected = false;
  }

  /**
   * 협업 시스템 정리
   */
  destroy() {
    this.disconnect();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    // 마우스 awareness 시스템 비활성화
    // if (this.userAwarenessSystem) {
    //   this.userAwarenessSystem.destroy();
    // }
    
    if (this.syncManager) {
      this.syncManager.destroy();
    }
    
    this.messageQueue = [];
    this.pendingBroadcasts = [];
  }
}

export default BPMNCollaborationImplementation;