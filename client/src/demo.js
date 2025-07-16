/**
 * Online BPMN Diff - 데모 애플리케이션
 */
import BpmnFactory from '../../bpmn-js/lib/features/modeling/BpmnFactory.js';
import UnifiedEventManager from '../../src/utils/UnifiedEventManager.js';
import CollaborativeIdModule from './CollaborativeIdModule.js';

export class BpmnCollaborationDemo {
  constructor() {
    this.modeler = null;
    this.websocket = null;
    this.yjsDoc = new window.Y.Doc();
    this.yProvider = null;
    this.isConnected = false;
    this.currentDocument = null;
    this.connectedUsers = new Map();
    this.syncCount = 0;
    this.userName = '';
    this.documentId = '';
    this.clientId = this.generateClientId();
    this.isApplyingRemoteChange = false;
    this.lastChangeTime = null;
    this.lastChangedElement = null;
    this.lastCursorUpdate = null;
    this.isEditing = false;
    this.editingElement = null;
    this.pendingRemoteChanges = [];
    this.remoteChangeCount = 0; // 중첩된 원격 변경 추적
    this.lastSyncedData = new Map(); // 마지막 동기화 데이터 캐시
    this.moveTimeouts = new Map(); // 이동 이벤트 디바운스용
    this.connectionRetryCount = new Map(); // 연결 생성 재시도 카운트
    this.synchronizationEnabled = true; // 동기화 활성화 상태
    this.errorCount = 0; // 에러 카운터
    this.maxErrors = 5; // 최대 에러 허용 횟수
    this.autoStopOnError = true; // 에러 시 자동 중지 활성화
    this.pendingElements = new Map(); // 임시 ID → 확정 ID 매핑
    this.tempIdCounter = 0; // 임시 ID 카운터
    
    // 이벤트 중복 방지 시스템
    this.eventManager = new UnifiedEventManager({
      windowMs: 1000,           // 1초 중복 방지 윈도우
      queueSize: 20,            // 20개 이벤트 큐
      batchDelay: 50,           // 50ms 배치 지연
      enableBatching: true,     // 배치 처리 활성화
      enableConsolidation: true // 이벤트 통합 활성화
    });
    
    // 이벤트 핸들러 등록
    this.setupEventHandlers();
    
    // Y.js 데이터 구조
    this.yElements = this.yjsDoc.getMap('elements');
    this.yConnections = this.yjsDoc.getMap('connections');
    this.yMetadata = this.yjsDoc.getMap('metadata');
    
    // 서버 설정
    this.serverUrl = 'http://localhost:3001';
    this.wsUrl = 'ws://localhost:3001/ws';
    
    this.initializeBpmnModeler();
    this.initializeYjs();
    this.setupEventListeners();
    this.updateUI();
    this.initializeUserName();
  }

  /**
   * BPMN 모델러 초기화
   */
  initializeBpmnModeler() {
    try {
      this.modeler = new window.BpmnJS({
        container: '#canvas',
        keyboard: {
          bindTo: document
        },
        additionalModules: [
          // CollaborativeIdModule  // 임시로 비활성화
        ],
        moddleExtensions: {}
      });

      // 초기 다이어그램 로드
      this.loadInitialDiagram();
      
      // CustomElementFactory에 협업 데모 인스턴스 설정
      try {
        const customElementFactory = this.modeler.get('elementFactory');
        if (customElementFactory && customElementFactory.setCollaborationDemo) {
          customElementFactory.setCollaborationDemo(this);
          console.log('CustomElementFactory에 협업 데모 인스턴스 설정 완료');
        }
      } catch (error) {
        console.log('CustomElementFactory 설정 실패:', error);
      }
      
      // 모델러 이벤트 리스너
      this.modeler.on('element.changed', (event) => {
        this.handleElementChanged(event);
      });

      this.modeler.on('elements.changed', (event) => {
        this.handleElementsChanged(event);
      });

      // 실시간 협업을 위한 추가 이벤트
      this.modeler.on('commandStack.element.create.postExecuted', (event) => {
        // 먼저 협업 ID로 교체 시도
        this.handleElementCreateWithCollaborativeId(event);
        // 그 다음 일반 다이어그램 변경 처리
        this.handleDiagramChange('create', event);
      });

      // 연결 생성 이벤트 핸들러 추가
      this.modeler.on('commandStack.connection.create.postExecuted', (event) => {
        this.handleDiagramChange('create', event);
      });

      this.modeler.on('commandStack.element.delete.postExecuted', (event) => {
        console.log('삭제 이벤트 감지:', event.context?.element?.id);
        this.handleDiagramChange('delete', event);
      });

      // 다른 삭제 이벤트들도 확인
      this.modeler.on('commandStack.elements.delete.postExecuted', (event) => {
        console.log('복수 요소 삭제 이벤트 감지:', event.context?.elements?.map(e => e.id));
        // 복수 요소 삭제 시 각각 처리
        if (event.context?.elements) {
          event.context.elements.forEach(element => {
            console.log(`복수 삭제 처리: ${element.id}`);
            this.removeElementFromYjs(element);
          });
        }
      });

      // 모든 commandStack 이벤트 로깅 (디버깅용)
      this.modeler.on('commandStack.changed', (event) => {
        console.log('CommandStack 이벤트:', event);
      });

      // 이동 관련 이벤트들 - commandStack 이벤트 사용 (더 안정적)
      this.modeler.on('commandStack.element.move.postExecuted', (event) => {
        const element = event.context?.element;
        if (!element) return;
        
        // 라벨은 무시
        if (element.id.includes('_label')) {
          return;
        }
        
        // 같은 요소의 이동 이벤트를 디바운스 처리 (300ms)
        const existingTimeout = this.moveTimeouts.get(element.id);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        
        this.moveTimeouts.set(element.id, setTimeout(() => {
          this.handleDiagramChange('move', event);
          this.moveTimeouts.delete(element.id);
        }, 300));
      });

      this.modeler.on('commandStack.element.updateProperties.postExecuted', (event) => {
        this.handleDiagramChange('update', event);
      });

      // 연결선 waypoint 변경 이벤트
      this.modeler.on('commandStack.connection.updateWaypoints.postExecuted', (event) => {
        this.handleDiagramChange('waypoint', event);
      });
      
      // 연결선 재연결 이벤트 (연결점 변경)
      this.modeler.on('commandStack.connection.reconnect.postExecuted', (event) => {
        this.handleDiagramChange('reconnect', event);
      });

      // 편집 상태 감지 이벤트
      this.modeler.on('directEditing.activate', (event) => {
        try {
          this.handleEditingStart(event);
        } catch (error) {
          console.error('편집 시작 처리 오류:', error);
        }
      });

      this.modeler.on('directEditing.deactivate', (event) => {
        try {
          this.handleEditingEnd(event);
        } catch (error) {
          console.error('편집 종료 처리 오류:', error);
        }
      });

      // 컨텍스트 패드 상태 감지
      this.modeler.on('contextPad.create', (event) => {
        try {
          this.handleContextPadOpen(event);
        } catch (error) {
          console.error('컨텍스트 패드 열림 처리 오류:', error);
        }
      });

      this.modeler.on('contextPad.close', (event) => {
        try {
          this.handleContextPadClose(event);
        } catch (error) {
          console.error('컨텍스트 패드 닫힘 처리 오류:', error);
        }
      });

      this.addLog('BPMN 모델러가 초기화되었습니다.', 'info');
    } catch (error) {
      console.error('BPMN 모델러 초기화 실패:', error);
      this.showNotification('BPMN 모델러 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * 초기 다이어그램 로드
   */
  async loadInitialDiagram() {
    const initialDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
                  id="Definitions_1" 
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="시작">
      <bpmn:outgoing>SequenceFlow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="작업 1">
      <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
      <bpmn:outgoing>SequenceFlow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="종료">
      <bpmn:incoming>SequenceFlow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="SequenceFlow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="SequenceFlow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="99" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <dc:Bounds x="187" y="142" width="20" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="270" y="77" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="432" y="99" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <dc:Bounds x="440" y="142" width="20" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="SequenceFlow_1_di" bpmnElement="SequenceFlow_1">
        <di:waypoint x="215" y="117"/>
        <di:waypoint x="270" y="117"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SequenceFlow_2_di" bpmnElement="SequenceFlow_2">
        <di:waypoint x="370" y="117"/>
        <di:waypoint x="432" y="117"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    try {
      await this.modeler.importXML(initialDiagram);
      this.addLog('초기 다이어그램이 로드되었습니다.', 'info');
      
      // 팔레트와 컨텍스트 패드 확인
      setTimeout(() => {
        this.checkBpmnControls();
      }, 1000);
    } catch (error) {
      console.error('초기 다이어그램 로드 실패:', error);
    }
  }

  /**
   * BPMN 컨트롤 요소들 확인
   */
  checkBpmnControls() {
    const palette = document.querySelector('.djs-palette');
    const contextPad = document.querySelector('.djs-context-pad');
    
    if (palette) {
      console.log('팔레트가 발견되었습니다.');
      palette.style.display = 'block';
      palette.style.visibility = 'visible';
    } else {
      console.warn('팔레트를 찾을 수 없습니다.');
    }
    
    // 팔레트 항목들 확인
    const paletteEntries = document.querySelectorAll('.djs-palette .entry');
    console.log(`팔레트 항목 수: ${paletteEntries.length}`);
    
    // 아이콘 폰트 확인
    const testIcon = document.createElement('span');
    testIcon.className = 'bpmn-icon-start-event-none';
    testIcon.style.fontFamily = 'bpmn';
    document.body.appendChild(testIcon);
    
    setTimeout(() => {
      const computedStyle = window.getComputedStyle(testIcon);
      console.log('BPMN 폰트 패밀리:', computedStyle.fontFamily);
      document.body.removeChild(testIcon);
    }, 100);
  }

  /**
   * Y.js 초기화
   */
  initializeYjs() {
    try {
      // Y.js 변경 이벤트 리스너 설정
      this.yElements.observe((event) => {
        this.handleYjsElementsChange(event);
      });

      this.yConnections.observe((event) => {
        this.handleYjsConnectionsChange(event);
      });

      this.yMetadata.observe((event) => {
        this.handleYjsMetadataChange(event);
      });

      // Y.js 문서 업데이트 이벤트
      this.yjsDoc.on('update', (update) => {
        this.handleYjsDocumentUpdate(update);
      });

      this.addLog('Y.js 초기화 완료', 'success');
    } catch (error) {
      console.error('Y.js 초기화 실패:', error);
      this.addLog('Y.js 초기화에 실패했습니다.', 'error');
    }
  }

  /**
   * Y.js 요소 변경 처리
   */
  handleYjsElementsChange(event) {
    // 동기화가 비활성화되어 있으면 스킵
    if (!this.synchronizationEnabled) return;
    
    // 로컬 변경으로 인한 Y.js 업데이트는 무시 (자신의 변경사항은 이미 로컬에 적용됨)
    const origin = event.transaction.origin;
    if (origin === this.clientId) {
      console.log('로컬 변경으로 인한 Y.js 요소 이벤트 무시', { 
        origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
        clientId: this.clientId 
      });
      return;
    }
    
    // WebSocketProvider가 origin인 경우는 원격 변경사항이므로 처리
    console.log('Y.js 요소 변경 처리', {
      origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
      isProvider: origin === this.yProvider
    });
    
    event.changes.keys.forEach((change, key) => {
      if (change.action === 'add' || change.action === 'update') {
        const elementData = this.yElements.get(key);
        this.applyElementChange(key, elementData);
      } else if (change.action === 'delete') {
        this.removeElement(key);
      }
    });
  }

  /**
   * Y.js 연결 변경 처리
   */
  handleYjsConnectionsChange(event) {
    // 동기화가 비활성화되어 있으면 스킵
    if (!this.synchronizationEnabled) return;
    
    if (this.isApplyingRemoteChange) return;
    
    // 로컬 변경으로 인한 Y.js 업데이트는 무시 (자신의 변경사항은 이미 로컬에 적용됨)
    const origin = event.transaction.origin;
    if (origin === this.clientId) {
      console.log('로컬 변경으로 인한 Y.js 연결 이벤트 무시', { 
        origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
        clientId: this.clientId 
      });
      return;
    }
    
    // WebSocketProvider가 origin인 경우는 원격 변경사항이므로 처리
    console.log('Y.js 연결 변경 처리', {
      origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
      isProvider: origin === this.yProvider
    });

    event.changes.keys.forEach((change, key) => {
      if (change.action === 'add' || change.action === 'update') {
        const connectionData = this.yConnections.get(key);
        
        // 실제 waypoint 데이터를 포함한 더 정확한 중복 방지
        const eventData = {
          elementId: key,
          action: 'yjsConnectionChange',
          waypoints: connectionData?.waypoints,
          businessObject: connectionData?.businessObject,
          timestamp: Date.now()
        };

        // 연결 데이터 유효성 검사
        if (!connectionData || !connectionData.source || !connectionData.target) {
          console.log('잘못된 Y.js 연결 데이터 무시됨:', key, connectionData);
          return;
        }

        // 소스/타겟 요소 존재 여부 확인
        const elementRegistry = this.modeler.get('elementRegistry');
        const sourceElement = elementRegistry.get(connectionData.source);
        const targetElement = elementRegistry.get(connectionData.target);
        
        if (!sourceElement || !targetElement) {
          console.log(`⚠️ Y.js 연결 처리 스킵 - 요소 부재: ${key} (소스: ${!!sourceElement}, 타겟: ${!!targetElement})`);
          
          // 100ms 후 재시도 (요소가 아직 생성되지 않았을 수 있음)
          setTimeout(() => {
            console.log(`🔄 연결 재시도: ${key}`);
            this.applyConnectionChange(key, connectionData);
          }, 100);
          return;
        }

        const shouldProcess = this.eventManager.emit('yjs.connection.change', eventData);
        if (!shouldProcess) {
          console.log('중복 Y.js 연결 변경 무시됨:', key);
          return;
        }

        // 연결된 요소가 이동 중인 경우 연결선 업데이트를 지연
        const connection = elementRegistry.get(key);
        
        if (connection && this.isConnectedElementMoving(connection)) {
          console.log('연결된 요소 이동 중으로 연결선 업데이트 지연:', key);
          // 300ms 후에 재시도
          setTimeout(() => {
            this.applyConnectionChange(key, connectionData);
          }, 300);
          return;
        }

        this.applyConnectionChange(key, connectionData);
      } else if (change.action === 'delete') {
        this.removeConnection(key);
      }
    });
  }

  /**
   * Y.js 메타데이터 변경 처리
   */
  handleYjsMetadataChange(event) {
    if (this.isApplyingRemoteChange) return;
    
    console.log('메타데이터 변경:', event);
  }

  /**
   * Y.js 문서 업데이트 처리
   */
  handleYjsDocumentUpdate(update) {
    this.syncCount++;
    this.updateUI();
  }

  /**
   * 편집 시작 처리
   */
  handleEditingStart(event) {
    this.isEditing = true;
    this.editingElement = event.element || event.target;
    const elementId = this.editingElement?.id || 'unknown';
    console.log('편집 시작:', elementId);
    this.addLog(`요소 편집 시작: ${elementId}`, 'info');
  }

  /**
   * 편집 종료 처리
   */
  handleEditingEnd(event) {
    this.isEditing = false;
    this.editingElement = null;
    console.log('편집 종료');
    this.addLog('요소 편집 종료', 'info');
    
    // 대기 중인 원격 변경사항 적용
    this.applyPendingRemoteChanges();
  }

  /**
   * 컨텍스트 패드 열림 처리
   */
  handleContextPadOpen(event) {
    this.isEditing = true;
    this.editingElement = event.element || event.target;
    const elementId = this.editingElement?.id || 'unknown';
    // console.log('컨텍스트 패드 열림:', elementId);
  }

  /**
   * 컨텍스트 패드 닫힘 처리
   */
  handleContextPadClose(event) {
    try {
      // 직접 편집 중이 아니라면 편집 상태 해제
      const directEditing = this.modeler.get('directEditing');
      if (directEditing && !directEditing.isActive()) {
        this.isEditing = false;
        this.editingElement = null;
        // console.log('컨텍스트 패드 닫힘');
        
        // 대기 중인 원격 변경사항 적용
        this.applyPendingRemoteChanges();
      }
    } catch (error) {
      console.error('컨텍스트 패드 닫힘 처리 오류:', error);
      // 오류가 발생해도 편집 상태는 해제
      this.isEditing = false;
      this.editingElement = null;
    }
  }

  /**
   * 대기 중인 원격 변경사항 적용
   */
  async applyPendingRemoteChanges() {
    if (this.pendingRemoteChanges.length > 0) {
      console.log(`대기 중인 ${this.pendingRemoteChanges.length}개의 원격 변경사항 적용`);
      this.addLog(`대기 중인 ${this.pendingRemoteChanges.length}개의 변경사항 적용`, 'info');
      
      // 가장 최신 변경사항만 적용 (중복 방지)
      const latestChange = this.pendingRemoteChanges[this.pendingRemoteChanges.length - 1];
      this.pendingRemoteChanges = [];
      
      // 편집 상태가 아닐 때만 적용
      if (!this.isEditing) {
        await this.applyRemoteChangeDirectly(latestChange);
      }
    }
  }

  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    // 사용자 이름 변경
    document.getElementById('userName').addEventListener('change', (e) => {
      this.userName = e.target.value;
    });

    // 문서 ID 변경
    document.getElementById('documentName').addEventListener('change', (e) => {
      this.documentId = e.target.value;
    });

    // 창 크기 변경 시 캔버스 리사이즈
    window.addEventListener('resize', () => {
      if (this.modeler) {
        this.modeler.get('canvas').resized();
      }
    });

    // 마우스 움직임 추적 (커서 동기화) - 현재 비활성화
    // const canvas = document.getElementById('canvas');
    // if (canvas) {
    //   canvas.addEventListener('mousemove', (e) => {
    //     this.handleMouseMove(e);
    //   });
    // }
    
  }

  /**
   * Y.js 요소 변경 BPMN.js에 적용
   */
  applyElementChange(elementId, elementData) {
    try {
      // 라벨은 원격 업데이트하지 않음
      if (elementId.includes('_label')) {
        return;
      }
      
      console.log(`🔵 요소 생성 시작: ${elementId} (타입: ${elementData.type})`);
      
      // 원격 변경 플래그 설정 (동기화 루프 방지)
      const wasApplyingRemoteChange = this.isApplyingRemoteChange;
      this.isApplyingRemoteChange = true;
      
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');
      
      let element = elementRegistry.get(elementId);
      
      if (!element && elementData.type) {
        // 새 요소 생성
        this.createElement(elementId, elementData);
        console.log(`✅ 요소 생성 완료: ${elementId}`);
      } else if (element) {
        // 기존 요소 업데이트
        this.updateElement(element, elementData);
        console.log(`🔄 요소 업데이트 완료: ${elementId}`);
      }
      
      this.addLog(`요소 변경 적용: ${elementId}`, 'success');
      
      // 원격 변경 플래그 복원
      this.isApplyingRemoteChange = wasApplyingRemoteChange;
      
    } catch (error) {
      console.error('요소 변경 적용 오류:', error);
      this.handleSyncError(error, 'applyElementChange');
      // 오류 발생 시에도 플래그 복원
      this.isApplyingRemoteChange = false;
    }
  }

  /**
   * Y.js 연결 변경 BPMN.js에 적용
   */
  applyConnectionChange(connectionId, connectionData) {
    try {
      console.log(`🔴 연결선 생성 시작: ${connectionId} (소스: ${connectionData.source}, 타겟: ${connectionData.target})`);
      
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');
      
      let connection = elementRegistry.get(connectionId);
      
      if (!connection && connectionData.type) {
        // 새 연결 생성
        this.createConnection(connectionId, connectionData);
        console.log(`✅ 연결선 생성 시도 완료: ${connectionId}`);
      } else if (connection) {
        // 기존 연결 업데이트 (원격 변경사항)
        this.updateConnection(connection, connectionData, true);
        console.log(`🔄 연결선 업데이트 완료: ${connectionId}`);
      }
      
      this.addLog(`연결 변경 적용: ${connectionId}`, 'success');
    } catch (error) {
      console.error('연결 변경 적용 오류:', error);
      this.handleSyncError(error, 'applyConnectionChange');
    }
  }

  /**
   * BPMN 요소 생성
   */
  createElement(elementId, elementData) {
    try {
      const modeling = this.modeler.get('modeling');
      const elementFactory = this.modeler.get('elementFactory');
      const elementRegistry = this.modeler.get('elementRegistry');
      const bpmnFactory = this.modeler.get('bpmnFactory');
      
      // Y.js에서 받은 elementId가 이미 협업 ID
      const finalId = elementId;
      
      // 이미 해당 ID로 요소가 존재하는지 확인
      const existingElement = elementRegistry.get(finalId);
      if (existingElement) {
        console.log(`요소가 이미 존재함: ${finalId}, 생성 스킵`);
        return;
      }
      
      const parent = elementRegistry.get(elementData.parent || 'Process_1');
      const position = elementData.position || { x: 100, y: 100 };

      // name이 빈 문자열인 경우 제외
      const cleanBusinessObject = {};
      if (elementData.businessObject) {
        Object.keys(elementData.businessObject).forEach(key => {
          if (key === 'name' && elementData.businessObject[key] === '') {
            // name이 빈 문자열이면 제외
            return;
          }
          cleanBusinessObject[key] = elementData.businessObject[key];
        });
      }
      
      const businessObject = bpmnFactory.create(elementData.type, {...cleanBusinessObject, id: finalId})
      const newElement = elementFactory.createElement('shape', {type: elementData.type, businessObject: businessObject});
      const shape = modeling.createShape(newElement, position, parent);


      console.log('원격 요소 생성됨:', finalId);
      
    } catch (error) {
      console.error('요소 생성 오류:', error);
    }
  }

  /**
   * BPMN 요소 업데이트
   */
  updateElement(element, elementData) {
    try {
      const modeling = this.modeler.get('modeling');
      
      // 속성 업데이트
      if (elementData.businessObject) {
        modeling.updateProperties(element, elementData.businessObject);
      }
      
      // 위치 업데이트 - 직접 위치 설정 방식 사용
      if (elementData.position) {
        const targetPosition = elementData.position;
        const currentX = element.x || 0;
        const currentY = element.y || 0;
        
        const delta = {
          x: targetPosition.x - currentX,
          y: targetPosition.y - currentY
        };
        
        if (Math.abs(delta.x) > 1 || Math.abs(delta.y) > 1) {
          try {
            modeling.moveElements([element], delta);
            console.log(`${element.id} 위치 이동 완료: (${targetPosition.x}, ${targetPosition.y})`);
          } catch (moveError) {
            console.error(`위치 이동 실패: ${element.id}`, moveError);
          }
        }
      }
      
    } catch (error) {
      console.error('요소 업데이트 오류:', error);
    }
  }

  /**
   * BPMN 연결 생성 (기존 방식 - 주석 처리)
   */
  // createConnection(connectionId, connectionData) {
  //   try {
  //     const modeling = this.modeler.get('modeling');
  //     const elementFactory = this.modeler.get('elementFactory');
  //     const elementRegistry = this.modeler.get('elementRegistry');
  //     const bpmnFactory = this.modeler.get('bpmnFactory');
      
  //     // Y.js에서 받은 connectionId가 이미 협업 ID
  //     const finalId = connectionId;
      
  //     // 이미 해당 ID로 연결이 존재하는지 확인
  //     const existingConnection = elementRegistry.get(finalId);
  //     if (existingConnection) {
  //       console.log(`연결이 이미 존재함: ${finalId}, 생성 스킵`);
  //       return;
  //     }
      
  //     const source = elementRegistry.get(connectionData.source);
  //     const target = elementRegistry.get(connectionData.target);
      
  //     if (source && target) {
  //       // BusinessObject 생성
  //       const businessObject = bpmnFactory.create(connectionData.type || 'bpmn:SequenceFlow', {
  //         ...connectionData.businessObject,
  //         id: finalId,
  //         sourceRef: source.businessObject,
  //         targetRef: target.businessObject
  //       });
        
  //       // Connection Element 생성
  //       const newConnection = elementFactory.createElement('connection', {
  //         type: connectionData.type || 'bpmn:SequenceFlow',
  //         id: finalId,
  //         businessObject: businessObject,
  //         source: source,
  //         target: target
  //       });
        
  //       // Connection 생성
  //       const connection = modeling.createConnection(source, target, newConnection, source.parent);
        
  //       console.log('✅ 원격 연결 생성 성공:', finalId);
        
  //       // 성공 시 재시도 카운트 정리
  //       this.connectionRetryCount.delete(connectionId);
  //       return connection;
  //     } else {
  //       // 재시도 횟수 확인
  //       const retryCount = this.connectionRetryCount.get(connectionId) || 0;
  //       const maxRetries = 10; // 최대 10번 재시도 (총 1초)
        
  //       if (retryCount < maxRetries) {
  //         console.log(`연결 생성 재시도 ${retryCount + 1}/${maxRetries}: ${connectionId}`, {
  //           sourceId: connectionData.source,
  //           targetId: connectionData.target,
  //           sourceFound: !!source,
  //           targetFound: !!target
  //         });
          
  //         this.connectionRetryCount.set(connectionId, retryCount + 1);
          
  //         // 요소가 아직 생성되지 않았을 수 있으므로 잠시 후 재시도
  //         setTimeout(() => {
  //           this.createConnection(connectionId, connectionData);
  //         }, 100);
  //       } else {
  //         console.error('연결 생성 최대 재시도 초과:', connectionId, {
  //           sourceId: connectionData.source,
  //           targetId: connectionData.target,
  //           sourceFound: !!source,
  //           targetFound: !!target
  //         });
          
  //         // 재시도 카운트 정리
  //         this.connectionRetryCount.delete(connectionId);
          
  //         // Y.js에서 잘못된 연결 데이터 제거 (무한 재시도 방지)
  //         console.log('Y.js에서 잘못된 연결 데이터 제거:', connectionId);
  //         this.yConnections.delete(connectionId);
          
  //         this.addLog(`연결 생성 실패로 Y.js 데이터 정리: ${connectionId}`, 'error');
  //       }
  //     }
  //   } catch (error) {
  //     console.error('연결 생성 오류:', error);
  //     this.handleSyncError(error, 'createConnection');
  //   }
  // }

  /**
   * BPMN 연결 생성 (새로운 방식 - elementFactory 직접 사용)
   */
  createConnection(connectionId, connectionData) {
    try {
      const elementFactory = this.modeler.get('elementFactory');
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');
      
      // Y.js에서 받은 connectionId가 이미 협업 ID
      const finalId = connectionId;
      
      // 이미 해당 ID로 연결이 존재하는지 확인
      const existingConnection = elementRegistry.get(finalId);
      if (existingConnection) {
        console.log(`연결이 이미 존재함: ${finalId}, 생성 스킵`);
        return;
      }
      
      const source = elementRegistry.get(connectionData.source);
      const target = elementRegistry.get(connectionData.target);
      const process = elementRegistry.get('Process_1');
      
      if (source && target) {
        // name이 빈 문자열인 경우 제외
        const cleanBusinessObject = {};
        if (connectionData.businessObject) {
          Object.keys(connectionData.businessObject).forEach(key => {
            if (key === 'name' && connectionData.businessObject[key] === '') {
              // name이 빈 문자열이면 제외
              return;
            }
            cleanBusinessObject[key] = connectionData.businessObject[key];
          });
        }
        
        let attr = {
          id: finalId,
          type: connectionData.type || 'bpmn:SequenceFlow',
        }

        // if(connectionData.waypoints) 
        //   attr.waypoints = connectionData.waypoints;

        // if(connectionData.name)
        //   attr.name = connectionData.name;

        const connection = modeling.createConnection(source, target, {
            type: connectionData.type || 'bpmn:SequenceFlow',
            // waypoints
          }, 
          process // source.parent?.id || 'Process_1'
        );

        console.log('연결 성공 : ', connection);
      } else {
        console.error('연결 대상을 찾지 못했습니다.:', source, target);
      }
    } catch (error) {
      console.error('연결 생성 오류:', error);
      this.handleSyncError(error, 'createConnection');
    }
  }

  /**
   * BPMN 연결 업데이트
   */
  updateConnection(connection, connectionData, isRemote = false) {
    // 원격 변경사항이 아닐 때만 중복 방지 적용
    if (!isRemote) {
      const eventData = {
        elementId: connection.id,
        action: 'updateConnection',
        waypoints: connectionData.waypoints,
        properties: connectionData.businessObject
      };

      const shouldProcess = this.eventManager.emit('connection.update', eventData);
      if (!shouldProcess) {
        console.log('중복 연결 업데이트 무시됨:', connection.id);
        return;
      }
    }

    // 실제 업데이트 처리
    this.processConnectionUpdate(connection, connectionData, isRemote);
  }

  /**
   * 연결된 요소가 이동 중인지 확인
   */
  isConnectedElementMoving(connection) {
    if (!connection.source || !connection.target) return false;
    
    // 소스나 타겟 요소가 최근에 이동했는지 확인 (500ms 이내)
    const now = Date.now();
    const sourceId = connection.source.id;
    const targetId = connection.target.id;
    
    return this.moveTimeouts.has(sourceId) || this.moveTimeouts.has(targetId) ||
           (this.lastChangedElement && (this.lastChangedElement === sourceId || this.lastChangedElement === targetId) &&
            this.lastChangeTime && (now - this.lastChangeTime) < 500);
  }

  /**
   * 실제 연결 업데이트 처리
   */
  processConnectionUpdate(connection, connectionData, isRemote = false) {
    try {
      const modeling = this.modeler.get('modeling');
      let hasChanges = false;
      
      // 연결 속성 업데이트 (변경사항이 있을 때만)
      if (connectionData.businessObject) {
        const currentProps = {
          id: connection.businessObject?.id,
          name: connection.businessObject?.name || '',
        };
        
        if (!this.isDataEqual(currentProps, connectionData.businessObject)) {
          modeling.updateProperties(connection, connectionData.businessObject);
          hasChanges = true;
        }
      }
      
      // waypoint 업데이트 - 요소 자동 이동 시에는 스킵
      if (connectionData.waypoints && connectionData.waypoints.length > 0 && !isRemote) {
        const currentWaypoints = connection.waypoints || [];
        const newWaypoints = connectionData.waypoints;
        
        // waypoint 비교 (좌표가 다를 때만 업데이트)
        const waypointsChanged = !this.isDataEqual(currentWaypoints, newWaypoints);
        
        // 원격 변경이 아니고, 실제 waypoint 변경이 있을 때만 업데이트
        if (waypointsChanged && !this.isConnectedElementMoving(connection)) {
          try {
            modeling.updateWaypoints(connection, newWaypoints);
            hasChanges = true;
          } catch (waypointError) {
            console.error('Waypoint 업데이트 실패:', waypointError);
          }
        }
      }
      
      if (hasChanges) {
        console.log(`연결선 업데이트 적용됨 ${isRemote ? '(원격)' : '(로컬)'}:`, connection.id);
      }
    } catch (error) {
      console.error('연결 업데이트 오류:', error);
    }
  }

  /**
   * BPMN 요소 제거
   */
  removeElement(elementId) {
    try {
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');
      
      const element = elementRegistry.get(elementId);
      if (element) {
        modeling.removeElements([element]);
        console.log('요소 제거됨:', elementId);
      }
    } catch (error) {
      console.error('요소 제거 오류:', error);
    }
  }

  /**
   * BPMN 연결 제거
   */
  removeConnection(connectionId) {
    try {
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');
      
      const connection = elementRegistry.get(connectionId);
      if (connection) {
        modeling.removeElements([connection]);
        console.log('연결 제거됨:', connectionId);
      }
    } catch (error) {
      console.error('연결 제거 오류:', error);
    }
  }

  /**
   * 서버 연결
   */
  async connectToServer() {
    this.userName = document.getElementById('userName').value.trim();
    this.documentId = document.getElementById('documentName').value.trim();

    if (!this.userName) {
      this.showNotification('사용자 이름을 입력해주세요.', 'warning');
      return;
    }

    if (!this.documentId) {
      this.showNotification('문서 ID를 입력해주세요.', 'warning');
      return;
    }

    try {
      this.addLog('Y.js Provider 연결 중...', 'info');
      
      // Y.js WebSocket Provider 초기화
      await this.initializeYjsProvider();
      
      this.addLog(`Y.js 협업이 시작되었습니다. 문서: ${this.documentId}`, 'success');
      this.showNotification('Y.js 협업 서버에 연결되었습니다.', 'success');
      document.getElementById('connectBtn').disabled = true;
      document.getElementById('connectBtn').textContent = '연결됨';
      
    } catch (error) {
      console.error('Y.js Provider 연결 실패:', error);
      this.addLog(`Y.js 연결 실패: ${error.message}`, 'error');
      this.showNotification('협업 서버 연결에 실패했습니다.', 'error');
    }
  }

  /**
   * Y.js WebSocket Provider 초기화
   */
  async initializeYjsProvider() {
    return new Promise((resolve, reject) => {
      try {
        // Y.js WebSocket Provider 생성
        this.yProvider = new window.WebsocketProvider(
          'ws://localhost:3001/collaboration',
          this.documentId,
          this.yjsDoc,
          {
            params: {
              user: this.userName,
              clientId: this.clientId
            }
          }
        );

        // Provider 이벤트 리스너
        this.yProvider.on('status', (event) => {
          console.log('Y.js Provider 상태:', event.status);
          if (event.status === 'connected') {
            this.isConnected = true;
            this.updateConnectionStatus();
            this.updateUsersList();
            this.addLog('Y.js Provider 연결됨', 'success');
            resolve();
          } else if (event.status === 'disconnected') {
            this.isConnected = false;
            this.updateConnectionStatus();
            this.addLog('Y.js Provider 연결 끊김', 'warning');
          }
        });

        this.yProvider.on('sync', (isSynced) => {
          if (isSynced) {
            this.addLog('Y.js 문서 동기화 완료', 'success');
            this.loadInitialBpmnFromYjs();
          }
        });

        // Provider awareness (사용자 정보)
        this.yProvider.awareness.setLocalStateField('user', {
          name: this.userName,
          clientId: this.clientId,
          timestamp: Date.now()
        });

        this.yProvider.awareness.on('change', () => {
          this.updateAwarenessUsers();
        });

        // 연결 타임아웃 설정
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Y.js Provider 연결 타임아웃'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Y.js에서 초기 BPMN 데이터 로드
   */
  async loadInitialBpmnFromYjs() {
    try {
      if (this.yElements.size === 0) {
        // 빈 문서인 경우 초기 다이어그램 생성
        await this.createInitialDiagram();
      } else {
        // 기존 데이터가 있는 경우 로드
        this.loadExistingDiagram();
      }
    } catch (error) {
      console.error('초기 BPMN 데이터 로드 오류:', error);
    }
  }

  /**
   * 초기 다이어그램 생성 및 Y.js에 저장
   */
  async createInitialDiagram() {
    try {
      // 기본 BPMN 요소들을 Y.js에 저장
      this.yElements.set('StartEvent_1', {
        type: 'bpmn:StartEvent',
        businessObject: { name: '시작' },
        position: { x: 179, y: 99 },
        parent: 'Process_1'
      });

      this.yElements.set('Task_1', {
        type: 'bpmn:Task',
        businessObject: { name: '작업 1' },
        position: { x: 270, y: 77 },
        parent: 'Process_1'
      });

      this.yElements.set('EndEvent_1', {
        type: 'bpmn:EndEvent',
        businessObject: { name: '종료' },
        position: { x: 432, y: 99 },
        parent: 'Process_1'
      });

      this.yConnections.set('SequenceFlow_1', {
        type: 'bpmn:SequenceFlow',
        source: 'StartEvent_1',
        target: 'Task_1'
      });

      this.yConnections.set('SequenceFlow_2', {
        type: 'bpmn:SequenceFlow',
        source: 'Task_1',
        target: 'EndEvent_1'
      });

      this.addLog('초기 다이어그램이 Y.js에 생성되었습니다.', 'success');
    } catch (error) {
      console.error('초기 다이어그램 생성 오류:', error);
    }
  }

  /**
   * 기존 다이어그램 로드
   */
  loadExistingDiagram() {
    try {
      this.addLog(`기존 다이어그램 로드 중... (요소 ${this.yElements.size}개)`, 'info');
      
      // Y.js 데이터에서 BPMN.js로 요소들 로드
      this.yElements.forEach((elementData, elementId) => {
        this.applyElementChange(elementId, elementData);
      });

      this.yConnections.forEach((connectionData, connectionId) => {
        this.applyConnectionChange(connectionId, connectionData);
      });

      this.addLog('기존 다이어그램 로드 완료', 'success');
    } catch (error) {
      console.error('기존 다이어그램 로드 오류:', error);
    }
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
   * 문서 존재 확인 및 생성 (레거시)
   */
  async ensureDocument() {
    try {
      // 문서 목록 조회
      const documentsResponse = await fetch(`${this.serverUrl}/api/documents`);
      const documents = await documentsResponse.json();
      
      const existingDoc = documents.find(doc => doc.id === this.documentId);
      
      if (!existingDoc) {
        // 새 문서 생성
        const createResponse = await fetch(`${this.serverUrl}/api/documents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: `BPMN Document - ${this.documentId}`,
            initialData: await this.getCurrentDiagramXML()
          })
        });

        if (!createResponse.ok) {
          throw new Error('문서 생성에 실패했습니다.');
        }

        this.currentDocument = await createResponse.json();
        this.addLog(`새 문서가 생성되었습니다: ${this.documentId}`, 'info');
      } else {
        this.currentDocument = existingDoc;
        this.addLog(`기존 문서에 연결되었습니다: ${this.documentId}`, 'info');
      }

    } catch (error) {
      throw new Error(`문서 처리 오류: ${error.message}`);
    }
  }

  /**
   * WebSocket 연결
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.wsUrl}?document=${this.documentId}&user=${this.userName}`;
      
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        this.isConnected = true;
        this.updateConnectionStatus();
        this.updateUsersList();
        this.addLog(`WebSocket 연결 성공: ${this.userName}`, 'success');
        resolve();
      };

      this.websocket.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };

      this.websocket.onclose = () => {
        this.isConnected = false;
        this.connectedUsers.clear();
        this.updateConnectionStatus();
        this.updateUsersList();
        this.addLog('WebSocket 연결이 끊어졌습니다.', 'warning');
      };

      this.websocket.onerror = (error) => {
        this.addLog(`WebSocket 오류: ${error}`, 'error');
        reject(new Error('WebSocket 연결 실패'));
      };

      // 연결 타임아웃
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('WebSocket 연결 타임아웃'));
        }
      }, 5000);
    });
  }

  /**
   * WebSocket 메시지 처리
   */
  handleWebSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log('Received message:', message);
      
      switch (message.type) {
        case 'connection_established':
          this.handleConnectionEstablished(message);
          break;
        case 'users_list':
          this.handleUsersList(message);
          break;
        case 'user_joined':
          this.handleUserJoined(message);
          break;
        case 'user_left':
          this.handleUserLeft(message);
          break;
        // Y.js 기반으로 변경되어 더 이상 사용하지 않음
        // case 'document_changed':
        // case 'diagram_changed':
        // case 'element_changed':
        // case 'elements_changed':
        //   this.handleDocumentChanged(message);
        //   break;
        // case 'cursor_update':
        //   this.handleCursorUpdate(message);
        //   break;
        default:
          console.log('알 수 없는 메시지 타입:', message.type);
      }
    } catch (error) {
      console.error('WebSocket 메시지 처리 오류:', error);
    }
  }

  /**
   * 연결 확인 처리
   */
  handleConnectionEstablished(message) {
    this.addLog(`서버 연결이 확인되었습니다.`, 'success');
    this.showNotification('서버에 성공적으로 연결되었습니다!', 'success');
    
    // 연결되면 즉시 사용자 목록 업데이트
    this.updateUsersList();
    this.updateConnectionStatus();
  }

  /**
   * 사용자 목록 처리
   */
  handleUsersList(message) {
    const { users } = message;
    
    // 현재 사용자 제외하고 다른 사용자들 추가
    this.connectedUsers.clear();
    users.forEach(userId => {
      if (userId !== this.userName) {
        this.connectedUsers.set(userId, {
          id: userId,
          name: userId,
          joinedAt: Date.now(),
          cursor: null
        });
      }
    });
    
    this.updateUsersList();
    this.addLog(`현재 ${users.length}명이 참여 중입니다.`, 'info');
  }

  /**
   * 사용자 입장 처리
   */
  handleUserJoined(message) {
    const { userId, userName } = message;
    
    if (userId !== this.userName) {
      this.connectedUsers.set(userId, {
        id: userId,
        name: userName,
        joinedAt: Date.now(),
        cursor: null
      });
      
      this.updateUsersList();
      this.addLog(`${userName}님이 참여했습니다.`, 'user-joined');
      this.showNotification(`${userName}님이 참여했습니다.`, 'info');
    }
  }

  /**
   * 사용자 퇴장 처리
   */
  handleUserLeft(message) {
    const { userId, userName } = message;
    
    this.connectedUsers.delete(userId);
    this.updateUsersList();
    this.addLog(`${userName}님이 나갔습니다.`, 'user-left');
  }

  /**
   * 문서 변경 처리
   */
  async handleDocumentChanged(message) {
    if (message.userId === this.clientId) return; // 자신의 변경사항은 무시

    this.addLog(`${message.userName}님이 문서를 수정했습니다.`, 'document-changed');
    
    // 편집 중이라면 변경사항을 대기열에 추가
    if (this.isEditing) {
      console.log('편집 중이므로 변경사항을 대기열에 추가');
      this.pendingRemoteChanges.push(message);
      this.addLog(`편집 중이므로 ${message.userName}님의 변경사항을 대기 중`, 'warning');
      return;
    }
    
    await this.applyRemoteChangeDirectly(message);
  }

  /**
   * 원격 변경사항 직접 적용
   */
  async applyRemoteChangeDirectly(message) {
    try {
      // 원격 변경 적용 중 플래그 설정
      this.isApplyingRemoteChange = true;
      
      // 충돌 검사 및 해결
      const conflict = await this.detectConflict(message);
      if (conflict) {
        await this.resolveConflict(conflict, message);
      } else {
        // 변경 유형에 따라 처리
        if (message.type === 'diagram_changed' && message.data?.xml) {
          // diagram_changed 메시지 처리 - XML 적용
          await this.modeler.importXML(message.data.xml);
          this.addLog(`${message.userName}님의 다이어그램 변경사항이 적용되었습니다.`, 'success');
        } else if (message.data?.type === 'diagram_changed' && message.data?.data?.xml) {
          // 중첩된 구조의 diagram_changed 메시지 처리
          await this.modeler.importXML(message.data.data.xml);
          this.addLog(`${message.userName}님의 다이어그램 변경사항이 적용되었습니다.`, 'success');
        } else if (message.changes) {
          // 기존 방식 지원 - 현재는 로깅만
          console.log('레거시 변경사항 수신:', message.changes);
          this.addLog(`${message.userName}님이 다이어그램을 수정했습니다.`, 'info');
        } else {
          // 기타 메시지
          console.log('처리되지 않은 메시지:', message);
          this.addLog(`${message.userName}님이 다이어그램을 수정했습니다.`, 'info');
        }
      }
      
      this.syncCount++;
      this.updateUI();
      
    } catch (error) {
      console.error('원격 변경사항 적용 오류:', error);
      this.addLog('원격 변경사항 적용에 실패했습니다.', 'error');
    } finally {
      // 원격 변경 적용 완료 후 플래그 해제
      setTimeout(() => {
        this.isApplyingRemoteChange = false;
      }, 100);
    }
  }

  /**
   * 충돌 감지
   */
  async detectConflict(remoteMessage) {
    try {
      const currentTime = Date.now();
      const messageTime = remoteMessage.timestamp;
      const timeDiff = currentTime - messageTime;
      
      // 동시 편집 감지 (1초 이내 변경)
      if (timeDiff < 1000 && this.lastChangeTime && (currentTime - this.lastChangeTime) < 1000) {
        // 같은 요소를 편집하는지 확인
        const remoteElement = remoteMessage.data?.data?.element;
        if (remoteElement && this.lastChangedElement && remoteElement.id === this.lastChangedElement.id) {
          return {
            type: 'element_conflict',
            element: remoteElement,
            localTime: this.lastChangeTime,
            remoteTime: messageTime
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('충돌 감지 오류:', error);
      return null;
    }
  }

  /**
   * 충돌 해결
   */
  async resolveConflict(conflict, remoteMessage) {
    try {
      this.addLog(`충돌이 감지되었습니다: ${conflict.element?.id}`, 'warning');
      
      // 시간 기반 해결 (늦게 온 변경사항 우선)
      if (conflict.remoteTime > conflict.localTime) {
        // 원격 변경사항 적용
        if (remoteMessage.data?.type === 'diagram_changed' && remoteMessage.data?.data?.xml) {
          await this.modeler.importXML(remoteMessage.data.data.xml);
          this.addLog(`충돌 해결: ${remoteMessage.userName}님의 변경사항이 적용되었습니다.`, 'success');
        }
      } else {
        // 로컬 변경사항 유지
        this.addLog('충돌 해결: 로컬 변경사항을 유지합니다.', 'success');
        
        // 현재 상태를 다른 사용자들에게 브로드캐스트
        const { xml } = await this.modeler.saveXML({ format: true });
        this.sendDocumentChange({
          type: 'diagram_changed',
          data: {
            action: 'conflict_resolved',
            timestamp: Date.now(),
            userId: this.clientId,
            userName: this.userName,
            xml: xml
          }
        });
      }
      
    } catch (error) {
      console.error('충돌 해결 오류:', error);
      this.addLog('충돌 해결에 실패했습니다.', 'error');
    }
  }

  /**
   * 커서 업데이트 처리
   */
  handleCursorUpdate(message) {
    const { userId, cursor } = message;
    
    if (this.connectedUsers.has(userId)) {
      const user = this.connectedUsers.get(userId);
      user.cursor = cursor;
      this.updateRemoteCursors();
    }
  }

  /**
   * 요소 변경 이벤트 처리 (Y.js)
   */
  async handleElementChanged(event) {
    if (this.isConnected && !this.isApplyingRemoteChange) {
      try {
        this.syncElementToYjs(event.element);
        this.addLog(`요소 변경됨: ${event.element.id}`, 'document-changed');
      } catch (error) {
        console.error('요소 변경 처리 오류:', error);
      }
    }
  }

  /**
   * 여러 요소 변경 이벤트 처리 (Y.js)
   */
  async handleElementsChanged(event) {
    if (this.isConnected && !this.isApplyingRemoteChange) {
      try {
        event.elements.forEach(element => {
          this.syncElementToYjs(element);
        });
        this.addLog(`${event.elements.length}개 요소 변경됨`, 'document-changed');
      } catch (error) {
        console.error('요소들 변경 처리 오류:', error);
      }
    }
  }

  /**
   * 데이터 비교 함수 (깊은 비교)
   */
  isDataEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (!obj1 || !obj2) return false;
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (let key of keys1) {
      if (!keys2.includes(key)) return false;
      
      const val1 = obj1[key];
      const val2 = obj2[key];
      
      if (typeof val1 === 'object' && typeof val2 === 'object') {
        if (!this.isDataEqual(val1, val2)) return false;
      } else if (val1 !== val2) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * BPMN 요소를 Y.js로 동기화
   */
  syncElementToYjs(element) {
    try {
      // 동기화가 비활성화되어 있으면 스킵
      if (!this.synchronizationEnabled) {
        return;
      }
      
      // 원격 변경 처리 중일 때는 동기화하지 않음 (무한 루프 방지)
      if (this.isApplyingRemoteChange) {
        return;
      }
      
      // 라벨은 동기화하지 않음
      if (element.id.includes('_label')) {
        return;
      }
      
      // 요소 데이터 구성 (이제 element.id는 이미 협업 ID)
      const elementData = {
        type: element.type,
        businessObject: element.businessObject ? {
          id: element.id,  // 이미 협업 ID
          name: element.businessObject.name || '',
        } : {},
        position: element.x !== undefined ? {
          x: element.x || 0,
          y: element.y || 0,
          width: element.width || 100,
          height: element.height || 80
        } : null,
        parent: element.parent?.id || 'Process_1'
      };

      // 기존 데이터와 비교하여 변경사항이 있을 때만 동기화
      if (element.type && element.type.includes('SequenceFlow')) {
        const existingData = this.yConnections.get(element.id);
        const newData = {
          type: element.type,
          source: element.source?.id,
          target: element.target?.id,
          businessObject: elementData.businessObject,
          waypoints: element.waypoints ? element.waypoints.map(wp => ({
            x: wp.x,
            y: wp.y
          })) : []
        };
        
        // 중복 동기화 방지를 위한 추가 체크
        const lastSyncedData = this.lastSyncedData.get(element.id);
        const isDataChanged = !this.isDataEqual(existingData, newData);
        const isNewSync = !this.isDataEqual(lastSyncedData, newData);
        
        if (isDataChanged && isNewSync) {
          // 트랜잭션으로 감싸서 origin 설정
          this.yjsDoc.transact(() => {
            this.yConnections.set(element.id, newData);
          }, this.clientId);
          this.lastSyncedData.set(element.id, JSON.parse(JSON.stringify(newData))); // 깊은 복사
          console.log('Y.js 연결 동기화됨:', element.id);
        }
      } else {
        const existingData = this.yElements.get(element.id);
        
        // 중복 동기화 방지를 위한 추가 체크
        const lastSyncedData = this.lastSyncedData.get(element.id);
        const isDataChanged = !this.isDataEqual(existingData, elementData);
        const isNewSync = !this.isDataEqual(lastSyncedData, elementData);
        
        if (isDataChanged && isNewSync) {
          // 트랜잭션으로 감싸서 origin 설정
          this.yjsDoc.transact(() => {
            this.yElements.set(element.id, elementData);
          }, this.clientId);
          this.lastSyncedData.set(element.id, JSON.parse(JSON.stringify(elementData))); // 깊은 복사
          console.log('Y.js 요소 동기화됨:', element.id, '위치:', elementData.position);
        } else {
          // console.log('Y.js 동기화 스킵 (중복 또는 데이터 동일):', element.id);
        }
      }
    } catch (error) {
      console.error('Y.js 동기화 오류:', error);
      this.handleSyncError(error, 'syncElementToYjs');
    }
  }

  /**
   * Y.js에서 요소 제거 (삭제 시)
   */
  removeElementFromYjs(element) {
    try {
      // 동기화가 비활성화되어 있으면 스킵
      if (!this.synchronizationEnabled) {
        return;
      }
      
      // 원격 변경 처리 중일 때는 동기화하지 않음 (무한 루프 방지)
      if (this.isApplyingRemoteChange) {
        return;
      }
      
      // 라벨은 동기화하지 않음
      if (element.id.includes('_label')) {
        return;
      }
      
      console.log(`Y.js에서 요소 제거: ${element.id}`);
      
      // 연결인지 요소인지 구분하여 제거
      this.yjsDoc.transact(() => {
        if (element.type === 'connection' || element.waypoints) {
          // 연결선 제거
          this.yConnections.delete(element.id);
          console.log(`Y.js에서 연결 제거됨: ${element.id}`);
        } else {
          // 일반 요소 제거
          this.yElements.delete(element.id);
          console.log(`Y.js에서 요소 제거됨: ${element.id}`);
        }
      }, this.clientId);
      
      this.addLog(`요소 삭제됨: ${element.id}`, 'document-changed');
      
    } catch (error) {
      console.error('Y.js 요소 제거 오류:', error);
      this.handleSyncError(error, 'removeElementFromYjs');
    }
  }

  /**
   * 다이어그램 변경 처리 (Y.js 기반)
   */
  async handleDiagramChange(action, event) {
    if (!this.isConnected) return;

    try {
      // 원격 변경 처리 중일 때는 Y.js 동기화하지 않음 (무한 루프 방지)
      if (this.isApplyingRemoteChange) {
        console.log(`원격 변경 중이므로 Y.js 동기화 스킵: ${action}`);
        return;
      }
      
      // 변경 이력 추적
      this.lastChangeTime = Date.now();
      // commandStack 이벤트는 event.context.element에 요소가 있음
      this.lastChangedElement = event.context ? event.context.element : null;
      
      // 요소 생성 시 즉시 동기화 (ID 교체는 Y.js 레벨에서 처리)
      if (action === 'create' && this.lastChangedElement) {
        console.log(`새 요소 생성 감지: ${this.lastChangedElement.id}, 즉시 Y.js 동기화`);
      }
      
      // Y.js로 변경사항 동기화 (로컬 변경만)
      if (this.lastChangedElement) {
        if (action === 'delete') {
          // 삭제 시에는 Y.js에서 요소 제거
          console.log(`삭제 처리: ${this.lastChangedElement.id}, 연결상태: ${this.isConnected}`);
          this.removeElementFromYjs(this.lastChangedElement);
        } else {
          // 생성, 수정, 이동 등은 요소 동기화
          this.syncElementToYjs(this.lastChangedElement);
        }
      } else {
        console.log(`변경된 요소 없음, action: ${action}`);
      }
      
      this.syncCount++;
      this.updateUI();
      
      this.addLog(`다이어그램 ${action} 동작 Y.js 동기화`, 'document-changed');
    } catch (error) {
      console.error('다이어그램 변경 처리 오류:', error);
      this.handleSyncError(error, 'handleDiagramChange');
    }
  }

  /**
   * 요소 생성 직후 협업 ID로 교체
   */
  handleElementCreateWithCollaborativeId(event) {
    try {
      // 원격 변경 중이거나 연결되지 않은 경우 스킵
      if (this.isApplyingRemoteChange || !this.isConnected) {
        return;
      }

      const element = event.context?.element;
      if (!element || !element.businessObject) {
        return;
      }

      // 라벨이나 이미 협업 ID인 경우 스킵
      if (element.id?.includes('_label') || this.isCollaborativeId(element.id)) {
        return;
      }

      console.log(`요소 생성 직후 협업 ID 교체 시도: ${element.id}`);

      // 위치 정보 추출
      const position = {
        x: element.x || 0,
        y: element.y || 0
      };

      // 협업 ID 생성
      const collaborativeId = this.generateCollaborativeId(
        element.type || element.businessObject?.$type,
        position,
        Date.now()
      );

      // ID 중복 확인
      const elementRegistry = this.modeler.get('elementRegistry');
      const existingElement = elementRegistry.get(collaborativeId);
      if (existingElement) {
        console.log(`협업 ID 충돌 감지: ${collaborativeId}, 원본 ID 유지`);
        return;
      }

      // modeling을 사용해서 안전하게 ID 변경
      const modeling = this.modeler.get('modeling');
      
      // 원격 변경 플래그 설정 (재귀 방지)
      const wasApplyingRemoteChange = this.isApplyingRemoteChange;
      this.isApplyingRemoteChange = true;
      
      try {
        console.log(`요소 ID 협업용으로 교체: ${element.id} → ${collaborativeId}`);
        
        // ID 업데이트
        modeling.updateProperties(element, { id: collaborativeId });
        
        this.addLog(`협업 ID 즉시 교체: ${collaborativeId}`, 'success');
        
      } finally {
        // 플래그 복원
        this.isApplyingRemoteChange = wasApplyingRemoteChange;
      }

    } catch (error) {
      console.error('요소 생성 직후 ID 교체 오류:', error);
    }
  }

  /**
   * 협업 ID인지 확인 (접두사 기반)
   */
  isCollaborativeId(id) {
    const collaborativePrefixes = ['Activity_', 'Event_', 'Gateway_', 'Flow_', 'StartEvent_', 'EndEvent_', 'Element_'];
    return collaborativePrefixes.some(prefix => 
      id.startsWith(prefix) && id.includes('_') && id.length > prefix.length + 7 // 해시가 7자리이므로
    );
  }


  /**
   * 문서 변경사항 전송
   */
  sendDocumentChange(changes) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const message = {
        type: 'document_changed',
        userId: this.userName,
        documentId: this.documentId,
        changes: changes,
        timestamp: Date.now()
      };

      this.websocket.send(JSON.stringify(message));
    }
  }

  /**
   * 마우스 움직임 처리 (비활성화됨)
   */
  // handleMouseMove(event) {
  //   if (!this.isConnected) return;
  //   
  //   // 커서 위치 계산
  //   const rect = event.target.getBoundingClientRect();
  //   const x = event.clientX - rect.left;
  //   const y = event.clientY - rect.top;
  //   
  //   // 일정 간격으로만 전송 (성능 최적화)
  //   const now = Date.now();
  //   if (!this.lastCursorUpdate || now - this.lastCursorUpdate > 100) {
  //     this.lastCursorUpdate = now;
  //     
  //     // 커서 위치 브로드캐스트
  //     this.sendCursorUpdate({ x, y });
  //   }
  // }

  /**
   * 커서 위치 전송 (비활성화됨)
   */
  // sendCursorUpdate(position) {
  //   if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
  //     this.websocket.send(JSON.stringify({
  //       type: 'cursor_update',
  //       documentId: this.documentId,
  //       userId: this.clientId,
  //       userName: this.userName,
  //       cursor: position,
  //       timestamp: Date.now()
  //     }));
  //   }
  // }

  /**
   * 원격 변경사항 적용
   */
  async applyRemoteChanges(changes) {
    try {
      console.log('원격 변경사항 적용:', changes);
      
      // 현재 다이어그램 상태를 가져와서 전체 동기화
      if (changes.type === 'element_changed' || changes.type === 'elements_changed') {
        // 변경이 감지되면 서버에서 최신 상태를 요청하도록 신호를 보냄
        this.requestLatestDiagram();
      }
    } catch (error) {
      console.error('원격 변경사항 적용 오류:', error);
    }
  }

  /**
   * 최신 다이어그램 상태 요청
   */
  requestLatestDiagram() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'request_latest_diagram',
        documentId: this.documentId,
        userId: this.clientId,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * 현재 다이어그램 XML 가져오기
   */
  async getCurrentDiagramXML() {
    try {
      const { xml } = await this.modeler.saveXML({ format: true });
      return xml;
    } catch (error) {
      console.error('XML 추출 실패:', error);
      return null;
    }
  }

  /**
   * 연결 상태 업데이트
   */
  updateConnectionStatus() {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');

    if (this.isConnected) {
      statusDot.classList.add('connected');
      statusText.textContent = '연결됨';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = '연결 안됨';
    }
  }

  /**
   * 사용자 목록 업데이트
   */
  updateUsersList() {
    const usersList = document.getElementById('usersList');
    const userCount = document.getElementById('userCount');
    
    if (!this.isConnected) {
      userCount.textContent = '0';
      usersList.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          협업 연결을 기다리는 중...
        </div>
      `;
      return;
    }

    // 연결된 상태에서는 자신을 포함하여 카운트
    const totalUsers = this.connectedUsers.size + 1;
    userCount.textContent = totalUsers;

    let usersHtml = '';

    // 자신 추가 (항상 맨 위에)
    if (this.userName) {
      usersHtml += `
        <div class="user-item">
          <div class="user-avatar" style="background: #2ed573;">${this.userName.charAt(0).toUpperCase()}</div>
          <div class="user-details">
            <div class="user-name">${this.userName} (나)</div>
            <div class="user-status">온라인</div>
          </div>
        </div>
      `;
    }

    // 다른 사용자들 추가
    this.connectedUsers.forEach(user => {
      const userColor = this.getUserColor(user.id);
      usersHtml += `
        <div class="user-item">
          <div class="user-avatar" style="background: ${userColor};">${user.name.charAt(0).toUpperCase()}</div>
          <div class="user-details">
            <div class="user-name">${user.name}</div>
            <div class="user-status">온라인</div>
          </div>
        </div>
      `;
    });

    usersList.innerHTML = usersHtml;
  }


  /**
   * UI 업데이트
   */
  updateUI() {
    document.getElementById('documentId').textContent = this.documentId || '-';
    document.getElementById('clientId').textContent = this.clientId;
    document.getElementById('syncCount').textContent = this.syncCount;

    const connectBtn = document.getElementById('connectBtn');
    if (this.isConnected) {
      connectBtn.textContent = '연결됨';
      connectBtn.disabled = true;
    } else {
      connectBtn.textContent = '협업 시작';
      connectBtn.disabled = false;
    }
  }

  /**
   * 원격 커서 업데이트
   */
  updateRemoteCursors() {
    const cursorsOverlay = document.getElementById('cursorsOverlay');
    cursorsOverlay.innerHTML = '';

    this.connectedUsers.forEach(user => {
      if (user.cursor) {
        const cursorElement = document.createElement('div');
        cursorElement.className = 'cursor';
        cursorElement.style.left = user.cursor.x + 'px';
        cursorElement.style.top = user.cursor.y + 'px';
        cursorElement.style.color = this.getUserColor(user.id);
        cursorElement.setAttribute('data-user', user.name);
        
        cursorsOverlay.appendChild(cursorElement);
      }
    });
  }

  /**
   * 사용자별 색상 생성
   */
  getUserColor(userId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43'
    ];
    
    const hash = userId.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    
    return colors[hash % colors.length];
  }

  /**
   * 활동 로그 추가
   */
  addLog(message, type = 'info') {
    const activityLog = document.getElementById('activityLog');
    const timestamp = new Date().toLocaleTimeString();
    
    const logItem = document.createElement('div');
    logItem.className = `log-item ${type}`;
    logItem.innerHTML = `<strong>${timestamp}</strong> ${message}`;
    
    activityLog.insertBefore(logItem, activityLog.firstChild);
    
    // 로그 개수 제한
    while (activityLog.children.length > 50) {
      activityLog.removeChild(activityLog.lastChild);
    }
  }

  /**
   * 알림 표시
   */
  showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const content = notification.querySelector('.notification-content');
    
    content.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }

  /**
   * 사용자 이름 초기화
   */
  initializeUserName() {
    const userNameInput = document.getElementById('userName');
    if (userNameInput) {
      userNameInput.value = `사용자${this.clientId}`;
      this.userName = userNameInput.value;
    }
  }

  /**
   * 이벤트 핸들러 설정
   */
  setupEventHandlers() {
    // 연결 업데이트 이벤트 핸들러
    this.eventManager.on('connection.update', (eventData) => {
      console.log('연결 업데이트 이벤트 처리됨:', eventData.elementId);
    });
    
    // Y.js 연결 변경 이벤트 핸들러
    this.eventManager.on('yjs.connection.change', (eventData) => {
      console.log('Y.js 연결 변경 이벤트 처리됨:', eventData.elementId);
    });
    
    // 요소 업데이트 이벤트 핸들러
    this.eventManager.on('element.update', (eventData) => {
      console.log('요소 업데이트 이벤트 처리됨:', eventData.elementId);
    });
    
    // 요소 이동 이벤트 핸들러
    this.eventManager.on('element.move', (eventData) => {
      console.log('요소 이동 이벤트 처리됨:', eventData.elementId);
    });
  }


  /**
   * 에러 발생 시 처리 (자동 동기화 중지)
   */
  handleSyncError(error, context = '') {
    this.errorCount++;
    console.error(`동기화 에러 ${this.errorCount}/${this.maxErrors} [${context}]:`, error);
    
    if (this.autoStopOnError && this.errorCount >= this.maxErrors && this.synchronizationEnabled) {
      console.error('🚨 최대 에러 횟수 초과, 자동 동기화 중지');
      this.addLog(`에러가 ${this.maxErrors}회 발생하여 자동으로 동기화가 중지되었습니다.`, 'error');
      
      // 자동 동기화 중지
      this.stopSynchronization('auto-error');
      
      // 사용자에게 알림
      alert(`동기화 에러가 ${this.maxErrors}회 발생하여 자동으로 중지되었습니다.\n문제를 확인한 후 수동으로 재개해주세요.`);
    }
  }

  /**
   * 에러 카운터 리셋
   */
  resetErrorCount() {
    this.errorCount = 0;
  }

  /**
   * 동기화 중지 (내부 함수)
   */
  stopSynchronization(reason = 'manual') {
    if (!this.synchronizationEnabled) return;
    
    this.synchronizationEnabled = false;
    
    // 진행 중인 재시도들 정리
    this.connectionRetryCount.clear();
    this.moveTimeouts.clear();
    
    console.log(`🛑 동기화가 중지되었습니다 (${reason})`);
    this.addLog(`동기화가 중지되었습니다. 로컬 변경사항만 유효합니다. (사유: ${reason})`, 'warning');
    
    // 버튼 상태 업데이트
    this.updateSyncButton('stopped');
  }

  /**
   * 동기화 재개 (내부 함수)
   */
  startSynchronization() {
    if (this.synchronizationEnabled) return;
    
    this.synchronizationEnabled = true;
    this.resetErrorCount(); // 에러 카운터 리셋
    
    console.log('▶️ 동기화가 재개되었습니다');
    this.addLog('동기화가 재개되었습니다. 원격 동기화가 활성화됩니다.', 'success');
    
    // 버튼 상태 업데이트
    this.updateSyncButton('started');
  }

  /**
   * 동기화 버튼 상태 업데이트
   */
  updateSyncButton(state) {
    const button = document.getElementById('stopSyncBtn');
    if (!button) return;
    
    if (state === 'stopped') {
      button.textContent = '동기화 재개';
      button.style.background = 'linear-gradient(135deg, #2ed573 0%, #17c0eb 100%)';
    } else {
      button.textContent = '동기화 중지';
      button.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)';
    }
  }

  /**
   * 동기화 토글 (중지/재개)
   */
  toggleSynchronization() {
    try {
      if (!this.isConnected) {
        alert('협업에 연결되지 않은 상태입니다.');
        return;
      }

      if (this.synchronizationEnabled) {
        this.stopSynchronization('manual');
      } else {
        this.startSynchronization();
      }
      
    } catch (error) {
      console.error('동기화 토글 오류:', error);
      this.handleSyncError(error, 'toggleSynchronization');
    }
  }

  /**
   * 협업용 결정론적 ID 생성
   */
  generateCollaborativeId(type, position, timestamp = Date.now()) {
    // 위치를 50px 그리드로 정규화
    const gridX = Math.round(position.x / 50) * 50;
    const gridY = Math.round(position.y / 50) * 50;
    
    // 타임스탬프를 100ms 단위로 정규화 (동시 생성 시 같은 시간대)
    const normalizedTime = Math.floor(timestamp / 100) * 100;
    
    // 해시 생성용 문자열
    const hashInput = `${type}_${gridX}_${gridY}_${normalizedTime}_${this.documentId}`;
    
    // 간단한 해시 생성
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      hash = ((hash << 5) - hash) + hashInput.charCodeAt(i);
      hash = hash & hash; // 32bit 정수로 변환
    }
    
    // 절댓값으로 양수 해시 생성 후 16진수 변환
    const hexHash = Math.abs(hash).toString(16).substring(0, 7);
    
    // BPMN 타입별 접두사
    const prefix = this.getElementPrefix(type);
    
    return `${prefix}_${hexHash}`;
  }

  /**
   * BPMN 요소 타입별 접두사 반환
   */
  getElementPrefix(type) {
    if (type.includes('Task') || type.includes('Activity')) return 'Activity';
    if (type.includes('Gateway')) return 'Gateway';
    if (type.includes('StartEvent')) return 'StartEvent';
    if (type.includes('EndEvent')) return 'EndEvent';
    if (type.includes('Event')) return 'Event';
    if (type.includes('SequenceFlow')) return 'Flow';
    return 'Element';
  }

  /**
   * 클라이언트 ID 생성
   */
  generateClientId() {
    return Math.random().toString(36).substr(2, 4).toUpperCase();
  }
}

