/**
 * Online BPMN Collaboration Demo - 리팩토링된 메인 클래스
 * 각 서비스들을 조합하여 협업 기능 제공
 */
import { BpmnModelerService } from './services/BpmnModelerService.js';
import { YjsSyncService } from './services/YjsSyncService.js';
import { WebSocketService } from './services/WebSocketService.js';
import { ElementManager } from './managers/ElementManager.js';
import UnifiedEventManager from '../../src/utils/UnifiedEventManager.js';

export class BpmnCollaborationDemo {
  constructor() {
    // 기본 속성
    this.isConnected = false;
    this.currentDocument = null;
    this.userName = '';
    this.documentId = '';
    this.clientId = this.generateClientId();
    this.isEditing = false;
    this.editingElement = null;
    this.pendingRemoteChanges = [];
    this.synchronizationEnabled = true;
    this.errorCount = 0;
    this.maxErrors = 5;
    this.autoStopOnError = true;
    this.yProvider = null;
    this.connectedUsers = new Map();
    this.lastSyncedData = new Map(); // 마지막 동기화 데이터 캐시 (중복 방지)
    this.connectionRetryCount = new Map(); // 연결 생성 재시도 카운트
    this.isApplyingRemoteChange = false; // 원격 변경 적용 중 플래그
    this.processingDeletion = new Set(); // 삭제 처리 중 요소 추적 (중복 방지)
    this.isProcessingConnectionEvents = false; // 연결 이벤트 처리 중 플래그 (무한루프 방지)

    // 서비스 초기화
    this.bpmnModelerService = new BpmnModelerService();
    this.yjsSyncService = new YjsSyncService(this.clientId);
    this.webSocketService = new WebSocketService(
      'http://localhost:3001',
      'ws://localhost:3001/ws'
    );
    this.elementManager = new ElementManager(
      this.bpmnModelerService,
      this.yjsSyncService
    );

    // 이벤트 관리자
    this.eventManager = new UnifiedEventManager({
      windowMs: 1000,
      queueSize: 20,
      batchDelay: 50,
      enableBatching: true,
      enableConsolidation: true
    });

    // 이벤트 핸들러 설정
    this.setupEventHandlers();
    
    // 초기화
    this.initialize();
  }

  /**
   * 초기화
   */
  async initialize() {
    try {
      // console.log('🚀 BpmnCollaborationDemo 초기화 시작...');
      
      // BPMN 모델러 초기화
      // console.log('📋 BPMN 모델러 초기화 중...');
      this.bpmnModelerService.initializeBpmnModeler();
      await this.bpmnModelerService.loadInitialDiagram();
      // console.log('✅ BPMN 모델러 초기화 완료');

      // Y.js 초기화
      // console.log('🔄 Y.js 초기화 중...');
      this.yjsSyncService.initializeYjs();
      // console.log('✅ Y.js 초기화 완료');

      // 이벤트 리스너 설정
      // console.log('👂 이벤트 리스너 설정 중...');
      this.setupBpmnEventListeners();
      console.log('✅ 이벤트 리스너 설정 완료');

      // UI 업데이트
      // console.log('🎨 UI 업데이트 중...');
      this.updateUI();
      this.initializeUserName();
      // console.log('✅ UI 업데이트 완료');

      console.log('✅ BpmnCollaborationDemo 초기화 완료');
      this.addActivityLog('BPMN 협업 시스템이 시작되었습니다.', 'success');
    } catch (error) {
      console.error('❌ 초기화 실패:', error);
      this.addActivityLog('시스템 초기화에 실패했습니다.', 'error');
      throw error;
    }
  }

  /**
   * 이벤트 핸들러 설정
   */
  setupEventHandlers() {
    // Y.js 이벤트 핸들러 (demo-original.js 방식)
    this.yjsSyncService.setEventHandlers({
      applyElementChange: this.applyElementChange.bind(this),
      removeElement: this.removeElement.bind(this),
      applyConnectionChange: this.applyConnectionChange.bind(this),
      removeConnection: this.removeConnection.bind(this),
      onMetadataChange: this.handleMetadataChange.bind(this),
      onDocumentUpdate: this.handleDocumentUpdate.bind(this)
    });

    // WebSocket 이벤트 핸들러
    this.webSocketService.setEventHandlers({
      onConnectionEstablished: this.handleConnectionEstablished.bind(this),
      onUsersListUpdated: this.handleUsersListUpdated.bind(this),
      onUserJoined: this.handleUserJoined.bind(this),
      onUserLeft: this.handleUserLeft.bind(this),
      onDocumentChanged: this.handleDocumentChanged.bind(this),
      onElementChanged: this.handleElementChanged.bind(this)
    });
  }

  /**
   * BPMN 이벤트 리스너 설정
   */
  setupBpmnEventListeners() {
    const eventBus = this.bpmnModelerService.getService('eventBus');

    // 요소 변경 이벤트 (demo-original.js 방식)
    eventBus.on('element.changed', this.handleElementChanged.bind(this));
    eventBus.on('elements.changed', this.handleElementsChanged.bind(this));
    
    // 요소 삭제 이벤트 (commandStack 이벤트만 사용)
    eventBus.on('commandStack.shape.delete.postExecuted', this.handleShapeDeletePost.bind(this));
    eventBus.on('commandStack.connection.delete.postExecuted', this.handleConnectionDeletePost.bind(this));
    
    // 이동 관련 이벤트
    eventBus.on('elements.move', this.handleBpmnElementsMove.bind(this));
    eventBus.on('element.move', this.handleBpmnElementMove.bind(this));
    eventBus.on('shape.moved', this.handleBpmnShapeMoved.bind(this));
    eventBus.on('elements.moved', this.handleBpmnElementsMoved.bind(this));
    
    // 명령 실행 이벤트
    eventBus.on('commandStack.elements.move.preExecute', this.handleMovePreExecute.bind(this));
    eventBus.on('commandStack.elements.move.postExecute', this.handleMovePostExecute.bind(this));
    
    // 드래그 이벤트
    eventBus.on('drag.start', this.handleDragStart.bind(this));
    eventBus.on('drag.move', this.handleDragMove.bind(this));
    eventBus.on('drag.end', this.handleDragEnd.bind(this));
    
    // 명령 스택 모든 이벤트 감지
    eventBus.on('commandStack.changed', this.handleCommandStackChanged.bind(this));
    
    // 편집 이벤트
    eventBus.on('directEditing.activate', this.handleEditingStart.bind(this));
    eventBus.on('directEditing.deactivate', this.handleEditingEnd.bind(this));
    
    // 컨텍스트 패드 이벤트
    eventBus.on('contextPad.open', this.handleContextPadOpen.bind(this));
    eventBus.on('contextPad.close', this.handleContextPadClose.bind(this));
    
    console.log('✅ BPMN 이벤트 리스너 설정 완료');
  }

  /**
   * 서버 연결
   */
  async connectToServer() {
    this.userName = document.getElementById('user-name')?.value.trim() || 'User';
    
    if (!this.userName) {
      throw new Error('사용자 이름을 입력해주세요.');
    }

    try {
      // WebSocket 서비스만 연결 확인 (Y.js 초기화는 joinDocument에서 수행)
      const serverConnected = await this.webSocketService.connectToServer();
      
      if (serverConnected) {
        console.log('✅ 서버 연결 확인 완료');
      } else {
        throw new Error('서버 연결 실패');
      }
      
    } catch (error) {
      console.error('서버 연결 실패:', error);
      throw new Error(`협업 서버 연결에 실패했습니다: ${error.message}`);
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
          this.yjsSyncService.getDocument(),
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
            console.log('Y.js Provider 연결됨');
            resolve();
          } else if (event.status === 'disconnected') {
            this.isConnected = false;
            this.updateConnectionStatus();
            console.log('Y.js Provider 연결 끊김');
          }
        });

        this.yProvider.on('sync', (isSynced) => {
          if (isSynced) {
            console.log('Y.js 문서 동기화 완료');
            this.loadInitialBpmnFromYjs();
          }
        });

        // Provider awareness (사용자 정보)
        this.yProvider.awareness.setLocalStateField('user', {
          name: this.userName,
          clientId: this.clientId,
          document: this.documentId,
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
      const yElements = this.yjsSyncService.getElements();
      const yConnections = this.yjsSyncService.getConnections();
      
      if (yElements.size === 0) {
        // 빈 문서인 경우 초기 다이어그램 생성
        await this.createInitialDiagram();
      } else {
        // 기존 데이터가 있는 경우 로드
        await this.loadExistingDiagram();
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
      const yElements = this.yjsSyncService.getElements();
      const yConnections = this.yjsSyncService.getConnections();
      
      // 기본 BPMN 요소들을 Y.js에 저장
      yElements.set('StartEvent_1', {
        type: 'bpmn:StartEvent',
        businessObject: { name: '시작' },
        position: { x: 179, y: 99 },
        parent: 'Process_1'
      });

      yElements.set('Task_1', {
        type: 'bpmn:Task',
        businessObject: { name: '작업 1' },
        position: { x: 270, y: 77 },
        parent: 'Process_1'
      });

      yElements.set('EndEvent_1', {
        type: 'bpmn:EndEvent',
        businessObject: { name: '종료' },
        position: { x: 432, y: 99 },
        parent: 'Process_1'
      });

      yConnections.set('SequenceFlow_1', {
        type: 'bpmn:SequenceFlow',
        source: 'StartEvent_1',
        target: 'Task_1'
      });

      yConnections.set('SequenceFlow_2', {
        type: 'bpmn:SequenceFlow',
        source: 'Task_1',
        target: 'EndEvent_1'
      });

      console.log('초기 다이어그램이 Y.js에 생성되었습니다.');
    } catch (error) {
      console.error('초기 다이어그램 생성 오류:', error);
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
   * 문서 참가
   */
  async joinDocument(documentId) {
    try {
      if (!documentId) {
        throw new Error('문서 ID를 입력해주세요.');
      }
      
      if (!this.userName) {
        throw new Error('사용자 이름이 설정되지 않았습니다. 먼저 서버에 연결해주세요.');
      }
      
      this.documentId = documentId;
      
      console.log(`Y.js Provider 연결 중... [사용자: ${this.userName}, 문서: ${this.documentId}]`);
      
      // Y.js Provider 초기화
      await this.initializeYjsProvider();
      console.log('✅ Y.js Provider 초기화 완료');

      // WebSocket으로 문서 참가 알림
      const joinResult = this.webSocketService.joinDocument(documentId, this.userName);
      console.log('📡 문서 참가 알림 전송 결과:', joinResult);

      console.log(`✅ 문서 참가 완료: ${documentId}`);
      
    } catch (error) {
      console.error('❌ 문서 참가 실패:', error);
      throw error;
    }
  }

  /**
   * 문서 연결 해제
   */
  async leaveDocument() {
    try {
      if (!this.documentId) {
        console.log('📄 연결된 문서가 없습니다.');
        return;
      }

      console.log(`📄 문서 연결 해제 시도: ${this.documentId}`);

      // WebSocket으로 문서 나가기 알림
      if (this.webSocketService) {
        this.webSocketService.leaveDocument(this.documentId, this.userName);
        console.log('📡 문서 나가기 알림 전송 완료');
      }

      // Y.js Provider 정리
      if (this.yProvider) {
        this.yProvider.destroy();
        this.yProvider = null;
        console.log('✅ Y.js Provider 정리 완료');
      }

      // 다이어그램 초기화
      if (this.bpmnModelerService) {
        await this.bpmnModelerService.clearDiagram();
        console.log('✅ 다이어그램 초기화 완료');
      }

      this.documentId = null;
      console.log(`✅ 문서 연결 해제 완료`);
      
    } catch (error) {
      console.error('❌ 문서 연결 해제 실패:', error);
      throw error;
    }
  }

  /**
   * Y.js 요소 변경 BPMN.js에 적용 (demo-original.js 방식)
   */
  applyElementChange(elementId, elementData) {
    try {
      // 라벨은 원격 업데이트하지 않음
      if (elementId.includes('_label')) {
        return;
      }
      
      console.log(`🔵 원격 요소 변경 적용: ${elementId} (타입: ${elementData.type})`);
      
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      
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
      
    } catch (error) {
      console.error('요소 변경 적용 오류:', error);
    }
  }

  /**
   * Y.js 연결 변경 BPMN.js에 적용 (demo-original.js 방식)
   */
  applyConnectionChange(connectionId, connectionData) {
    try {
      console.log(`🔴 원격 연결선 변경 적용: ${connectionId}`, {
        source: connectionData.source,
        target: connectionData.target,
        waypointsCount: connectionData.waypoints?.length || 0,
        waypoints: connectionData.waypoints
      });
      
      // source나 target이 없는 연결 데이터는 처리하지 않음 (삭제된 요소 관련)
      if (!connectionData.source || !connectionData.target) {
        console.log(`⏭️ 연결선 처리 스킵 (source/target 부재): ${connectionId} - 무시함`);
        return;
      }
      
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      
      let connection = elementRegistry.get(connectionId);
      
      if (!connection && connectionData.type) {
        // 중복 연결 생성 방지 - 같은 source-target 사이에 연결이 이미 있는지 확인
        const source = elementRegistry.get(connectionData.source);
        const target = elementRegistry.get(connectionData.target);
        
        if (source && target) {
          // 기존 연결 중에 같은 source-target 사이의 연결이 있는지 확인
          const existingConnections = elementRegistry.filter(el => 
            el.type === 'connection' &&
            el.source?.id === connectionData.source &&
            el.target?.id === connectionData.target
          );
          
          if (existingConnections.length > 0) {
            console.log(`⏭️ 같은 방향 연결이 이미 존재함: ${connectionData.source} → ${connectionData.target}, 생성 스킵`);
            return;
          }
        }
        
        // 새 연결 생성
        this.createConnection(connectionId, connectionData);
        console.log(`✅ 연결선 생성 시도 완료: ${connectionId}`);
      } else if (connection) {
        // 기존 연결 업데이트 (원격 변경사항) - waypoint만 업데이트
        if (connectionData.waypoints && connectionData.waypoints.length > 0) {
          console.log(`🔍 기존 연결선 waypoints 확인: ${connectionId}`, {
            currentWaypointsCount: connection.waypoints?.length || 0,
            newWaypointsCount: connectionData.waypoints?.length || 0
          });
          this.updateConnection(connection, connectionData, true);
          console.log(`🔄 연결선 업데이트 완료: ${connectionId}`);
        } else {
          console.log(`⏭️ waypoint 없음, 업데이트 스킵: ${connectionId}`);
        }
      }
      
    } catch (error) {
      console.error('연결 변경 적용 오류:', error);
    }
  }

  /**
   * 요소 제거 처리
   */
  handleElementRemove(elementId) {
    if (this.yjsSyncService.isApplyingRemoteChange) return;

    this.yjsSyncService.setApplyingRemoteChange(true);
    
    try {
      this.elementManager.removeElement(elementId);
    } finally {
      this.yjsSyncService.setApplyingRemoteChange(false);
    }
  }

  /**
   * 연결 제거 처리
   */
  handleConnectionRemove(connectionId) {
    if (this.yjsSyncService.isApplyingRemoteChange) return;

    this.yjsSyncService.setApplyingRemoteChange(true);
    
    try {
      this.elementManager.removeConnection(connectionId);
    } finally {
      this.yjsSyncService.setApplyingRemoteChange(false);
    }
  }

  /**
   * 메타데이터 변경 처리
   */
  handleMetadataChange(event) {
    console.log('메타데이터 변경:', event);
  }

  /**
   * 문서 업데이트 처리
   */
  handleDocumentUpdate(update) {
    this.yjsSyncService.syncCount++;
    this.updateSyncStatus();
  }


  /**
   * 요소 변경 이벤트 처리 (demo-original.js 방식)
   */
  async handleElementChanged(event) {
    if (this.isConnected && !this.isProcessingConnectionEvents) {
      try {
        const element = event.element;
        
        // 연결선 이벤트는 별도 처리 (무한루프 방지)
        if (element.type && element.type.includes('SequenceFlow')) {
          console.log(`🔗 연결선 변경 감지: ${element.id} → waypoints 업데이트만 처리`);
          
          // waypoints만 업데이트
          if (element.waypoints && !this.isProcessingConnectionEvents) {
            console.log(`📍 waypoints 업데이트: ${element.id}`);
            this.syncConnectionWaypointsToYjs(element);
          }
          return;
        }
        
        console.log(`🔧 요소 변경 감지: ${element.id} [타입: ${element.type}, 위치: (${element.x}, ${element.y})]`);
        this.syncElementToYjs(element);
      } catch (error) {
        console.error('요소 변경 처리 오류:', error);
      }
    }
  }

  /**
   * 여러 요소 변경 이벤트 처리 (demo-original.js 방식)
   */
  async handleElementsChanged(event) {
    if (this.isConnected && !this.isProcessingConnectionEvents) {
      try {
        console.log(`🔧 여러 요소 변경 감지: ${event.elements.length}개 요소`);
        event.elements.forEach(element => {
          console.log(`  - ${element.id} [타입: ${element.type}, 위치: (${element.x}, ${element.y})]`);
          
          // 연결선은 별도 처리 (무한루프 방지)
          if (element.type && element.type.includes('SequenceFlow')) {
            if (element.waypoints && !this.isProcessingConnectionEvents) {
              console.log(`📍 waypoints 업데이트: ${element.id}`);
              this.syncConnectionWaypointsToYjs(element);
            }
          } else {
            this.syncElementToYjs(element);
          }
        });
      } catch (error) {
        console.error('요소들 변경 처리 오류:', error);
      }
    }
  }

  /**
   * 연결선 waypoints만 Y.js로 동기화 (무한루프 방지)
   */
  syncConnectionWaypointsToYjs(connection) {
    try {
      const existingData = this.yjsSyncService.yConnections.get(connection.id);
      
      if (!existingData) {
        console.log(`⏭️ 연결선 waypoints 업데이트 스킵 (연결선 데이터 없음): ${connection.id}`);
        return;
      }
      
      const newWaypoints = connection.waypoints ? connection.waypoints.map(wp => ({
        x: wp.x,
        y: wp.y
      })) : [];
      
      // waypoints만 비교
      const existingWaypoints = existingData.waypoints || [];
      let waypointsChanged = false;
      
      if (newWaypoints.length !== existingWaypoints.length) {
        waypointsChanged = true;
      } else {
        for (let i = 0; i < newWaypoints.length; i++) {
          if (Math.abs(newWaypoints[i].x - existingWaypoints[i].x) > 1 || 
              Math.abs(newWaypoints[i].y - existingWaypoints[i].y) > 1) {
            waypointsChanged = true;
            break;
          }
        }
      }
      
      if (waypointsChanged) {
        const updatedData = { ...existingData, waypoints: newWaypoints };
        
        this.yjsSyncService.yjsDoc.transact(() => {
          this.yjsSyncService.yConnections.set(connection.id, updatedData);
        }, this.clientId);
        
        console.log(`📍 연결선 waypoints 동기화 완료: ${connection.id}`);
      }
    } catch (error) {
      console.error('연결선 waypoints 동기화 오류:', error);
    }
  }

  /**
   * BPMN 요소를 Y.js로 동기화 (demo-original.js 방식)
   */
  syncElementToYjs(element) {
    try {
      // 라벨은 동기화하지 않음
      if (element.id.includes('_label')) {
        return;
      }
      
      // 요소 데이터 구성
      const elementData = {
        type: element.type,
        businessObject: element.businessObject ? {
          id: element.id,
          name: element.businessObject.name || '',
          // 연결선인 경우 sourceRef/targetRef 추가
          ...(element.type && element.type.includes('SequenceFlow') ? {
            sourceRef: element.businessObject.sourceRef?.id || element.source?.id,
            targetRef: element.businessObject.targetRef?.id || element.target?.id
          } : {})
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
        // source나 target이 없는 연결선은 동기화하지 않음 (삭제된 요소와 연결된 경우)
        if (!element.source?.id || !element.target?.id) {
          console.log(`⏭️ 연결선 동기화 스킵 (source/target 부재): ${element.id}`);
          return;
        }
        
        const existingData = this.yjsSyncService.yConnections.get(element.id);
        const newData = {
          type: element.type,
          source: element.source.id,
          target: element.target.id,
          businessObject: elementData.businessObject,
          waypoints: element.waypoints ? element.waypoints.map(wp => ({
            x: wp.x,
            y: wp.y
          })) : []
        };
        
        // 중복 동기화 방지를 위한 추가 체크
        const lastSyncedData = this.lastSyncedData?.get(element.id);
        const isDataChanged = !this.isDataEqual(existingData, newData);
        const isNewSync = !this.isDataEqual(lastSyncedData, newData);
        
        if (isDataChanged && isNewSync) {
          // 트랜잭션으로 감싸서 origin 설정
          this.yjsSyncService.yjsDoc.transact(() => {
            this.yjsSyncService.yConnections.set(element.id, newData);
          }, this.clientId);
          this.lastSyncedData?.set(element.id, JSON.parse(JSON.stringify(newData))); // 깊은 복사
          console.log('Y.js 연결 동기화됨:', element.id);
        }
      } else {
        const existingData = this.yjsSyncService.yElements.get(element.id);
        
        // 중복 동기화 방지를 위한 추가 체크
        const lastSyncedData = this.lastSyncedData?.get(element.id);
        const isDataChanged = !this.isDataEqual(existingData, elementData);
        const isNewSync = !this.isDataEqual(lastSyncedData, elementData);
        
        if (isDataChanged && isNewSync) {
          // 트랜잭션으로 감싸서 origin 설정
          this.yjsSyncService.yjsDoc.transact(() => {
            this.yjsSyncService.yElements.set(element.id, elementData);
          }, this.clientId);
          this.lastSyncedData?.set(element.id, JSON.parse(JSON.stringify(elementData))); // 깊은 복사
          console.log('Y.js 요소 동기화됨:', element.id, '위치:', elementData.position);
        }
      }
    } catch (error) {
      console.error('Y.js 동기화 오류:', error);
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
   * BPMN 요소 생성 (demo-original.js 방식)
   */
  createElement(elementId, elementData) {
    try {
      const modeling = this.bpmnModelerService.getService('modeling');
      const elementFactory = this.bpmnModelerService.getService('elementFactory');
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const bpmnFactory = this.bpmnModelerService.getService('bpmnFactory');
      
      // 이미 해당 ID로 요소가 존재하는지 확인
      const existingElement = elementRegistry.get(elementId);
      if (existingElement) {
        console.log(`요소가 이미 존재함: ${elementId}, 생성 스킵`);
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
      
      const businessObject = bpmnFactory.create(elementData.type, {...cleanBusinessObject, id: elementId});
      const newElement = elementFactory.createElement('shape', {type: elementData.type, businessObject: businessObject});
      const shape = modeling.createShape(newElement, position, parent);

      console.log('원격 요소 생성됨:', elementId);
      
    } catch (error) {
      console.error('요소 생성 오류:', error);
    }
  }

  /**
   * BPMN 요소 업데이트 (demo-original.js 방식)
   */
  updateElement(element, elementData) {
    try {
      const modeling = this.bpmnModelerService.getService('modeling');
      
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
   * BPMN 연결 생성 (demo-original.js 방식)
   */
  createConnection(connectionId, connectionData) {
    try {
      // 연결 이벤트 처리 중 플래그 설정 (무한루프 방지)
      this.isProcessingConnectionEvents = true;
      
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      
      // 이미 해당 ID로 연결이 존재하는지 확인
      const existingConnection = elementRegistry.get(connectionId);
      if (existingConnection) {
        console.log(`🔄 연결이 이미 존재함: ${connectionId}, 생성 스킵`);
        return existingConnection;
      }
      
      const source = elementRegistry.get(connectionData.source);
      const target = elementRegistry.get(connectionData.target);
      
      if (!source || !target) {
        console.error(`❌ 연결 대상 요소 부재:`, {
          connectionId,
          sourceId: connectionData.source,
          targetId: connectionData.target,
          sourceFound: !!source,
          targetFound: !!target
        });
        
        // 재시도 로직 (한 번만)
        const retryCount = this.connectionRetryCount.get(connectionId) || 0;
        
        if (retryCount === 0) {
          console.log(`🔄 연결 생성 재시도: ${connectionId} (0.5초 후)`);
          this.connectionRetryCount.set(connectionId, 1);
          
          setTimeout(() => {
            this.createConnection(connectionId, connectionData);
          }, 500);
        } else {
          console.log(`❌ 연결 생성 포기: ${connectionId} (요소 부재)`);
          this.connectionRetryCount.delete(connectionId);
        }
        
        return null;
      }
      
      console.log(`🔗 연결 생성 시작: ${connectionId} [${source.id} → ${target.id}]`);
      
      // 간단한 연결 생성 (BPMN.js가 내부적으로 안전하게 처리)
      const connection = modeling.connect(source, target, {
        type: connectionData.type || 'bpmn:SequenceFlow'
      });
      
      // waypoints가 있으면 별도로 업데이트
      if (connection && connectionData.waypoints && connectionData.waypoints.length > 0) {
        try {
          modeling.updateWaypoints(connection, connectionData.waypoints);
          console.log(`📍 waypoints 업데이트: ${connection.id}`);
        } catch (waypointError) {
          console.warn('waypoint 업데이트 실패:', waypointError);
        }
      }
      
      if (connection) {
        console.log('🎯 연결 성공:', {
          id: connection.id,
          sourceId: connection.source?.id,
          targetId: connection.target?.id,
          hasSourceRef: !!connection.businessObject?.sourceRef,
          hasTargetRef: !!connection.businessObject?.targetRef
        });
        
        // 성공 시 재시도 카운트 정리
        this.connectionRetryCount.delete(connectionId);
      } else {
        console.error('❌ 연결 생성 실패: modeling.createConnection()가 null 반환');
      }
      
      return connection;
    } catch (error) {
      console.error('❌ 연결 생성 오류:', error);
      return null;
    } finally {
      // 플래그 해제
      setTimeout(() => {
        this.isProcessingConnectionEvents = false;
        console.log('🔓 연결 이벤트 처리 플래그 해제됨');
      }, 100);
    }
  }

  /**
   * BPMN 연결 업데이트 (demo-original.js 방식 - 간소화)
   */
  updateConnection(connection, connectionData, isRemote = false) {
    try {
      // 연결 이벤트 처리 중 플래그 설정 (무한루프 방지)
      this.isProcessingConnectionEvents = true;
      
      const modeling = this.bpmnModelerService.getService('modeling');
      
      // waypoint 업데이트
      if (connectionData.waypoints && connectionData.waypoints.length > 0) {
        const currentWaypoints = connection.waypoints || [];
        const newWaypoints = connectionData.waypoints;
        
        console.log(`🔍 waypoint 비교 시작: ${connection.id} [원격: ${isRemote}]`, {
          currentCount: currentWaypoints.length,
          newCount: newWaypoints.length,
          current: currentWaypoints,
          new: newWaypoints
        });
        
        // waypoint 비교 (좌표가 다를 때만 업데이트)
        const waypointsChanged = !this.isDataEqual(currentWaypoints, newWaypoints);
        
        if (waypointsChanged) {
          try {
            modeling.updateWaypoints(connection, newWaypoints);
            console.log(`✅ 연결선 waypoint 업데이트 적용됨: ${connection.id} [원격: ${isRemote}]`);
          } catch (waypointError) {
            console.error('❌ Waypoint 업데이트 실패:', waypointError);
          }
        } else {
          console.log(`➡️ waypoint 동일함, 업데이트 스킵: ${connection.id}`);
        }
      }
      
    } catch (error) {
      console.error('연결 업데이트 오류:', error);
    } finally {
      // 플래그 해제
      setTimeout(() => {
        this.isProcessingConnectionEvents = false;
        console.log('🔓 연결 업데이트 이벤트 처리 플래그 해제됨');
      }, 100);
    }
  }

  /**
   * BPMN 요소 제거 (demo-original.js 방식)
   */
  removeElement(elementId) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      
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
   * BPMN 연결 제거 (demo-original.js 방식)
   */
  removeConnection(connectionId) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      
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
   * 편집 시작 처리
   */
  handleEditingStart(event) {
    this.isEditing = true;
    this.editingElement = event?.element;
    const elementId = event?.element?.id || 'unknown';
    console.log('📝 편집 시작:', elementId);
  }

  /**
   * 편집 종료 처리
   */
  handleEditingEnd(event) {
    this.isEditing = false;
    this.editingElement = null;
    console.log('📝 편집 종료');
  }

  /**
   * 컨텍스트 패드 열기 처리
   */
  handleContextPadOpen(event) {
    const elementId = event?.element?.id || 'unknown';
    console.log('🎯 컨텍스트 패드 열림:', elementId);
  }

  /**
   * 컨텍스트 패드 닫기 처리
   */
  handleContextPadClose(event) {
    console.log('🎯 컨텍스트 패드 닫힘');
  }

  /**
   * 요소 이동 이벤트 처리
   */
  handleBpmnElementsMove(event) {
    console.log('🚚 요소들 이동 중:', event);
  }

  handleBpmnElementMove(event) {
    console.log('🚚 요소 이동 중:', event);
  }

  handleBpmnShapeMoved(event) {
    console.log('📦 형태 이동됨:', event);
    // 개별 요소 이동은 elements.changed에서 일괄 처리됨
  }

  handleBpmnElementsMoved(event) {
    console.log('📦 요소들 이동됨:', event);
    // 요소들 이동은 elements.changed에서 일괄 처리됨
  }

  handleMovePreExecute(event) {
    // console.log('⏰ 이동 명령 실행 전:', event);
  }

  handleMovePostExecute(event) {
    // console.log('✅ 이동 명령 실행 후:', event);
    // 이동 후 처리는 elements.changed에서 일괄 처리됨
  }

  /**
   * 드래그 이벤트 처리
   */
  handleDragStart(event) {
    // console.log('🖱️ 드래그 시작:', event);
  }

  handleDragMove(event) {
    // console.log('🖱️ 드래그 중:', event);
  }

  handleDragEnd(event) {
    // console.log('🖱️ 드래그 종료:', event);
  }

  /**
   * 명령 스택 변경 처리
   */
  handleCommandStackChanged(event) {
    console.log('📋 명령 스택 변경:', event);
  }

  /**
   * WebSocket 연결 확립 처리
   */
  handleConnectionEstablished(message) {
    console.log('✅ WebSocket 연결 확립:', message);
    this.addActivityLog('실시간 협업 연결이 설정되었습니다.', 'success');
    this.updateUI();
  }

  /**
   * 사용자 목록 업데이트 처리
   */
  handleUsersListUpdated(users) {
    this.updateConnectedUsers(users);
  }

  /**
   * 사용자 참가 처리
   */
  handleUserJoined(user) {
    console.log(`👤 사용자 참가: ${user.name}`);
    this.addActivityLog(`👤 ${user.name}님이 참여했습니다.`, 'user');
    this.updateUI();
  }

  /**
   * 사용자 떠남 처리
   */
  handleUserLeft(userId) {
    console.log(`👤 사용자 떠남: ${userId}`);
    this.addActivityLog(`👤 사용자가 나갔습니다. (ID: ${userId})`, 'user');
    this.updateUI();
  }

  /**
   * 문서 변경 처리
   */
  handleDocumentChanged(message) {
    console.log('📄 문서 변경:', message);
    this.addActivityLog('📄 문서가 변경되었습니다.', 'change');
  }

  /**
   * 요소 변경 처리
   */
  handleElementChanged(message) {
    console.log('🔧 요소 변경:', message);
    if (message.elementType) {
      this.addActivityLog(`🔧 ${message.elementType} 요소가 수정되었습니다.`, 'change');
    } else {
      this.addActivityLog('🔧 다이어그램 요소가 변경되었습니다.', 'change');
    }
  }

  /**
   * 기존 다이어그램 로드
   */
  async loadExistingDiagram() {
    try {
      const elements = this.yjsSyncService.getElements();
      const connections = this.yjsSyncService.getConnections();

      // 요소 먼저 생성
      for (const [elementId, elementData] of elements) {
        this.elementManager.createElement(elementId, elementData);
      }

      // 연결 나중에 생성
      for (const [connectionId, connectionData] of connections) {
        this.elementManager.createConnection(connectionId, connectionData);
      }

      console.log('✅ 기존 다이어그램 로드 완료');
    } catch (error) {
      console.error('❌ 기존 다이어그램 로드 실패:', error);
    }
  }

  /**
   * 연결된 사용자 업데이트
   */
  updateConnectedUsers(users) {
    const usersList = document.getElementById('users-list');
    const userCount = document.getElementById('user-count');
    
    if (usersList) {
      if (users.length === 0) {
        usersList.innerHTML = `
          <div class="loading">
            <div class="spinner"></div>
            협업 연결을 기다리는 중...
          </div>
        `;
      } else {
        usersList.innerHTML = users.map(user => 
          `<div class="user-item">${user.name}</div>`
        ).join('');
      }
    }
    
    if (userCount) {
      userCount.textContent = users.length;
    }
  }

  /**
   * UI 업데이트
   */
  updateUI() {
    // 연결 상태 업데이트
    const statusDot = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-text');
    if (statusDot) {
      statusDot.className = this.isConnected ? 'status-dot connected' : 'status-dot';
    }
    if (statusText) {
      statusText.textContent = this.isConnected ? '연결됨' : '연결 안됨';
    }

    // 문서 ID 업데이트
    const documentElement = document.getElementById('document-name');
    if (documentElement) {
      documentElement.textContent = this.documentId || '-';
    }

    // 클라이언트 ID 업데이트
    const clientElement = document.getElementById('client-id');
    if (clientElement) {
      clientElement.textContent = this.clientId || '-';
    }

    // 동기화 상태 업데이트
    this.updateSyncStatus();
  }

  /**
   * 동기화 상태 업데이트
   */
  updateSyncStatus() {
    const syncElement = document.getElementById('sync-count');
    if (syncElement) {
      syncElement.textContent = `동기화: ${this.yjsSyncService.syncCount}회`;
    }
  }

  /**
   * 사용자 이름 초기화
   */
  initializeUserName() {
    this.userName = `User_${Math.random().toString(36).substr(2, 9)}`;
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
      userNameElement.value = this.userName;  // input 필드이므로 value 사용
    }
  }

  /**
   * 클라이언트 ID 생성
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 연결 오류 처리
   */
  handleConnectionError(error) {
    this.errorCount++;
    console.error(`❌ 연결 오류 ${this.errorCount}/${this.maxErrors}:`, error);

    if (this.autoStopOnError && this.errorCount >= this.maxErrors) {
      console.error('🛑 최대 오류 횟수 초과, 자동 중지');
      this.disconnect();
    }
  }

  /**
   * 연결 상태 업데이트
   */
  updateConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = this.isConnected ? '연결됨' : '연결 안됨';
      statusElement.className = this.isConnected ? 'connected' : 'disconnected';
    }
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
  }

  /**
   * 활동 로그 추가
   */
  addActivityLog(message, type = 'info') {
    const activityLog = document.getElementById('activityLog');
    if (!activityLog) return;

    const timestamp = new Date().toLocaleTimeString();
    const logItem = document.createElement('div');
    logItem.className = `log-item log-${type}`;
    logItem.innerHTML = `<span class="log-time">${timestamp}</span> ${message}`;

    // 새 로그를 맨 위에 추가
    activityLog.insertBefore(logItem, activityLog.firstChild);

    // 최대 50개까지만 유지
    while (activityLog.children.length > 50) {
      activityLog.removeChild(activityLog.lastChild);
    }
  }

  /**
   * 연결 해제
   */
  disconnect() {
    if (this.yProvider) {
      this.yProvider.disconnect();
      this.yProvider = null;
    }
    this.webSocketService.disconnect();
    this.yjsSyncService.destroy();
    this.isConnected = false;
    this.connectedUsers.clear();
    this.updateConnectionStatus();
    this.updateUsersList();
    console.log('🔌 연결 해제됨');
  }


  /**
   * Shape 삭제 명령 완료 후 처리
   */
  handleShapeDeletePost(event) {
    if (!this.isConnected || !event.context?.shape || this.isApplyingRemoteChange) {
      return;
    }

    const elementId = event.context.shape.id;
    
    // 중복 처리 방지 - 더 확실하게
    if (this.processingDeletion.has(elementId)) {
      console.log(`⏭️ 이미 삭제 처리 중: ${elementId}`);
      return;
    }
    
    console.log(`🗑️ Shape 삭제 명령 완료: ${elementId}`);
    this.processingDeletion.add(elementId);
    
    // 즉시 Y.js에 삭제 알림 (setTimeout 없이)
    try {
      this.yjsSyncService.yjsDoc.transact(() => {
        this.yjsSyncService.yElements.delete(elementId);
      }, this.clientId);
      console.log(`📤 Y.js 요소 삭제 완료: ${elementId}`);
    } catch (error) {
      console.error('Y.js 요소 삭제 오류:', error);
    }
    
    // 1초 후 삭제 플래그 해제
    setTimeout(() => {
      this.processingDeletion.delete(elementId);
    }, 1000);
  }

  /**
   * Connection 삭제 명령 완료 후 처리
   */
  handleConnectionDeletePost(event) {
    if (!this.isConnected || !event.context?.connection || this.isApplyingRemoteChange) {
      return;
    }

    const connectionId = event.context.connection.id;
    
    // 중복 처리 방지 - 더 확실하게
    if (this.processingDeletion.has(connectionId)) {
      console.log(`⏭️ 이미 삭제 처리 중: ${connectionId}`);
      return;
    }
    
    console.log(`🗑️ Connection 삭제 명령 완료: ${connectionId}`);
    this.processingDeletion.add(connectionId);
    
    // 즉시 Y.js에 삭제 알림 (setTimeout 없이)
    try {
      this.yjsSyncService.yjsDoc.transact(() => {
        this.yjsSyncService.yConnections.delete(connectionId);
      }, this.clientId);
      console.log(`📤 Y.js 연결 삭제 완료: ${connectionId}`);
    } catch (error) {
      console.error('Y.js 연결 삭제 오류:', error);
    }
    
    // 1초 후 삭제 플래그 해제
    setTimeout(() => {
      this.processingDeletion.delete(connectionId);
    }, 1000);
  }



  /**
   * 원격 요소 제거 처리 (Y.js에서 호출)
   */
  removeElement(elementId) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      
      const element = elementRegistry.get(elementId);
      if (element) {
        console.log(`🗑️ 원격 요소 제거: ${elementId}`);
        
        // 원격 변경 플래그 설정 (재귀 이벤트 방지)
        this.isApplyingRemoteChange = true;
        
        modeling.removeElements([element]);
        console.log('✅ 요소 제거됨:', elementId);
        
        // 플래그 해제 (다음 tick에서)
        setTimeout(() => {
          this.isApplyingRemoteChange = false;
        }, 0);
      }
    } catch (error) {
      console.error('요소 제거 오류:', error);
      this.isApplyingRemoteChange = false;
    }
  }

  /**
   * 원격 연결 제거 처리 (Y.js에서 호출)
   */
  removeConnection(connectionId) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      
      const connection = elementRegistry.get(connectionId);
      if (connection) {
        console.log(`🗑️ 원격 연결 제거: ${connectionId}`);
        
        // 원격 변경 플래그 설정 (재귀 이벤트 방지)
        this.isApplyingRemoteChange = true;
        
        modeling.removeElements([connection]);
        console.log('✅ 연결 제거됨:', connectionId);
        
        // 플래그 해제 (다음 tick에서)
        setTimeout(() => {
          this.isApplyingRemoteChange = false;
        }, 0);
      }
    } catch (error) {
      console.error('연결 제거 오류:', error);
      this.isApplyingRemoteChange = false;
    }
  }

  /**
   * 서비스 종료
   */
  destroy() {
    this.disconnect();
    this.bpmnModelerService.destroy();
    this.elementManager.cleanup();
    this.eventManager.destroy();
    console.log('🗑️ BpmnCollaborationDemo 종료됨');
  }
}