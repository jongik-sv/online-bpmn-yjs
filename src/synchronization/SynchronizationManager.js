/**
 * 동기화 매니저 - 모델-캔버스 동기화 및 일관성 검증
 * 
 * 이 클래스는 BPMN 모델과 캔버스 간의 동기화를 관리하고,
 * 일관성을 검증하며 필요시 자동 복구를 수행합니다.
 */
export class SynchronizationManager {
  constructor(modeler) {
    this.modeler = modeler;
    this.canvas = modeler.get('canvas');
    this.elementRegistry = modeler.get('elementRegistry');
    this.graphicsFactory = modeler.get('graphicsFactory');
    this.eventBus = modeler.get('eventBus');
    
    // 동기화 큐 시스템
    this.syncQueue = [];
    this.isProcessingSync = false;
    this.maxQueueSize = 100;
    
    // 일관성 검증 설정
    this.consistencyCheckInterval = 5000; // 5초마다 검증
    this.lastConsistencyCheck = Date.now();
    this.inconsistencyCount = 0;
    this.maxInconsistencies = 10;
    
    // 강제 리렌더링 설정
    this.forceRedrawThreshold = 50; // 큐에 50개 이상 쌓이면 강제 리렌더링
    this.lastRedraw = Date.now();
    this.redrawInterval = 1000; // 최소 1초 간격
    
    this.initializeConsistencyMonitoring();
  }

  /**
   * 일관성 모니터링 시작
   */
  initializeConsistencyMonitoring() {
    setInterval(() => {
      this.performConsistencyCheck();
    }, this.consistencyCheckInterval);
  }

  /**
   * 동기화 큐에 작업 추가
   * @param {Object} operation - 동기화 작업
   */
  queueSync(operation) {
    // 큐 크기 제한
    if (this.syncQueue.length >= this.maxQueueSize) {
      console.warn('Sync queue overflow, dropping oldest operations');
      this.syncQueue.splice(0, this.syncQueue.length - this.maxQueueSize + 1);
    }

    this.syncQueue.push({
      ...operation,
      timestamp: Date.now(),
      id: this.generateOperationId()
    });

    // 큐가 임계치에 도달하면 강제 리렌더링
    if (this.syncQueue.length >= this.forceRedrawThreshold) {
      this.scheduleForceRedraw();
    }

    this.processQueue();
  }

  /**
   * 동기화 큐 처리
   */
  async processQueue() {
    if (this.isProcessingSync) return;
    
    this.isProcessingSync = true;
    const processedOperations = [];

    try {
      while (this.syncQueue.length > 0) {
        const operation = this.syncQueue.shift();
        
        try {
          await this.processOperation(operation);
          processedOperations.push(operation);
        } catch (error) {
          console.error('Failed to process sync operation:', error, operation);
          // 실패한 작업을 다시 큐에 추가 (최대 3회 재시도)
          if ((operation.retryCount || 0) < 3) {
            operation.retryCount = (operation.retryCount || 0) + 1;
            this.syncQueue.unshift(operation);
          }
        }
      }
    } finally {
      this.isProcessingSync = false;
    }

    // 처리된 작업들에 대해 검증 수행
    if (processedOperations.length > 0) {
      this.validateProcessedOperations(processedOperations);
    }
  }

  /**
   * 개별 동기화 작업 처리
   * @param {Object} operation - 처리할 작업
   */
  async processOperation(operation) {
    switch(operation.type) {
      case 'updateElement':
      case 'element_update':
      case 'element.changed':
        return this.updateElementSync(operation.elementId, operation.changes || operation.properties);
      case 'createElement':
      case 'element.added':
        return this.createElementSync(operation.element || {
          id: operation.elementId,
          type: operation.elementType,
          properties: operation.properties,
          parent: operation.parent
        });
      case 'removeElement':
      case 'element.removed':
        return this.removeElementSync(operation.elementId);
      case 'updateConnection':
        return this.updateConnectionSync(operation.connectionId, operation.changes);
      case 'connection.changed':
      case 'waypoints.changed':
        // operation.changes 또는 operation.waypoints에서 데이터 가져오기
        const connectionChanges = operation.changes || { waypoints: operation.waypoints };
        return this.updateConnectionSync(operation.elementId, connectionChanges);
      case 'batchUpdate':
        return this.processBatchUpdate(operation.updates);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * 요소 동기화 업데이트
   * @param {string} elementId - 요소 ID
   * @param {Object} changes - 변경사항
   */
  updateElementSync(elementId, changes) {
    const element = this.elementRegistry.get(elementId);
    if (!element) {
      console.warn(`Element not found for sync update: ${elementId}`);
      return false;
    }

    let updated = false;

    // 1. 모델 업데이트
    if (changes.businessObject) {
      this.updateBusinessObjectSafely(element.businessObject, changes.businessObject);
      updated = true;
    }

    // 2. 다이어그램 속성 업데이트
    if (changes.visual) {
      this.updateElementPropertiesSafely(element, changes.visual);
      updated = true;
    }

    // 3. 위치 업데이트
    if (changes.position) {
      element.x = changes.position.x;
      element.y = changes.position.y;
      updated = true;
    }

    // 4. 크기 업데이트
    if (changes.dimensions) {
      element.width = changes.dimensions.width;
      element.height = changes.dimensions.height;
      updated = true;
    }

    if (updated) {
      // 그래픽스 업데이트
      this.updateGraphics(element);
      
      // 최소한의 이벤트 발생 (필요시)
      if (changes.fireEvent !== false) {
        this.fireMinimalSyncEvent(element, 'updated');
      }
    }

    return updated;
  }

  /**
   * 요소 생성 동기화
   * @param {Object} elementData - 요소 데이터
   */
  createElementSync(elementData) {
    try {
      const element = this.elementRegistry.get(elementData.id);
      if (element) {
        console.warn(`Element already exists: ${elementData.id}`);
        return element;
      }

      console.log(`Creating element in sync: ${elementData.id} (${elementData.type})`);
      
      // ElementFactory와 BpmnFactory를 사용한 요소 생성
      const elementFactory = this.modeler.get('elementFactory');
      const bpmnFactory = this.modeler.get('bpmnFactory');
      
      // 부모 요소 찾기
      let parent = null;
      if (elementData.parent) {
        parent = this.elementRegistry.get(elementData.parent);
      }
      if (!parent) {
        const rootElements = this.elementRegistry.filter(element => 
          element.type === 'bpmn:Process' || !element.parent
        );
        parent = rootElements[0] || this.canvas.getRootElement();
      }

      // 요소 타입 결정
      const elementType = elementData.type || elementData.businessObject?.$type;
      
      if (!elementType) {
        console.error(`Element type is undefined for ${elementData.id}. Element data:`, elementData);
        return null;
      }
      
      // BusinessObject 생성
      const businessObjectProps = {
        id: elementData.id,
        name: elementData.name || elementData.businessObject?.name || ''
      };
      
      // BPMN.js가 요구하는 기본 속성들 설정
      if (elementType.includes('Task')) {
        // Task 타입의 경우 추가 속성
        businessObjectProps.isExecutable = elementData.businessObject?.isExecutable || true;
      }
      
      // 연결선의 경우 소스/타겟 참조 추가
      if (elementType.includes('Flow')) {
        if (elementData.source || elementData.businessObject?.sourceRef) {
          businessObjectProps.sourceRef = elementData.source || elementData.businessObject.sourceRef;
        }
        if (elementData.target || elementData.businessObject?.targetRef) {
          businessObjectProps.targetRef = elementData.target || elementData.businessObject.targetRef;
        }
      }
      
      if (elementData.businessObject) {
        Object.keys(elementData.businessObject).forEach(key => {
          if (key !== '$type' && key !== 'id' && key !== 'name') {
            businessObjectProps[key] = elementData.businessObject[key];
          }
        });
      }
      
      const businessObject = bpmnFactory.create(elementType, businessObjectProps);

      // 연결선 처리
      if (elementData.waypoints || elementType.includes('Flow')) {
        return this.createConnectionSync(elementData, parent, businessObject, elementFactory);
      }

      // 일반 요소 객체를 메모리에 직접 생성
      const newElement = {
        id: elementData.id,
        type: elementType,
        businessObject: businessObject,
        x: elementData.x || 100,
        y: elementData.y || 100,
        width: elementData.width || 100,
        height: elementData.height || 80,
        parent: parent,
        children: [],
        incoming: [],
        outgoing: [],
        labels: [],
        // BPMN.js 렌더러가 필요로 하는 속성들
        waypoints: undefined,
        hidden: false,
        collapsed: false,
        // Diagram Interchange 정보
        di: {
          id: elementData.id + '_di',
          $type: 'bpmndi:BPMNShape',
          bpmnElement: businessObject,
          bounds: {
            x: elementData.x || 100,
            y: elementData.y || 100,
            width: elementData.width || 100,
            height: elementData.height || 80
          }
        }
      };

      // Canvas에 먼저 추가 (그래픽스 생성)
      this.canvas.addShape(newElement, parent);

      // ElementRegistry에 등록은 Canvas가 처리하므로 생략
      
      console.log(`Element created successfully in sync: ${elementData.id}`);
      return newElement;
      
    } catch (error) {
      console.error('Failed to create element in sync:', error);
      return null;
    }
  }

  /**
   * 연결선 생성 동기화
   * @param {Object} elementData - 연결선 데이터
   * @param {Object} parent - 부모 요소
   * @param {Object} businessObject - 비즈니스 객체
   * @param {Object} elementFactory - 요소 팩토리
   * @param {boolean} isRetry - 재시도인지 여부
   */
  createConnectionSync(elementData, parent, businessObject, elementFactory, isRetry = false) {
    try {
      // businessObject에서 소스/타겟 참조 가져오기
      let sourceRef = elementData.source || 
                     elementData.businessObject?.sourceRef || 
                     businessObject?.sourceRef;
      let targetRef = elementData.target || 
                     elementData.businessObject?.targetRef || 
                     businessObject?.targetRef;
      
      // 소스/타겟 요소 찾기
      let source = null;
      let target = null;
      
      if (sourceRef) {
        source = typeof sourceRef === 'string' ? this.elementRegistry.get(sourceRef) : sourceRef;
      }
      if (targetRef) {
        target = typeof targetRef === 'string' ? this.elementRegistry.get(targetRef) : targetRef;
      }
      
      if (!source || !target) {
        console.warn(`Cannot create connection ${elementData.id}: source(${sourceRef}) or target(${targetRef}) not found in sync`);
        
        // 재시도가 아닌 경우에만 한 번 더 시도
        if (!isRetry) {
          setTimeout(() => {
            this.retryConnectionSync(elementData, parent, businessObject, elementFactory);
          }, 150);
        } else {
          console.error(`Failed to create connection after sync retry: ${elementData.id} - giving up`);
        }
        
        return null;
      }
      
      // 연결선 객체를 메모리에 직접 생성
      const waypoints = elementData.waypoints || this.generateSyncWaypoints(source, target);
      const connection = {
        id: elementData.id,
        type: elementData.type,
        businessObject: businessObject,
        source: source,
        target: target,
        waypoints: waypoints,
        parent: parent,
        children: [],
        incoming: [],
        outgoing: [],
        labels: [],
        // BPMN.js 렌더러가 필요로 하는 속성들
        width: undefined,
        height: undefined,
        x: undefined,
        y: undefined,
        hidden: false,
        // Diagram Interchange 정보
        di: {
          id: elementData.id + '_di',
          $type: 'bpmndi:BPMNEdge',
          bpmnElement: businessObject,
          waypoints: waypoints.map(wp => ({ x: wp.x, y: wp.y }))
        }
      };

      // 소스 요소의 outgoing에 연결선 추가
      if (source.outgoing) {
        source.outgoing.push(connection);
      } else {
        source.outgoing = [connection];
      }

      // 타겟 요소의 incoming에 연결선 추가
      if (target.incoming) {
        target.incoming.push(connection);
      } else {
        target.incoming = [connection];
      }

      // Canvas에 먼저 추가 (그래픽스 생성)
      this.canvas.addConnection(connection, parent);

      // ElementRegistry에 등록은 Canvas가 처리하므로 생략
      
      console.log(`Connection created successfully in sync: ${elementData.id} (${source.id} → ${target.id})`);
      return connection;
      
    } catch (error) {
      console.error('Failed to create connection in sync:', error);
      return null;
    }
  }

  /**
   * 연결선 생성 동기화 재시도 (한 번만)
   * @param {Object} elementData - 연결선 데이터
   * @param {Object} parent - 부모 요소
   * @param {Object} businessObject - 비즈니스 객체
   * @param {Object} elementFactory - 요소 팩토리
   */
  retryConnectionSync(elementData, parent, businessObject, elementFactory) {
    try {
      // isRetry = true로 설정하여 무한 재시도 방지
      const result = this.createConnectionSync(elementData, parent, businessObject, elementFactory, true);
      if (!result) {
        console.warn(`Connection sync creation failed definitively: ${elementData.id}`);
      }
    } catch (error) {
      console.error(`Error retrying connection sync: ${elementData.id}`, error);
    }
  }

  /**
   * 동기화용 기본 waypoints 생성
   * @param {Object} source - 소스 요소
   * @param {Object} target - 타겟 요소
   * @returns {Array} waypoints 배열
   */
  generateSyncWaypoints(source, target) {
    return [
      { x: source.x + source.width / 2, y: source.y + source.height / 2 },
      { x: target.x + target.width / 2, y: target.y + target.height / 2 }
    ];
  }

  /**
   * 요소 제거 동기화
   * @param {string} elementId - 제거할 요소 ID
   */
  removeElementSync(elementId) {
    const element = this.elementRegistry.get(elementId);
    if (!element) {
      console.warn(`Element not found for removal: ${elementId}`);
      return false;
    }

    try {
      // Canvas에서 직접 요소 제거
      this.canvas.removeShape(element);
      this.fireMinimalSyncEvent(element, 'removed');
      console.log(`Element synchronized removal: ${elementId}`);
      return true;
    } catch (error) {
      console.error('Failed to remove element in sync:', error);
      // 에러가 발생해도 계속 진행하도록 false 반환
      return false;
    }
  }

  /**
   * 연결 동기화 업데이트
   * @param {string} connectionId - 연결 ID
   * @param {Object} changes - 변경사항
   */
  updateConnectionSync(connectionId, changes) {
    const connection = this.elementRegistry.get(connectionId);
    if (!connection) {
      console.warn(`Connection not found for sync update: ${connectionId}`);
      return false;
    }

    let updated = false;

    // 연결점 업데이트
    if (changes.waypoints && Array.isArray(changes.waypoints)) {
      // waypoints 검증
      const validWaypoints = changes.waypoints.filter(wp => {
        return wp && 
               typeof wp.x === 'number' && 
               typeof wp.y === 'number' && 
               !isNaN(wp.x) && 
               !isNaN(wp.y) && 
               isFinite(wp.x) && 
               isFinite(wp.y);
      });
      
      if (validWaypoints.length > 0) {
        // 좌표값 정밀도 제한
        connection.waypoints = validWaypoints.map(wp => ({
          x: Math.round(wp.x),
          y: Math.round(wp.y)
        }));
        updated = true;
        console.log(`Connection ${connectionId} waypoints synchronized:`, connection.waypoints);
      } else {
        console.warn(`Invalid waypoints for connection ${connectionId}, skipping update`);
      }
    }

    // 소스/타겟 업데이트
    if (changes.source) {
      const sourceElement = this.elementRegistry.get(changes.source);
      if (sourceElement) {
        connection.source = sourceElement;
        updated = true;
      }
    }

    if (changes.target) {
      const targetElement = this.elementRegistry.get(changes.target);
      if (targetElement) {
        connection.target = targetElement;
        updated = true;
      }
    }

    if (updated) {
      this.updateGraphics(connection);
      this.fireMinimalSyncEvent(connection, 'updated');
    }

    return updated;
  }

  /**
   * 배치 업데이트 처리
   * @param {Array} updates - 업데이트 배열
   */
  processBatchUpdate(updates) {
    const results = [];
    
    // 렌더링 일시 중단
    this.suspendRendering();

    try {
      updates.forEach(update => {
        const result = this.processOperation(update);
        results.push(result);
      });
    } finally {
      // 렌더링 재개 및 강제 리렌더링
      this.resumeRendering();
      this.forceRedraw();
    }

    return results;
  }

  /**
   * 그래픽스 업데이트
   * @param {Object} element - 업데이트할 요소
   */
  updateGraphics(element) {
    const gfx = this.elementRegistry.getGraphics(element);
    if (gfx) {
      try {
        if (element.waypoints) {
          // 연결 요소
          this.graphicsFactory.update('connection', element, gfx);
        } else {
          // 모양 요소
          this.graphicsFactory.update('shape', element, gfx);
        }
      } catch (error) {
        console.error('Failed to update graphics:', error);
        // 그래픽스 재생성 시도
        this.recreateGraphics(element);
      }
    }
  }

  /**
   * 그래픽스 재생성
   * @param {Object} element - 재생성할 요소
   */
  recreateGraphics(element) {
    try {
      const oldGfx = this.elementRegistry.getGraphics(element);
      if (oldGfx && oldGfx.parentNode) {
        oldGfx.parentNode.removeChild(oldGfx);
      }

      const newGfx = this.graphicsFactory.create(
        element.waypoints ? 'connection' : 'shape',
        element
      );
      
      this.elementRegistry.updateGraphics(element, newGfx);
    } catch (error) {
      console.error('Failed to recreate graphics:', error);
    }
  }

  /**
   * 최소한의 동기화 이벤트 발생
   * @param {Object} element - 요소
   * @param {string} action - 액션 ('created', 'updated', 'removed')
   */
  fireMinimalSyncEvent(element, action) {
    this.eventBus.fire('element.changed', {
      element: element,
      source: 'synchronization',
      action: action,
      timestamp: Date.now()
    });
  }

  /**
   * 렌더링 일시 중단
   */
  suspendRendering() {
    this.canvas._suspendRendering = true;
  }

  /**
   * 렌더링 재개
   */
  resumeRendering() {
    this.canvas._suspendRendering = false;
  }

  /**
   * 강제 리렌더링
   */
  forceRedraw() {
    const now = Date.now();
    if (now - this.lastRedraw >= this.redrawInterval) {
      this.canvas._redraw();
      this.lastRedraw = now;
    }
  }

  /**
   * 강제 리렌더링 스케줄링
   */
  scheduleForceRedraw() {
    setTimeout(() => {
      this.forceRedraw();
    }, 100);
  }

  /**
   * 일관성 검증 수행
   */
  performConsistencyCheck() {
    const now = Date.now();
    if (now - this.lastConsistencyCheck < this.consistencyCheckInterval) {
      return;
    }

    this.lastConsistencyCheck = now;
    const inconsistencies = this.validateSync();
    
    if (inconsistencies.length > 0) {
      this.inconsistencyCount += inconsistencies.length;
      console.warn('Synchronization inconsistencies found:', inconsistencies);
      
      if (this.inconsistencyCount >= this.maxInconsistencies) {
        console.error('Too many inconsistencies detected, performing full recovery');
        this.performFullRecovery();
        this.inconsistencyCount = 0;
      } else {
        this.fixInconsistencies(inconsistencies);
      }
    } else {
      // 일관성이 유지되면 카운터 리셋
      this.inconsistencyCount = Math.max(0, this.inconsistencyCount - 1);
    }
  }

  /**
   * 전체 동기화 검증
   * @returns {Array} 일관성 문제 목록
   */
  validateSync() {
    const elements = this.elementRegistry.getAll();
    const inconsistencies = [];

    elements.forEach(element => {
      // 그래픽스 존재 여부 확인
      const gfx = this.elementRegistry.getGraphics(element);
      if (!gfx) {
        inconsistencies.push({
          elementId: element.id,
          issue: 'missing_graphics',
          element: element
        });
      } else {
        // 그래픽스가 DOM에 연결되어 있는지 확인
        if (!gfx.parentNode) {
          inconsistencies.push({
            elementId: element.id,
            issue: 'disconnected_graphics',
            element: element,
            graphics: gfx
          });
        }
      }

      // 비즈니스 객체 무결성 확인
      if (!element.businessObject) {
        inconsistencies.push({
          elementId: element.id,
          issue: 'missing_business_object',
          element: element
        });
      } else if (!element.businessObject.id) {
        inconsistencies.push({
          elementId: element.id,
          issue: 'invalid_business_object',
          element: element
        });
      }

      // 부모-자식 관계 확인
      if (element.parent) {
        const parent = this.elementRegistry.get(element.parent.id);
        if (!parent) {
          inconsistencies.push({
            elementId: element.id,
            issue: 'missing_parent',
            element: element,
            parentId: element.parent.id
          });
        }
      }
    });

    return inconsistencies;
  }

  /**
   * 일관성 문제 수정
   * @param {Array} inconsistencies - 문제 목록
   */
  fixInconsistencies(inconsistencies) {
    inconsistencies.forEach(issue => {
      try {
        switch (issue.issue) {
          case 'missing_graphics':
            this.recreateGraphics(issue.element);
            break;
          case 'disconnected_graphics':
            this.reconnectGraphics(issue.element, issue.graphics);
            break;
          case 'missing_business_object':
            this.recreateBusinessObject(issue.element);
            break;
          case 'missing_parent':
            this.fixParentRelationship(issue.element, issue.parentId);
            break;
        }
      } catch (error) {
        console.error('Failed to fix inconsistency:', error, issue);
      }
    });
  }

  /**
   * 그래픽스 재연결
   * @param {Object} element - 요소
   * @param {Object} graphics - 그래픽스
   */
  reconnectGraphics(element, graphics) {
    const layer = this.canvas.getLayer();
    if (layer && !graphics.parentNode) {
      layer.appendChild(graphics);
    }
  }

  /**
   * 비즈니스 객체 재생성
   * @param {Object} element - 요소
   */
  recreateBusinessObject(element) {
    const bpmnFactory = this.modeler.get('bpmnFactory');
    if (bpmnFactory && element.type) {
      element.businessObject = bpmnFactory.create(element.type, {
        id: element.id
      });
    }
  }

  /**
   * 부모 관계 수정
   * @param {Object} element - 요소
   * @param {string} parentId - 부모 ID
   */
  fixParentRelationship(element, parentId) {
    const parent = this.elementRegistry.get(parentId);
    if (parent) {
      element.parent = parent;
      if (!parent.children) {
        parent.children = [];
      }
      if (!parent.children.includes(element)) {
        parent.children.push(element);
      }
    }
  }

  /**
   * 전체 복구 수행
   */
  performFullRecovery() {
    console.log('Performing full synchronization recovery...');
    
    // 1. 모든 그래픽스 재생성
    const elements = this.elementRegistry.getAll();
    elements.forEach(element => {
      try {
        this.recreateGraphics(element);
      } catch (error) {
        console.error('Failed to recreate graphics during full recovery:', error);
      }
    });

    // 2. 강제 리렌더링
    this.forceRedraw();

    // 3. 전체 검증 재수행
    setTimeout(() => {
      this.performConsistencyCheck();
    }, 1000);
  }

  /**
   * 처리된 작업들 검증
   * @param {Array} operations - 처리된 작업들
   */
  validateProcessedOperations(operations) {
    operations.forEach(operation => {
      if (operation.elementId) {
        const element = this.elementRegistry.get(operation.elementId);
        if (!element) {
          console.warn('Operation processed but element not found:', operation);
        }
      }
    });
  }

  /**
   * 작업 ID 생성
   * @returns {string} 고유 작업 ID
   */
  generateOperationId() {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 동기화 상태 정보 반환
   * @returns {Object} 상태 정보
   */
  getStatus() {
    return {
      queueSize: this.syncQueue.length,
      isProcessing: this.isProcessingSync,
      inconsistencyCount: this.inconsistencyCount,
      lastConsistencyCheck: this.lastConsistencyCheck,
      lastRedraw: this.lastRedraw
    };
  }

  /**
   * BusinessObject 안전 업데이트 (읽기 전용 속성 제외)
   * @param {Object} target - 대상 BusinessObject
   * @param {Object} source - 소스 데이터
   */
  updateBusinessObjectSafely(target, source) {
    // 읽기 전용 속성들 (setter가 없는 속성들)
    const readOnlyProps = ['$type', '$parent', '$model', '$descriptor'];
    
    for (const [key, value] of Object.entries(source)) {
      // 읽기 전용 속성은 건너뛰기
      if (readOnlyProps.includes(key)) {
        continue;
      }
      
      try {
        // 속성 descriptor 확인
        const descriptor = Object.getOwnPropertyDescriptor(target, key) || 
                         Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), key);
        
        // setter가 있는지 확인
        if (descriptor && descriptor.set === undefined && descriptor.writable === false) {
          console.warn(`Skipping read-only property: ${key}`);
          continue;
        }
        
        // 안전하게 할당
        target[key] = value;
      } catch (error) {
        console.warn(`Failed to set property ${key}:`, error.message);
      }
    }
  }

  /**
   * Element 속성 안전 업데이트
   * @param {Object} target - 대상 Element
   * @param {Object} source - 소스 데이터
   */
  updateElementPropertiesSafely(target, source) {
    // Element에서 읽기 전용일 수 있는 속성들
    const readOnlyProps = ['id', 'type', 'businessObject', 'parent', 'children'];
    
    for (const [key, value] of Object.entries(source)) {
      // 읽기 전용 속성은 건너뛰기
      if (readOnlyProps.includes(key)) {
        continue;
      }
      
      try {
        // 안전하게 할당
        target[key] = value;
      } catch (error) {
        console.warn(`Failed to set element property ${key}:`, error.message);
      }
    }
  }

  /**
   * 동기화 매니저 정리
   */
  destroy() {
    this.syncQueue = [];
    this.isProcessingSync = false;
    this.inconsistencyCount = 0;
  }
}

export default SynchronizationManager;