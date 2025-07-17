/**
 * 고급 BPMN Y.js 바인딩 - Y.Array, Y.Map의 조합 활용
 * 더 세밀한 제어와 성능 최적화를 위한 구현
 */
export class AdvancedBpmnYjsBinding {
  constructor(ydoc, bpmnModeler, awareness, options = {}) {
    this.ydoc = ydoc;
    this.bpmnModeler = bpmnModeler;
    this.awareness = awareness;
    this.options = {
      enableHistory: true,
      enablePresence: true,
      maxHistorySize: 100,
      ...options
    };

    // Y.js 데이터 구조 설정
    this.setupYjsDataStructure();
    
    // 상태 관리
    this.isApplyingRemoteChange = false;
    this.isApplyingLocalChange = false;
    this.destroyed = false;
    this.clientId = this.ydoc.clientID;

    // BPMN 서비스 참조
    this.elementRegistry = this.bpmnModeler.get('elementRegistry');
    this.modeling = this.bpmnModeler.get('modeling');
    this.eventBus = this.bpmnModeler.get('eventBus');

    // 바인딩 초기화
    this.setupYjsObservers();
    this.setupBpmnEventListeners();
    this.setupPresenceSystem();
    this.syncInitialState();
  }

  /**
   * Y.js 데이터 구조 설정
   * 더 체계적인 데이터 구조 사용
   */
  setupYjsDataStructure() {
    // 기본 데이터 구조
    this.yElements = this.ydoc.getMap('elements');
    this.yConnections = this.ydoc.getMap('connections');
    
    // 고급 데이터 구조
    this.yDiagram = this.ydoc.getMap('diagram'); // 다이어그램 메타데이터
    this.yHistory = this.ydoc.getArray('history'); // 변경 히스토리
    this.yPresence = this.ydoc.getMap('presence'); // 사용자 프레즌스
    this.yViewport = this.ydoc.getMap('viewport'); // 뷰포트 상태
    this.ySelection = this.ydoc.getMap('selection'); // 선택 상태

    // 로컬 캐시
    this.localElementCache = new Map();
    this.localConnectionCache = new Map();
  }

  /**
   * Y.js 옵저버 설정
   */
  setupYjsObservers() {
    // 기본 요소/연결 변경
    this.yElements.observe(this.handleYjsElementsChange.bind(this));
    this.yConnections.observe(this.handleYjsConnectionsChange.bind(this));
    
    // 고급 기능
    if (this.options.enableHistory) {
      this.yHistory.observe(this.handleHistoryChange.bind(this));
    }
    
    if (this.options.enablePresence) {
      this.yPresence.observe(this.handlePresenceChange.bind(this));
      this.ySelection.observe(this.handleSelectionChange.bind(this));
    }

    // 깊은 관찰 (중첩된 구조 변경 감지)
    this.yElements.observeDeep(this.handleDeepElementChange.bind(this));
    this.yConnections.observeDeep(this.handleDeepConnectionChange.bind(this));
  }

  /**
   * BPMN 이벤트 리스너 설정
   */
  setupBpmnEventListeners() {
    // 기본 요소 변경
    this.eventBus.on('element.changed', this.handleBpmnElementChange.bind(this));
    this.eventBus.on('elements.changed', this.handleBpmnElementsChange.bind(this));
    
    // 삭제 이벤트
    this.eventBus.on('commandStack.shape.delete.postExecuted', this.handleBpmnElementDelete.bind(this));
    this.eventBus.on('commandStack.connection.delete.postExecuted', this.handleBpmnConnectionDelete.bind(this));
    
    // 선택 이벤트 (프레즌스용)
    this.eventBus.on('selection.changed', this.handleBpmnSelectionChange.bind(this));
    
    // 뷰포트 변경 (스크롤/줌)
    this.eventBus.on('canvas.viewbox.changing', this.handleViewportChange.bind(this));
    this.eventBus.on('canvas.viewbox.changed', this.handleViewportChange.bind(this));

    // 명령 실행 (히스토리용)
    this.eventBus.on('commandStack.changed', this.handleCommandStackChange.bind(this));
  }

  /**
   * 프레즌스 시스템 설정
   */
  setupPresenceSystem() {
    if (!this.options.enablePresence || !this.awareness) return;

    // 로컬 상태 초기화
    this.awareness.setLocalStateField('bpmn', {
      selection: [],
      viewport: null,
      cursor: null,
      timestamp: Date.now()
    });

    // 원격 프레즌스 변경 감지
    this.awareness.on('change', this.handleAwarenessChange.bind(this));
  }

  /**
   * Y.js 요소 변경 처리 (캐싱 포함)
   */
  handleYjsElementsChange(event) {
    if (this.isApplyingLocalChange || this.destroyed) return;
    if (event.transaction.origin === this.clientId) return;

    this.isApplyingRemoteChange = true;
    
    try {
      event.changes.keys.forEach((change, elementId) => {
        if (change.action === 'add' || change.action === 'update') {
          const elementData = this.yElements.get(elementId);
          
          // 캐시 확인으로 중복 처리 방지
          const cachedData = this.localElementCache.get(elementId);
          if (this.isDataEqual(cachedData, elementData)) return;
          
          this.applyElementToBpmn(elementId, elementData);
          this.localElementCache.set(elementId, { ...elementData });
          
        } else if (change.action === 'delete') {
          this.removeElementFromBpmn(elementId);
          this.localElementCache.delete(elementId);
        }
      });
    } finally {
      this.isApplyingRemoteChange = false;
    }
  }

  /**
   * Y.js 연결 변경 처리 (캐싱 포함)
   */
  handleYjsConnectionsChange(event) {
    if (this.isApplyingLocalChange || this.destroyed) return;
    if (event.transaction.origin === this.clientId) return;

    this.isApplyingRemoteChange = true;
    
    try {
      event.changes.keys.forEach((change, connectionId) => {
        if (change.action === 'add' || change.action === 'update') {
          const connectionData = this.yConnections.get(connectionId);
          
          // 캐시 확인으로 중복 처리 방지
          const cachedData = this.localConnectionCache.get(connectionId);
          if (this.isDataEqual(cachedData, connectionData)) return;
          
          this.applyConnectionToBpmn(connectionId, connectionData);
          this.localConnectionCache.set(connectionId, { ...connectionData });
          
        } else if (change.action === 'delete') {
          this.removeConnectionFromBpmn(connectionId);
          this.localConnectionCache.delete(connectionId);
        }
      });
    } finally {
      this.isApplyingRemoteChange = false;
    }
  }

  /**
   * 깊은 요소 변경 처리 (중첩된 속성 변경)
   */
  handleDeepElementChange(events) {
    if (this.isApplyingLocalChange || this.destroyed) return;
    
    // 깊은 변경사항 처리 (예: 요소 내부 속성 변경)
    events.forEach(event => {
      if (event.transaction.origin === this.clientId) return;
      
      // 세부 속성 변경 처리
      console.log('깊은 요소 변경 감지:', event);
    });
  }

  /**
   * 깊은 연결 변경 처리
   */
  handleDeepConnectionChange(events) {
    if (this.isApplyingLocalChange || this.destroyed) return;
    
    events.forEach(event => {
      if (event.transaction.origin === this.clientId) return;
      
      // 연결 세부 속성 변경 처리
      console.log('깊은 연결 변경 감지:', event);
    });
  }

  /**
   * BPMN 요소 변경을 Y.js에 반영 (히스토리 포함)
   */
  handleBpmnElementChange(event) {
    if (this.isApplyingRemoteChange || this.destroyed) return;
    
    const element = event.element;
    if (!element || element.id.includes('_label')) return;

    this.syncElementToYjs(element);
    
    // 히스토리 기록
    if (this.options.enableHistory) {
      this.addToHistory('element.changed', {
        elementId: element.id,
        type: element.type,
        timestamp: Date.now(),
        user: this.clientId
      });
    }
  }

  /**
   * BPMN 다중 요소 변경 처리
   */
  handleBpmnElementsChange(event) {
    if (this.isApplyingRemoteChange || this.destroyed) return;
    
    // 배치 처리로 성능 최적화
    this.ydoc.transact(() => {
      event.elements.forEach(element => {
        if (!element || element.id.includes('_label')) return;
        this.syncElementToYjsInternal(element);
      });
    }, this.clientId);

    // 배치 히스토리 기록
    if (this.options.enableHistory) {
      this.addToHistory('elements.changed', {
        elementIds: event.elements.map(el => el.id),
        count: event.elements.length,
        timestamp: Date.now(),
        user: this.clientId
      });
    }
  }

  /**
   * 요소를 Y.js에 동기화 (내부 메서드)
   */
  syncElementToYjsInternal(element) {
    if (element.type && element.type.includes('SequenceFlow')) {
      // 연결선
      const connectionData = {
        type: element.type,
        source: element.source?.id,
        target: element.target?.id,
        waypoints: element.waypoints?.map(wp => ({ x: wp.x, y: wp.y })) || [],
        businessObject: this.serializeBusinessObject(element.businessObject),
        lastModified: Date.now(),
        modifiedBy: this.clientId
      };
      
      this.yConnections.set(element.id, connectionData);
      this.localConnectionCache.set(element.id, { ...connectionData });
    } else {
      // 일반 요소
      const elementData = {
        type: element.type,
        position: {
          x: element.x || 0,
          y: element.y || 0,
          width: element.width || 100,
          height: element.height || 80
        },
        businessObject: this.serializeBusinessObject(element.businessObject),
        parent: element.parent?.id || 'Process_1',
        lastModified: Date.now(),
        modifiedBy: this.clientId
      };
      
      this.yElements.set(element.id, elementData);
      this.localElementCache.set(element.id, { ...elementData });
    }
  }

  /**
   * 외부에서 호출하는 동기화 메서드
   */
  syncElementToYjs(element) {
    if (this.isApplyingRemoteChange || this.destroyed) return;

    this.isApplyingLocalChange = true;
    
    try {
      this.syncElementToYjsInternal(element);
    } finally {
      this.isApplyingLocalChange = false;
    }
  }

  /**
   * BusinessObject 직렬화 (순환 참조 방지)
   */
  serializeBusinessObject(businessObject) {
    if (!businessObject) return null;
    
    // 안전한 속성만 추출
    const safeProperties = {};
    const allowedProps = ['id', 'name', '$type', 'sourceRef', 'targetRef'];
    
    allowedProps.forEach(prop => {
      if (businessObject[prop] !== undefined) {
        if (prop === 'sourceRef' || prop === 'targetRef') {
          // 참조 객체는 ID만 저장
          safeProperties[prop] = typeof businessObject[prop] === 'object' 
            ? businessObject[prop].id 
            : businessObject[prop];
        } else {
          safeProperties[prop] = businessObject[prop];
        }
      }
    });
    
    return safeProperties;
  }

  /**
   * 선택 변경 처리 (프레즌스)
   */
  handleBpmnSelectionChange(event) {
    if (!this.options.enablePresence || !this.awareness) return;
    
    const selectedIds = event.newSelection.map(el => el.id);
    
    this.awareness.setLocalStateField('bpmn', {
      ...this.awareness.getLocalState().bpmn,
      selection: selectedIds,
      timestamp: Date.now()
    });
  }

  /**
   * 뷰포트 변경 처리
   */
  handleViewportChange(event) {
    if (!this.options.enablePresence || !this.awareness) return;
    
    const viewport = {
      x: event.viewbox.x,
      y: event.viewbox.y,
      width: event.viewbox.width,
      height: event.viewbox.height,
      scale: event.viewbox.scale || 1
    };
    
    this.awareness.setLocalStateField('bpmn', {
      ...this.awareness.getLocalState().bpmn,
      viewport: viewport,
      timestamp: Date.now()
    });
  }

  /**
   * 명령 스택 변경 처리 (히스토리)
   */
  handleCommandStackChange(event) {
    if (!this.options.enableHistory) return;
    
    this.addToHistory('command.executed', {
      command: event.command,
      type: event.command?.constructor?.name || 'unknown',
      timestamp: Date.now(),
      user: this.clientId
    });
  }

  /**
   * 히스토리에 항목 추가
   */
  addToHistory(action, data) {
    const historyItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      data,
      timestamp: Date.now(),
      user: this.clientId
    };

    this.yHistory.push([historyItem]);
    
    // 히스토리 크기 제한
    while (this.yHistory.length > this.options.maxHistorySize) {
      this.yHistory.delete(0);
    }
  }

  /**
   * 히스토리 변경 처리
   */
  handleHistoryChange(event) {
    console.log('히스토리 변경:', event);
    // 히스토리 UI 업데이트 등
  }

  /**
   * 프레즌스 변경 처리
   */
  handlePresenceChange(event) {
    console.log('프레즌스 변경:', event);
    // 다른 사용자의 선택/커서 표시 등
  }

  /**
   * 선택 변경 처리
   */
  handleSelectionChange(event) {
    console.log('원격 선택 변경:', event);
    // 다른 사용자의 선택 표시
  }

  /**
   * Awareness 변경 처리
   */
  handleAwarenessChange(changes) {
    if (!this.options.enablePresence) return;
    
    // 다른 사용자들의 상태 정보 처리
    changes.added.forEach(clientId => {
      const state = this.awareness.getStates().get(clientId);
      if (state && state.bpmn) {
        this.showUserPresence(clientId, state.bpmn);
      }
    });

    changes.updated.forEach(clientId => {
      const state = this.awareness.getStates().get(clientId);
      if (state && state.bpmn) {
        this.updateUserPresence(clientId, state.bpmn);
      }
    });

    changes.removed.forEach(clientId => {
      this.hideUserPresence(clientId);
    });
  }

  /**
   * 사용자 프레즌스 표시
   */
  showUserPresence(clientId, bpmnState) {
    // 다른 사용자의 선택, 커서 등을 화면에 표시
    console.log('사용자 프레즌스 표시:', clientId, bpmnState);
  }

  /**
   * 사용자 프레즌스 업데이트
   */
  updateUserPresence(clientId, bpmnState) {
    // 사용자 상태 업데이트
    console.log('사용자 프레즌스 업데이트:', clientId, bpmnState);
  }

  /**
   * 사용자 프레즌스 숨김
   */
  hideUserPresence(clientId) {
    // 사용자가 나갔을 때 프레즌스 정리
    console.log('사용자 프레즌스 숨김:', clientId);
  }

  /**
   * 나머지 메서드들은 기본 BpmnYjsBinding과 동일...
   */
  
  // 요소/연결 생성/업데이트/삭제 메서드들
  // (기본 구현과 동일하므로 생략)

  /**
   * 데이터 비교 (깊은 비교)
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
   * 초기 상태 동기화
   */
  syncInitialState() {
    try {
      // Y.js에서 BPMN으로 동기화
      this.yElements.forEach((elementData, elementId) => {
        this.applyElementToBpmn(elementId, elementData);
        this.localElementCache.set(elementId, { ...elementData });
      });

      setTimeout(() => {
        this.yConnections.forEach((connectionData, connectionId) => {
          this.applyConnectionToBpmn(connectionId, connectionData);
          this.localConnectionCache.set(connectionId, { ...connectionData });
        });
      }, 100);
    } catch (error) {
      console.error('초기 상태 동기화 실패:', error);
    }
  }

  /**
   * 바인딩 해제
   */
  destroy() {
    this.destroyed = true;
    
    // 캐시 정리
    this.localElementCache.clear();
    this.localConnectionCache.clear();
    
    console.log('AdvancedBpmnYjsBinding 해제됨');
  }
}