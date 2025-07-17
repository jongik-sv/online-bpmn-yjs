/**
 * BPMN 협업 데모 V2 - 직접 바인딩 사용
 * Y-Quill처럼 간단한 바인딩으로 복잡성 80% 제거
 */
import { BpmnModelerService } from './services/BpmnModelerService.js';
import { WebSocketService } from './services/WebSocketService.js';
import { BpmnYjsBinding } from './services/BpmnYjsBinding.js';

export class BpmnCollaborationDemoV2 {
  constructor() {
    this.clientId = this.generateClientId();
    this.isConnected = false;
    this.documentId = null;
    this.userName = this.generateRandomUserName();
    
    // Y.js 설정
    this.yjsDoc = new window.Y.Doc();
    this.yElements = this.yjsDoc.getMap('elements');
    this.yConnections = this.yjsDoc.getMap('connections');
    this.yProvider = null;
    
    // 서비스 초기화
    this._bpmnModelerService = new BpmnModelerService();
    this.webSocketService = new WebSocketService(
      'http://localhost:3001',
      'ws://localhost:3001/ws'
    );
    
    // 직접 바인딩 (핵심!)
    this.bpmnYjsBinding = null;
    
    // 연결된 사용자 관리
    this.connectedUsers = new Map();
    
    this.initializeBpmn();
  }

  /**
   * 클라이언트 ID 생성
   */
  generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * 랜덤 사용자 이름 생성
   */
  generateRandomUserName() {
    const adjectives = ['빠른', '똑똑한', '창의적인', '열정적인', '차분한', '용감한', '친절한', '활발한', '신중한', '유쾌한'];
    const nouns = ['개발자', '디자이너', '기획자', '분석가', '아키텍트', '전문가', '리더', '매니저', '컨설턴트', '엔지니어'];
    
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNumber = Math.floor(Math.random() * 999) + 1;
    
    return `${randomAdjective}_${randomNoun}_${randomNumber}`;
  }

  /**
   * BPMN 초기화
   */
  async initializeBpmn() {
    try {
      this._bpmnModelerService.initializeBpmnModeler();
      // console.log('✅ BPMN 모델러 초기화 완료');
      
      // 기본 다이어그램 로드 (화면에 BPMN 표시)
      await this._bpmnModelerService.loadInitialDiagram();
      // console.log('✅ 기본 다이어그램 로드 완료');
      
      // 직접 바인딩 설정 (Y-Quill 패턴)
      this.setupDirectBinding();
      
      // 초기 UI 업데이트
      this.updateUserInfo();
      
    } catch (error) {
      console.error('❌ BPMN 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 직접 바인딩 설정 - Y-Quill과 동일한 패턴
   */
  setupDirectBinding() {
    const bpmnModeler = this._bpmnModelerService.modeler;
    
    // 한 줄로 완전한 바인딩 설정!
    this.bpmnYjsBinding = new BpmnYjsBinding(
      this.yElements, 
      this.yConnections, 
      bpmnModeler,
      this.yProvider?.awareness
    );
    
    // console.log('✅ 직접 바인딩 설정 완료 - 이제 자동 동기화됩니다!');
  }

  /**
   * 서버 연결
   */
  async connectToServer() {
    try {
      console.log('🔌 서버에 연결 중...');
      
      // WebSocket 연결
      await this.webSocketService.connectToServer();
      this.userName = this.generateRandomUserName();
      
      this.isConnected = true;
      
      // UI 업데이트
      this.updateUserInfo();
      
      // console.log(`✅ 서버 연결 완료: ${this.userName} (클라이언트 ID: ${this.clientId})`);
      
    } catch (error) {
      console.error('❌ 서버 연결 실패:', error);
      throw error;
    }
  }

  /**
   * 문서 참가
   */
  async joinDocument(documentId) {
    try {
      if (!documentId) {
        throw new Error('문서 ID를 입력해주세요.');
      }
      
      this.documentId = documentId;
      
      // Y.js Provider 초기화
      await this.initializeYjsProvider();
      
      // WebSocket으로 문서 참가 알림
      this.webSocketService.joinDocument(documentId, this.userName);
      
      // UI 업데이트
      this.updateUserInfo();
      
      // console.log(`✅ 문서 참가 완료: ${documentId}`);
      
    } catch (error) {
      console.error('❌ 문서 참가 실패:', error);
      throw error;
    }
  }

  /**
   * Y.js Provider 초기화
   */
  async initializeYjsProvider() {
    try {
      const wsUrl = 'ws://localhost:3001/yjs';
      
      // WebsocketProvider 생성
      const WebsocketProvider = window.WebsocketProvider || window.Y.WebsocketProvider;
      this.yProvider = new WebsocketProvider(wsUrl, this.documentId, this.yjsDoc, {
        connect: true,
        resyncInterval: 5000
      });

      // Provider 이벤트
      this.yProvider.on('status', (event) => {
        console.log('Y.js Provider 상태:', event.status);
        if (event.status === 'connected') {
          this.updateUsersList();
        } else if (event.status === 'disconnected') {
          console.warn('⚠️ Y.js Provider 연결 끊김');
        }
      });

      this.yProvider.on('sync', (synced) => {
        console.log('Y.js Provider 동기화:', synced);
        if (synced) {
          this.loadExistingDiagram();
        }
      });

      // Provider 에러 이벤트 처리
      this.yProvider.on('connection-error', (error) => {
        console.error('❌ Y.js Provider 연결 오류:', error);
        // 연결 오류 시 자동 재연결 시도하지 않음 (사용자가 직접 재연결하도록)
      });

      // WebSocket 에러 이벤트 처리
      if (this.yProvider.ws) {
        this.yProvider.ws.addEventListener('error', (error) => {
          console.error('❌ Y.js WebSocket 오류:', error);
        });

        this.yProvider.ws.addEventListener('close', (event) => {
          console.warn('⚠️ Y.js WebSocket 연결 종료:', event.code, event.reason);
        });
      }

      // Provider awareness (사용자 정보) 설정
      this.yProvider.awareness.setLocalStateField('user', {
        name: this.userName,
        clientId: this.clientId,
        document: this.documentId,
        timestamp: Date.now()
      });

      // Awareness 변경 이벤트 리스너
      this.yProvider.awareness.on('change', () => {
        this.updateAwarenessUsers();
      });

      // 바인딩에 awareness 업데이트
      if (this.bpmnYjsBinding) {
        this.bpmnYjsBinding.awareness = this.yProvider.awareness;
      }

      // console.log('✅ Y.js Provider 초기화 완료');
      
    } catch (error) {
      console.error('❌ Y.js Provider 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 기존 다이어그램 로드
   */
  loadExistingDiagram() {
    try {
      // Y.js에서 기존 데이터가 있으면 자동으로 바인딩이 처리함
      const elementsCount = this.yElements.size;
      const connectionsCount = this.yConnections.size;
      
      console.log(`📊 기존 다이어그램 로드: 요소 ${elementsCount}개, 연결 ${connectionsCount}개`);
      
      // 기존 데이터가 없으면 기본 다이어그램은 이미 로드되어 있음
      if (elementsCount === 0 && connectionsCount === 0) {
        console.log('📋 기본 다이어그램이 이미 로드되어 있음 - 바인딩이 자동 처리');
      }
      
    } catch (error) {
      console.error('기존 다이어그램 로드 오류:', error);
    }
  }

  /**
   * 초기 다이어그램 생성
   */
  createInitialDiagram() {
    try {
      // BPMN 모델러가 완전히 초기화되었는지 확인
      if (!this._bpmnModelerService?.modeler) {
        console.warn('BPMN 모델러가 초기화되지 않음, 초기 다이어그램 생성 스킵');
        return;
      }

      // 잠시 후 생성 (바인딩 초기화 완료 대기)
      setTimeout(() => {
        // Y.js에 직접 데이터 설정 - 바인딩이 자동으로 BPMN에 적용
        this.yElements.set('StartEvent_1', {
          type: 'bpmn:StartEvent',
          x: 179, y: 99, width: 36, height: 36,
          businessObject: { id: 'StartEvent_1', name: '시작', $type: 'bpmn:StartEvent' },
          parent: 'Process_1'
        });

        this.yElements.set('Task_1', {
          type: 'bpmn:Task',
          x: 270, y: 77, width: 100, height: 80,
          businessObject: { id: 'Task_1', name: '작업 1', $type: 'bpmn:Task' },
          parent: 'Process_1'
        });

        this.yElements.set('EndEvent_1', {
          type: 'bpmn:EndEvent',
          x: 432, y: 99, width: 36, height: 36,
          businessObject: { id: 'EndEvent_1', name: '종료', $type: 'bpmn:EndEvent' },
          parent: 'Process_1'
        });

        this.yConnections.set('SequenceFlow_1', {
          type: 'bpmn:SequenceFlow',
          source: 'StartEvent_1',
          target: 'Task_1',
          businessObject: { id: 'SequenceFlow_1', $type: 'bpmn:SequenceFlow' },
          waypoints: [
            { x: 215, y: 117 },
            { x: 270, y: 117 }
          ]
        });

        this.yConnections.set('SequenceFlow_2', {
          type: 'bpmn:SequenceFlow',
          source: 'Task_1',
          target: 'EndEvent_1',
          businessObject: { id: 'SequenceFlow_2', $type: 'bpmn:SequenceFlow' },
          waypoints: [
            { x: 370, y: 117 },
            { x: 432, y: 117 }
          ]
        });

        // console.log('📝 초기 다이어그램이 Y.js에 생성됨 - 자동으로 BPMN에 적용됩니다');
      }, 100);
      
    } catch (error) {
      console.error('초기 다이어그램 생성 오류:', error);
    }
  }

  /**
   * 문서 나가기
   */
  async leaveDocument() {
    try {
      if (this.yProvider) {
        this.yProvider.disconnect();
        this.yProvider = null;
      }

      if (this.documentId) {
        this.webSocketService.leaveDocument(this.documentId);
        this.documentId = null;
      }

      // 사용자 목록 초기화
      this.connectedUsers.clear();
      this.updateUsersList();

      // console.log('✅ 문서 나가기 완료');
      
    } catch (error) {
      console.error('❌ 문서 나가기 실패:', error);
    }
  }

  /**
   * 연결 해제
   */
  disconnect() {
    try {
      this.leaveDocument();
      this.webSocketService.disconnect();
      this.isConnected = false;
      
      // 사용자 목록 초기화
      this.connectedUsers.clear();
      this.updateUsersList();
      
      // console.log('✅ 서버 연결 해제 완료');
      
    } catch (error) {
      console.error('❌ 연결 해제 실패:', error);
    }
  }

  /**
   * 리소스 정리
   */
  destroy() {
    try {
      // 바인딩 해제
      if (this.bpmnYjsBinding) {
        this.bpmnYjsBinding.unbind();
        this.bpmnYjsBinding = null;
      }

      // 연결 해제
      this.disconnect();

      // Y.js 문서 정리
      if (this.yjsDoc) {
        this.yjsDoc.destroy();
      }

      // BPMN 모델러 정리
      if (this._bpmnModelerService) {
        this._bpmnModelerService.destroy();
      }

      // console.log('✅ 리소스 정리 완료');
      
    } catch (error) {
      console.error('❌ 리소스 정리 실패:', error);
    }
  }

  /**
   * 다이어그램 XML 내보내기
   */
  async exportDiagramAsXML() {
    return await this._bpmnModelerService.exportDiagramAsXML();
  }

  /**
   * 연결된 사용자 수 확인
   */
  getConnectedUserCount() {
    return this.yProvider?.awareness?.getStates()?.size || 0;
  }

  /**
   * Y.js 데이터 현황
   */
  getYjsStatus() {
    return {
      elements: this.yElements.size,
      connections: this.yConnections.size,
      connected: !!this.yProvider?.wsconnected,
      users: this.getConnectedUserCount()
    };
  }

  /**
   * 기존 demo.js 호환성을 위한 메서드들
   */
  
  /**
   * BPMN 모델러 서비스 반환 (기존 API 호환)
   */
  get bpmnModelerService() {
    return this._bpmnModelerService;
  }

  /**
   * 동기화 상태 업데이트 (기존 API 호환)
   */
  updateSyncStatus() {
    // V2에서는 자동으로 처리되므로 빈 구현
  }

  /**
   * 동기화 토글 (기존 API 호환)
   */
  toggleSynchronization() {
    if (this.bpmnYjsBinding) {
      if (this.bpmnYjsBinding.isBound()) {
        this.bpmnYjsBinding.unbind();
        console.log('🔌 동기화 비활성화됨');
      } else {
        this.bpmnYjsBinding.bind();
        console.log('✅동기화 활성화됨');
      }
    }
  }

  /**
   * 사용자 정보 UI 업데이트
   */
  updateUserInfo() {
    // 사용자 이름 업데이트
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
      if (userNameElement.tagName === 'INPUT') {
        userNameElement.value = this.userName;
      } else {
        userNameElement.textContent = this.userName;
      }
    }

    // 클라이언트 ID 업데이트
    const clientIdElement = document.getElementById('client-id');
    if (clientIdElement) {
      clientIdElement.textContent = this.clientId;
    }

    // 문서 ID 업데이트
    const documentIdElement = document.getElementById('document-name');
    if (documentIdElement) {
      documentIdElement.textContent = this.documentId || '-';
    }

    // 연결 상태 업데이트
    const connectionStatusElement = document.getElementById('connection-status');
    if (connectionStatusElement) {
      connectionStatusElement.textContent = this.isConnected ? '연결됨' : '연결 안됨';
      connectionStatusElement.className = this.isConnected ? 'status-dot connected' : 'status-dot';
    }

    // 사용자 목록도 업데이트
    this.updateUsersList();

    // console.log('🎨 사용자 정보 UI 업데이트 완료:', {
    //   userName: this.userName,
    //   clientId: this.clientId,
    //   documentId: this.documentId,
    //   isConnected: this.isConnected
    // });
  }

  /**
   * Awareness 사용자 업데이트
   */
  updateAwarenessUsers() {
    if (!this.yProvider) return;
    
    const awarenessStates = this.yProvider.awareness.getStates();
    this.connectedUsers.clear();
    
    awarenessStates.forEach((state, clientId) => {
      if (clientId !== this.yProvider.awareness.clientID && state.user) {
        this.connectedUsers.set(clientId, {
          id: state.user.clientId || clientId,
          name: state.user.name,
          timestamp: state.user.timestamp
        });
      }
    });
    
    this.updateUsersList();
  }

  /**
   * 사용자 목록 업데이트
   */
  updateUsersList() {
    const usersElement = document.getElementById('users-list');
    const userCountElement = document.getElementById('user-count');
    
    if (!usersElement) return;

    const documentUsers = new Map();
    
    // 현재 사용자 추가
    documentUsers.set(this.clientId, {
      name: this.userName,
      isCurrentUser: true,
      document: this.documentId
    });
    
    // Y.js awareness에서 같은 문서의 사용자들만 필터링
    if (this.yProvider) {
      const awarenessStates = this.yProvider.awareness.getStates();
      awarenessStates.forEach((state, clientId) => {
        if (clientId !== this.yProvider.awareness.clientID && 
            state.user && 
            state.user.document === this.documentId) {
          documentUsers.set(clientId, {
            name: state.user.name,
            isCurrentUser: false,
            document: state.user.document,
            timestamp: state.user.timestamp
          });
        }
      });
    }
    
    const userCount = documentUsers.size;
    
    // 사용자 수 업데이트
    if (userCountElement) {
      userCountElement.textContent = userCount;
    }
    
    // 사용자 목록 렌더링
    const currentDoc = this.documentId || '연결되지 않음';
    usersElement.innerHTML = documentUsers.size === 0 ? 
      `<div class="loading">
        <div class="spinner"></div>
        문서 "${currentDoc}"에 참가 중...
      </div>` :
      Array.from(documentUsers.values())
        .map(user => `
          <div class="user-item">
            <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
            <div class="user-details">
              <div class="user-name">${user.name}${user.isCurrentUser ? ' (나)' : ''}</div>
              <div class="user-status">문서: ${user.document || currentDoc}</div>
            </div>
          </div>
        `).join('');
    
    // console.log('👥 사용자 목록 업데이트 완료:', {
    //   totalUsers: userCount,
    //   currentDocument: currentDoc,
    //   users: Array.from(documentUsers.values()).map(u => u.name)
    // });
  }
}