/**
 * BPMN Collaboration Demo V3 - Silent Update Architecture
 * 
 * 새로운 Silent Update 아키텍처를 사용한 완전한 협업 시스템 구현
 */

import BpmnModeler from 'bpmn-js/lib/Modeler';

// 새로운 Silent Update 시스템 임포트
import { BPMNCollaborationImplementation } from '../../src/integration/BPMNCollaborationImplementation.js';
import { SilentUpdateService } from '../../src/silent-update/SilentUpdateService.js';
import { SynchronizationManager } from '../../src/synchronization/SynchronizationManager.js';

export class BpmnCollaborationDemoV3 {
  constructor(options = {}) {
    this.options = {
      websocketUrl: 'ws://localhost:3001',
      documentId: 'demo-document',
      userId: null,
      userName: 'Anonymous User',
      userColor: null,
      enableDebugLogs: true,
      enableVerboseLogs: false, // 상세 로그 (요소 변경, 선택 등)
      ...options
    };

    // 상태 관리
    this.isConnected = false;
    this.isInitialized = false;
    this.currentDocumentId = null;
    this.connectedUsers = new Map(); // 연결된 사용자 목록

    // 핵심 컴포넌트들
    this.modeler = null;
    this.collaborationSystem = null;
    this.silentUpdateService = null;
    this.syncManager = null;

    // 이벤트 리스너들
    this.eventListeners = new Map();

    this.initialize();
  }

  /**
   * 시스템 초기화
   */
  async initialize() {
    try {
      this.log('🚀 BPMN Collaboration Demo V3 초기화 시작...');
      
      await this.initializeBpmnModeler();
      await this.loadInitialDiagram();
      
      this.isInitialized = true;
      this.log('✅ 초기화 완료');
      
    } catch (error) {
      console.error('❌ 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * BPMN 모델러 초기화
   */
  async initializeBpmnModeler() {
    const container = document.getElementById('canvas');
    if (!container) {
      throw new Error('Canvas container not found');
    }

    this.modeler = new BpmnModeler({
      container: container,
      keyboard: {
        bindTo: window
      }
    });

    // 모델러 이벤트 리스너 설정
    this.setupModelerEventListeners();
    
    this.log('📦 BPMN 모델러 초기화 완료');
  }

  /**
   * 모델러 이벤트 리스너 설정
   */
  setupModelerEventListeners() {
    // 요소 변경 이벤트
    this.modeler.on('element.changed', (event) => {
      // 협업 시스템이 원격 변경사항을 처리 중이거나 동기화 소스에서 온 이벤트는 무시
      if (this.collaborationSystem && 
          event.source !== 'collaboration' && 
          event.source !== 'synchronization' && 
          !this.isProcessingRemoteEvent() &&
          this.options.enableVerboseLogs) {
        this.log('🔄 요소 변경 감지:', event.element.id);
      }
    });

    // 선택 변경 이벤트
    this.modeler.on('selection.changed', (event) => {
      // 원격 이벤트 처리 중이 아닐 때만 로그 출력 (상세 로그가 활성화된 경우에만)
      if (this.collaborationSystem && 
          !this.isProcessingRemoteEvent() && 
          this.options.enableVerboseLogs) {
        this.log('🎯 선택 변경:', event.newSelection.map(e => e.id));
      }
    });

    // commandStack 변경 이벤트
    this.modeler.on('commandStack.changed', (event) => {
      // 원격 이벤트 처리 중이 아닐 때만 로그 출력 (상세 로그가 활성화된 경우에만)
      if (this.collaborationSystem && 
          event.trigger === 'execute' && 
          !this.isProcessingRemoteEvent() &&
          this.options.enableVerboseLogs) {
        this.log('⚡ 명령 실행:', event.command?.constructor?.name);
      }
    });
  }

  /**
   * 초기 다이어그램 로드
   */
  async loadInitialDiagram() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
                  id="Definitions_1" 
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>SequenceFlow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Sample Task">
      <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
      <bpmn:outgoing>SequenceFlow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>SequenceFlow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="SequenceFlow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="SequenceFlow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="99" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="187" y="142" width="25" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="270" y="77" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="432" y="99" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="440" y="142" width="20" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="SequenceFlow_1_di" bpmnElement="SequenceFlow_1">
        <di:waypoint x="215" y="117" />
        <di:waypoint x="270" y="117" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SequenceFlow_2_di" bpmnElement="SequenceFlow_2">
        <di:waypoint x="370" y="117" />
        <di:waypoint x="432" y="117" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    try {
      await this.modeler.importXML(xml);
      this.log('📊 초기 다이어그램 로드 완료');
    } catch (error) {
      console.error('다이어그램 로드 실패:', error);
      throw error;
    }
  }

  /**
   * 서버 연결
   */
  async connectToServer() {
    if (this.isConnected) {
      this.log('⚠️ 이미 서버에 연결되어 있습니다.');
      return;
    }

    if (!this.isInitialized) {
      throw new Error('시스템이 초기화되지 않았습니다.');
    }

    try {
      this.log('🔌 서버 연결 시도 중...');

      // UI에서 사용자 정보 가져오기
      const userNameInput = document.getElementById('user-name');
      const userName = userNameInput?.value?.trim() || this.options.userName || 'Anonymous User';
      
      // 사용자 정보 설정
      const userId = this.options.userId || this.generateUserId();
      const userColor = this.options.userColor || this.generateUserColor();

      // 옵션 업데이트
      this.options.userId = userId;
      this.options.userName = userName;
      this.options.userColor = userColor;

      // 협업 시스템 초기화
      this.collaborationSystem = new BPMNCollaborationImplementation(
        this.modeler,
        this.options.websocketUrl,
        {
          userId: userId,
          userName: userName,
          userColor: userColor,
          enableCursorTracking: true,
          enableSelectionTracking: true,
          autoReconnect: true,
          maxReconnectAttempts: 5,
          batchDelayMs: 50,
          maxBatchSize: 20
        }
      );

      // Silent Update 서비스 직접 접근
      this.silentUpdateService = this.collaborationSystem.silentUpdater;
      this.syncManager = this.collaborationSystem.syncManager;

      // 연결 완료까지 대기
      await this.waitForConnection();

      this.isConnected = true;
      this.log('✅ 서버 연결 완료');

      // 연결 상태 이벤트 발생 (사용자 목록은 서버에서 받은 후 업데이트됨)
      this.emit('connected', { 
        userId: userId,
        userName: userName,
        userColor: userColor
      });

    } catch (error) {
      console.error('서버 연결 실패:', error);
      throw error;
    }
  }

  /**
   * 연결 완료까지 대기
   */
  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('연결 타임아웃'));
      }, 10000);

      const checkConnection = () => {
        if (this.collaborationSystem && this.collaborationSystem.isConnected) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  /**
   * 문서 참가
   */
  async joinDocument(documentId) {
    if (!this.isConnected) {
      throw new Error('서버에 먼저 연결해주세요.');
    }

    try {
      this.log(`📄 문서 "${documentId}" 참가 중...`);

      // 기존 문서에서 나가기
      if (this.currentDocumentId) {
        await this.leaveDocument();
      }

      // 서버에서 문서 내용 가져오기
      await this.loadDocumentFromServer(documentId);

      // 새 문서 참가
      this.currentDocumentId = documentId;

      this.log(`✅ 문서 "${documentId}" 참가 완료`);
      this.emit('documentJoined', { documentId: documentId });

    } catch (error) {
      console.error('문서 참가 실패:', error);
      throw error;
    }
  }

  /**
   * 서버에서 문서 내용 로드
   */
  async loadDocumentFromServer(documentId) {
    try {
      this.log(`📥 서버에서 문서 "${documentId}" 확인 중...`);

      // 서버 REST API로 문서 조회 (404는 정상적인 응답)
      const response = await fetch(`http://localhost:3001/api/documents/${documentId}`, {
        method: 'GET'
      });
      
      if (response.status === 404) {
        // 문서가 없으면 새로 생성 (첫 접속 시 정상 동작)
        this.log(`📝 새 문서 "${documentId}" 생성 중...`);
        await this.createDocumentOnServer(documentId);
        return;
      }
      
      if (!response.ok) {
        throw new Error(`서버 응답 오류: ${response.status}`);
      }

      const documentData = await response.json();
      
      // 문서 내용이 있으면 BPMN 모델러에 로드
      if (documentData.content && documentData.content.bpmn) {
        await this.modeler.importXML(documentData.content.bpmn);
        this.log(`✅ 문서 "${documentId}" 로드 완료`);
      } else {
        // 빈 문서면 기본 다이어그램 로드
        await this.loadInitialDiagram();
        this.log(`📝 빈 문서 "${documentId}"에 기본 다이어그램 로드`);
      }

    } catch (error) {
      this.log(`❌ 문서 로드 실패, 기본 다이어그램 사용: ${error.message}`);
      await this.loadInitialDiagram();
    }
  }

  /**
   * 서버에 새 문서 생성
   */
  async createDocumentOnServer(documentId) {
    try {
      // 기본 BPMN XML 준비
      const xml = await this.modeler.saveXML();
      
      const response = await fetch('http://localhost:3001/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `Document ${documentId}`,
          initialData: {
            bpmn: xml.xml
          }
        })
      });

      if (!response.ok) {
        throw new Error(`문서 생성 실패: ${response.status}`);
      }

      const result = await response.json();
      this.log(`✅ 서버에 문서 "${documentId}" 생성 완료`);
      return result;

    } catch (error) {
      console.error('서버 문서 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 문서 나가기
   */
  async leaveDocument() {
    if (!this.currentDocumentId) {
      return;
    }

    try {
      this.log(`📄 문서 "${this.currentDocumentId}" 나가는 중...`);

      const documentId = this.currentDocumentId;
      this.currentDocumentId = null;

      this.log(`✅ 문서 "${documentId}" 나가기 완료`);
      this.emit('documentLeft', { documentId: documentId });

    } catch (error) {
      console.error('문서 나가기 실패:', error);
      throw error;
    }
  }

  /**
   * 연결 해제
   */
  disconnect() {
    try {
      this.log('🔌 연결 해제 중...');

      if (this.collaborationSystem) {
        this.collaborationSystem.destroy();
        this.collaborationSystem = null;
      }

      this.silentUpdateService = null;
      this.syncManager = null;
      this.isConnected = false;
      this.currentDocumentId = null;

      // 사용자 목록 초기화
      this.clearUsersList();

      this.log('✅ 연결 해제 완료');
      this.emit('disconnected');

    } catch (error) {
      console.error('연결 해제 실패:', error);
      throw error;
    }
  }

  /**
   * 다이어그램 XML 내보내기
   */
  async exportDiagramAsXML() {
    try {
      const result = await this.modeler.saveXML({ format: true });
      return result.xml;
    } catch (error) {
      console.error('XML 내보내기 실패:', error);
      throw error;
    }
  }

  /**
   * 다이어그램 SVG 내보내기
   */
  async exportDiagramAsSVG() {
    try {
      const result = await this.modeler.saveSVG();
      return result.svg;
    } catch (error) {
      console.error('SVG 내보내기 실패:', error);
      throw error;
    }
  }

  /**
   * 요소 이동 테스트
   */
  testElementMove() {
    try {
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');

      const element = elementRegistry.get('Task_1');
      if (element) {
        const newPosition = {
          x: element.x + 50,
          y: element.y + 30
        };

        modeling.moveElements([element], { x: 50, y: 30 });
        this.log(`🔄 요소 이동 테스트: ${element.id} → (${newPosition.x}, ${newPosition.y})`);
        return true;
      } else {
        this.log('❌ 테스트용 요소를 찾을 수 없습니다.');
        return false;
      }
    } catch (error) {
      console.error('요소 이동 테스트 실패:', error);
      return false;
    }
  }

  /**
   * Silent Update 테스트
   */
  testSilentUpdate() {
    if (!this.silentUpdateService) {
      this.log('❌ Silent Update 서비스가 초기화되지 않았습니다.');
      return false;
    }

    try {
      // 테스트용 속성 업데이트
      const updated = this.silentUpdateService.updateBusinessObject('Task_1', {
        name: 'Updated Task ' + Date.now()
      });

      if (updated) {
        this.log('✅ Silent Update 테스트 성공');
        return true;
      } else {
        this.log('❌ Silent Update 테스트 실패');
        return false;
      }
    } catch (error) {
      console.error('Silent Update 테스트 오류:', error);
      return false;
    }
  }

  /**
   * 동기화 상태 확인
   */
  getSyncStatus() {
    if (!this.syncManager) {
      return { error: 'SyncManager not initialized' };
    }

    return this.syncManager.getStatus();
  }

  /**
   * 연결 상태 확인
   */
  getConnectionStatus() {
    if (!this.collaborationSystem) {
      return { 
        isConnected: false,
        error: 'Collaboration system not initialized'
      };
    }

    return this.collaborationSystem.getConnectionStatus();
  }

  /**
   * 원격 이벤트 처리 중인지 확인
   */
  isProcessingRemoteEvent() {
    if (!this.collaborationSystem || !this.collaborationSystem.collaborationManager) {
      return false;
    }
    
    return this.collaborationSystem.collaborationManager.isProcessingRemote();
  }

  /**
   * 이벤트 리스너 등록
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * 이벤트 리스너 제거
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 이벤트 발생
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('이벤트 콜백 오류:', error);
        }
      });
    }
  }

  /**
   * 사용자 ID 생성
   */
  generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 사용자 색상 생성
   */
  generateUserColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * 사용자 목록 업데이트
   */
  updateUsersList() {
    const usersElement = document.getElementById('users-list');
    const userCountElement = document.getElementById('user-count');
    
    if (!usersElement) return;

    if (!this.isConnected || this.connectedUsers.size === 0) {
      usersElement.innerHTML = '<div class="loading"><div class="spinner"></div>협업 연결을 기다리는 중...</div>';
      if (userCountElement) {
        userCountElement.textContent = '0';
      }
      return;
    }

    const userElements = Array.from(this.connectedUsers.values()).map(user => {
      const isCurrentUser = user.id === this.options.userId;
      return `
        <div class="user-item ${isCurrentUser ? 'current-user' : ''}" data-user-id="${user.id}">
          <div class="user-avatar" style="background-color: ${user.color || '#666'}">
            ${user.name.charAt(0).toUpperCase()}
          </div>
          <div class="user-info">
            <div class="user-name">${user.name}${isCurrentUser ? ' (나)' : ''}</div>
            <div class="user-status">온라인</div>
          </div>
        </div>
      `;
    }).join('');

    usersElement.innerHTML = userElements;
    
    if (userCountElement) {
      userCountElement.textContent = this.connectedUsers.size.toString();
    }

    this.log(`사용자 목록 업데이트: ${this.connectedUsers.size}명`);
  }

  /**
   * 사용자 추가
   */
  addUser(user) {
    this.connectedUsers.set(user.id, user);
    this.updateUsersList();
    this.log(`사용자 추가: ${user.name}`);
  }

  /**
   * 사용자 제거
   */
  removeUser(userId) {
    if (this.connectedUsers.has(userId)) {
      const user = this.connectedUsers.get(userId);
      this.connectedUsers.delete(userId);
      this.updateUsersList();
      this.log(`사용자 제거: ${user.name}`);
    }
  }

  /**
   * 사용자 목록 초기화
   */
  clearUsersList() {
    this.connectedUsers.clear();
    this.updateUsersList();
    this.log('사용자 목록 초기화');
  }

  /**
   * 로그 출력
   */
  log(...args) {
    if (this.options.enableDebugLogs) {
      console.log('[BPMN Demo V3]', ...args);
    }
  }

  /**
   * 상세 로그 활성화/비활성화
   */
  enableVerboseLogs(enabled = true) {
    this.options.enableVerboseLogs = enabled;
    this.log(`상세 로그 ${enabled ? '활성화' : '비활성화'}`);
  }

  /**
   * 디버그 로그 활성화/비활성화
   */
  enableDebugLogs(enabled = true) {
    this.options.enableDebugLogs = enabled;
    console.log(`[BPMN Demo V3] 디버그 로그 ${enabled ? '활성화' : '비활성화'}`);
  }

  /**
   * 시스템 정리
   */
  destroy() {
    try {
      this.log('🧹 시스템 정리 중...');

      this.disconnect();
      
      if (this.modeler) {
        this.modeler.destroy();
        this.modeler = null;
      }

      this.eventListeners.clear();
      this.isInitialized = false;

      this.log('✅ 시스템 정리 완료');

    } catch (error) {
      console.error('시스템 정리 실패:', error);
    }
  }

  /**
   * 디버그 정보 반환
   */
  getDebugInfo() {
    return {
      isInitialized: this.isInitialized,
      isConnected: this.isConnected,
      currentDocumentId: this.currentDocumentId,
      hasModeler: !!this.modeler,
      hasCollaborationSystem: !!this.collaborationSystem,
      hasSilentUpdateService: !!this.silentUpdateService,
      hasSyncManager: !!this.syncManager,
      connectionStatus: this.getConnectionStatus(),
      syncStatus: this.getSyncStatus(),
      options: this.options
    };
  }
}

export default BpmnCollaborationDemoV3;