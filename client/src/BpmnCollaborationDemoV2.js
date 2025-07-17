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
    this.userName = null;
    
    // Y.js 설정
    this.yjsDoc = new window.Y.Doc();
    this.yElements = this.yjsDoc.getMap('elements');
    this.yConnections = this.yjsDoc.getMap('connections');
    this.yProvider = null;
    
    // 서비스 초기화
    this.bpmnModelerService = new BpmnModelerService();
    this.webSocketService = new WebSocketService(
      'http://localhost:3001',
      'ws://localhost:3001/ws'
    );
    
    // 직접 바인딩 (핵심!)
    this.bpmnYjsBinding = null;
    
    this.initializeBpmn();
  }

  /**
   * 클라이언트 ID 생성
   */
  generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * BPMN 초기화
   */
  async initializeBpmn() {
    try {
      await this.bpmnModelerService.initialize();
      console.log('✅ BPMN 모델러 초기화 완료');
      
      // 직접 바인딩 설정 (Y-Quill 패턴)
      this.setupDirectBinding();
      
    } catch (error) {
      console.error('❌ BPMN 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * 직접 바인딩 설정 - Y-Quill과 동일한 패턴
   */
  setupDirectBinding() {
    const bpmnModeler = this.bpmnModelerService.modeler;
    
    // 한 줄로 완전한 바인딩 설정!
    this.bpmnYjsBinding = new BpmnYjsBinding(
      this.yElements, 
      this.yConnections, 
      bpmnModeler,
      this.yProvider?.awareness
    );
    
    console.log('✅ 직접 바인딩 설정 완료 - 이제 자동 동기화됩니다!');
  }

  /**
   * 서버 연결
   */
  async connectToServer() {
    try {
      console.log('🔌 서버에 연결 중...');
      
      // WebSocket 연결
      await this.webSocketService.connect();
      this.userName = `사용자_${Date.now().toString().slice(-4)}`;
      
      this.isConnected = true;
      console.log(`✅ 서버 연결 완료: ${this.userName}`);
      
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
      
      console.log(`✅ 문서 참가 완료: ${documentId}`);
      
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
      });

      this.yProvider.on('sync', (synced) => {
        console.log('Y.js Provider 동기화:', synced);
        if (synced) {
          this.loadExistingDiagram();
        }
      });

      // 바인딩에 awareness 업데이트
      if (this.bpmnYjsBinding) {
        this.bpmnYjsBinding.awareness = this.yProvider.awareness;
      }

      console.log('✅ Y.js Provider 초기화 완료');
      
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
      
      // 기존 데이터가 없으면 기본 다이어그램 생성
      if (elementsCount === 0 && connectionsCount === 0) {
        this.createInitialDiagram();
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

      console.log('📝 초기 다이어그램이 Y.js에 생성됨 - 자동으로 BPMN에 적용됩니다');
      
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
        this.webSocketService.leaveDocument(this.documentId, this.userName);
        this.documentId = null;
      }

      console.log('✅ 문서 나가기 완료');
      
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
      
      console.log('✅ 서버 연결 해제 완료');
      
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
      if (this.bpmnModelerService) {
        this.bpmnModelerService.destroy();
      }

      console.log('✅ 리소스 정리 완료');
      
    } catch (error) {
      console.error('❌ 리소스 정리 실패:', error);
    }
  }

  /**
   * 다이어그램 XML 내보내기
   */
  async exportDiagramAsXML() {
    return await this.bpmnModelerService.exportDiagramAsXML();
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
}