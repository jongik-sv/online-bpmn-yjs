/**
 * 협업 매니저 - 무한 루프 방지 및 원격 변경사항 적용 시스템
 * 설계문서: silentUpdateArchitecture.md 참조
 */

export class CollaborationManager {
  constructor(modeler) {
    this.modeler = modeler;
    this.eventBus = modeler.get('eventBus');
    this.silentUpdateService = null;
    this.changeTracker = null;
    
    // 무한 루프 방지를 위한 상태 관리
    this.isProcessingRemoteEvent = false;
    this.remoteEventSources = new Set();
    this.eventOriginMap = new Map(); // elementId -> origin 매핑
    
    // 원격 변경사항 적용 시 사용할 플래그
    this.remoteUpdateInProgress = false;
    this.batchUpdateInProgress = false;
    
    // 이벤트 리스너 설정
    this.setupEventListeners();
  }
  
  /**
   * SilentUpdateService와 ChangeTracker 의존성 주입
   */
  setDependencies(silentUpdateService, changeTracker) {
    this.silentUpdateService = silentUpdateService;
    this.changeTracker = changeTracker;
  }
  
  /**
   * 이벤트 리스너 설정 - 로컬 변경사항만 브로드캐스트
   */
  setupEventListeners() {
    // CollaborationManager는 연결선 변경만 담당
    // 다른 요소 변경은 BPMNCollaborationImplementation에서 처리
    
    // 연결선 waypoints 변경 감지
    this.modeler.on('connection.changed', (event) => {
      if (this.shouldIgnoreEvent(event)) {
        return;
      }
      
      this.handleConnectionChanged(event);
    });

    // BPMN.js 내부 이벤트도 감지 (연결선 waypoints 변경)
    this.modeler.on(['commandStack.connection.updateWaypoints.postExecuted'], (event) => {
      if (this.shouldIgnoreEvent(event)) {
        return;
      }
      
      this.handleWaypointsChanged(event);
    });
    
    // 연결선이 이동될 때도 감지 (태스크 이동 시 연결선 자동 업데이트)
    this.modeler.on('commandStack.shape.move.postExecuted', (event) => {
      if (this.shouldIgnoreEvent(event)) {
        return;
      }
      
      // 이동된 요소와 연결된 모든 연결선의 waypoints 업데이트 감지
      this.handleShapeMovedForConnections(event);
    });
  }
  
  /**
   * 이벤트를 무시해야 하는지 판단
   */
  shouldIgnoreEvent(event) {
    // 원격 이벤트 처리 중인 경우
    if (this.isProcessingRemoteEvent) {
      return true;
    }
    
    // 배치 업데이트 진행 중인 경우
    if (this.batchUpdateInProgress) {
      return true;
    }
    
    // 원격 변경사항으로 인한 이벤트인 경우
    if (event.element && this.remoteEventSources.has(event.element.id)) {
      this.remoteEventSources.delete(event.element.id);
      return true;
    }
    
    // SilentUpdate에 의한 이벤트인 경우
    if (event.source === 'silentUpdate' || event.source === 'collaboration') {
      return true;
    }
    
    return false;
  }
  

  /**
   * 연결선 변경 이벤트 처리
   */
  handleConnectionChanged(event) {
    if (!event.element || !event.element.waypoints) return;
    
    const connection = event.element;
    const waypoints = connection.waypoints.map(wp => ({
      x: Math.round(wp.x),
      y: Math.round(wp.y)
    }));
    
    const operation = {
      type: 'connection.changed',
      elementId: connection.id,
      waypoints: waypoints,
      changes: {
        waypoints: waypoints
      },
      timestamp: Date.now(),
      origin: 'local'
    };
    
    this.broadcastChange(operation);
  }

  /**
   * Waypoints 변경 이벤트 처리 (CommandStack 레벨)
   */
  handleWaypointsChanged(event) {
    if (!event.context || !event.context.connection) return;
    
    const connection = event.context.connection;
    const waypoints = event.context.newWaypoints || connection.waypoints;
    
    const operation = {
      type: 'waypoints.changed',
      elementId: connection.id,
      waypoints: waypoints,
      changes: {
        waypoints: waypoints
      },
      timestamp: Date.now(),
      origin: 'local'
    };
    
    this.broadcastChange(operation);
  }

  /**
   * 요소 이동으로 인한 연결선 변경 처리
   */
  handleShapeMovedForConnections(event) {
    if (!event.context || !event.context.shape) return;

    const movedShape = event.context.shape;
    const elementRegistry = this.modeler.get('elementRegistry');
    
    // 이동된 요소와 연결된 모든 연결선 찾기
    const connections = [
      ...(movedShape.incoming || []),
      ...(movedShape.outgoing || [])
    ];

    // 각 연결선의 waypoints 브로드캐스트
    connections.forEach(connection => {
      if (connection && connection.waypoints) {
        const waypoints = connection.waypoints.map(wp => ({
          x: Math.round(wp.x),
          y: Math.round(wp.y)
        }));

        const operation = {
          type: 'connection.changed',
          elementId: connection.id,
          waypoints: waypoints,
          changes: {
            waypoints: waypoints
          },
          timestamp: Date.now(),
          origin: 'local'
        };

        this.broadcastChange(operation);
      }
    });
  }
  
  /**
   * 원격 변경사항 적용 (무한 루프 방지)
   */
  applyRemoteChanges(changes) {
    if (!Array.isArray(changes)) {
      changes = [changes];
    }
    
    this.isProcessingRemoteEvent = true;
    this.remoteUpdateInProgress = true;
    
    try {
      // 변경사항을 원격 소스로 마킹
      changes.forEach(change => {
        if (change.elementId) {
          this.remoteEventSources.add(change.elementId);
          this.eventOriginMap.set(change.elementId, 'remote');
        }
      });
      
      // SilentUpdateService를 사용하여 변경사항 적용
      if (this.silentUpdateService) {
        this.silentUpdateService.batchUpdate(changes);
      } else {
        // Fallback: 직접 적용
        changes.forEach(change => this.applyChangeDirectly(change));
      }
      
    } finally {
      // 상태 복원
      this.isProcessingRemoteEvent = false;
      this.remoteUpdateInProgress = false;
      
      // 타이머를 사용하여 원격 이벤트 소스 정리
      setTimeout(() => {
        changes.forEach(change => {
          if (change.elementId) {
            this.remoteEventSources.delete(change.elementId);
            this.eventOriginMap.delete(change.elementId);
          }
        });
      }, 100);
    }
  }
  
  /**
   * 변경사항 직접 적용 (SilentUpdateService 없을 때 fallback)
   */
  applyChangeDirectly(change) {
    const elementRegistry = this.modeler.get('elementRegistry');
    const element = elementRegistry.get(change.elementId);
    
    if (!element) {
      console.warn(`Element ${change.elementId} not found for change application`);
      return;
    }
    
    switch (change.type) {
      case 'element.changed':
      case 'element_update':
      case 'property':
        this.applyPropertyChange(element, change);
        break;
        
      case 'position':
      case 'visual':
        this.applyVisualChange(element, change);
        break;
        
      case 'element.added':
        this.applyElementAddition(change);
        break;
        
      case 'element.removed':
        this.applyElementRemoval(change);
        break;

      case 'connection.changed':
      case 'waypoints.changed':
        this.applyConnectionChange(element, change);
        break;
        
      case 'element.added':
        this.applyElementAddition(change);
        break;
        
      case 'element.removed':
        this.applyElementRemoval(change);
        break;
        
      default:
        console.warn(`Unknown change type: ${change.type}`);
    }
  }
  
  /**
   * 속성 변경 적용
   */
  applyPropertyChange(element, change) {
    // element_update 타입의 경우 changes 필드 사용
    const properties = change.properties || change.changes;
    
    if (properties) {
      // BusinessObject 업데이트
      if (properties.businessObject && element.businessObject) {
        this.updateBusinessObjectSafely(element.businessObject, properties.businessObject);
      }
      
      // Visual 속성 업데이트 (위치, 크기 등)
      if (properties.visual) {
        this.updateElementPropertiesSafely(element, properties.visual);
      }
      
      // 직접 속성 업데이트 (이전 방식 호환)
      if (!properties.businessObject && !properties.visual) {
        this.updateBusinessObjectSafely(element.businessObject, properties);
      }
      
      this.updateGraphicsSilently(element);
    }
  }
  
  /**
   * 시각적 변경 적용
   */
  applyVisualChange(element, change) {
    if (change.properties) {
      Object.assign(element, change.properties);
      this.updateGraphicsSilently(element);
    }
    
    if (change.x !== undefined || change.y !== undefined) {
      element.x = change.x !== undefined ? change.x : element.x;
      element.y = change.y !== undefined ? change.y : element.y;
      this.updateGraphicsSilently(element);
    }
  }
  
  /**
   * 요소 추가 적용
   */
  applyElementAddition(change) {
    // 이미 존재하는지 확인
    const elementRegistry = this.modeler.get('elementRegistry');
    if (elementRegistry.get(change.elementId)) {
      return; // 이미 존재함
    }
    
    // DirectModelManipulator나 ElementFactory를 사용하여 요소 생성
    console.log(`Adding remote element: ${change.elementId}`);
    // 실제 구현은 DirectModelManipulator 클래스에서 담당
  }
  
  /**
   * 요소 제거 적용
   */
  applyElementRemoval(change) {
    const elementRegistry = this.modeler.get('elementRegistry');
    const element = elementRegistry.get(change.elementId);
    
    if (element) {
      const canvas = this.modeler.get('canvas');
      canvas._removeElement(element);
      elementRegistry.remove(element);
    }
  }

  /**
   * 연결선 변경 적용
   */
  applyConnectionChange(element, change) {
    if (!element || !element.waypoints) {
      console.warn(`Element ${element?.id || 'unknown'} is not a connection, skipping waypoints update`);
      return; // 연결선이 아니면 무시
    }

    // waypoints를 change.waypoints 또는 change.changes.waypoints에서 가져오기
    let waypoints = change.waypoints;
    if (!waypoints && change.changes && change.changes.waypoints) {
      waypoints = change.changes.waypoints;
    }

    if (waypoints && Array.isArray(waypoints)) {
      try {
        // waypoints 검증
        const validWaypoints = this.validateWaypoints(waypoints);
        if (validWaypoints.length === 0) {
          console.warn(`Invalid waypoints for connection ${element.id}, skipping update`);
          return;
        }

        // 좌표값 정밀도 제한 (소수점 제거)
        const roundedWaypoints = validWaypoints.map(wp => ({
          x: Math.round(wp.x),
          y: Math.round(wp.y)
        }));

        // Silent Update Service를 통해 waypoints 업데이트
        if (this.silentUpdateService && this.silentUpdateService.updateWaypoints) {
          this.silentUpdateService.updateWaypoints(element, roundedWaypoints);
        } else {
          // Fallback: 직접 업데이트
          element.waypoints = roundedWaypoints;
          this.updateGraphicsSilently(element);
        }
        
        console.log(`Connection ${element.id} waypoints updated:`, roundedWaypoints);
      } catch (error) {
        console.error('Failed to apply connection change:', error);
      }
    } else {
      console.warn(`No valid waypoints found in change for connection ${element.id}:`, change);
    }
  }

  /**
   * 요소 추가 적용
   */
  applyElementAddition(change) {
    // 이미 존재하는지 확인
    const elementRegistry = this.modeler.get('elementRegistry');
    if (elementRegistry.get(change.elementId)) {
      console.log(`Element ${change.elementId} already exists, skipping addition`);
      return; // 이미 존재함
    }
    
    // DirectModelManipulator나 ElementFactory를 사용하여 요소 생성
    console.log(`Adding remote element: ${change.elementId}`);
    // 실제 구현은 DirectModelManipulator 클래스에서 담당
    // 현재는 로깅만 수행 (요소 생성은 복잡한 프로세스이므로 별도 구현 필요)
  }
  
  /**
   * 요소 제거 적용
   */
  applyElementRemoval(change) {
    const elementRegistry = this.modeler.get('elementRegistry');
    const element = elementRegistry.get(change.elementId);
    
    if (element) {
      try {
        const canvas = this.modeler.get('canvas');
        
        // Canvas에서 요소 제거
        canvas.removeShape(element);
        console.log(`Removed remote element: ${change.elementId}`);
      } catch (error) {
        console.error(`Failed to remove element ${change.elementId}:`, error);
      }
    } else {
      console.warn(`Element ${change.elementId} not found for removal`);
    }
  }

  /**
   * Waypoints 검증
   * @param {Array} waypoints - 검증할 waypoints
   * @returns {Array} 유효한 waypoints
   */
  validateWaypoints(waypoints) {
    return waypoints.filter(wp => {
      return wp && 
             this.isValidNumber(wp.x) && 
             this.isValidNumber(wp.y);
    });
  }
  
  /**
   * 그래픽스 업데이트 (Silent)
   */
  updateGraphicsSilently(element) {
    const elementRegistry = this.modeler.get('elementRegistry');
    const graphicsFactory = this.modeler.get('graphicsFactory');
    
    const gfx = elementRegistry.getGraphics(element);
    if (gfx && graphicsFactory) {
      try {
        // 좌표값 검증 후 업데이트
        if (this.validateElementCoordinates(element)) {
          graphicsFactory.update('shape', element, gfx);
        } else {
          console.warn(`Invalid coordinates for element ${element.id}, skipping graphics update`);
        }
      } catch (error) {
        console.error(`Failed to update graphics for element ${element.id}:`, error.message);
        // 그래픽스 업데이트 실패 시 복구 시도
        this.recoverElementGraphics(element);
      }
    }
  }

  /**
   * 요소 좌표값 검증
   * @param {Object} element - 검증할 요소
   * @returns {boolean} 유효한 좌표이면 true
   */
  validateElementCoordinates(element) {
    // 필수 좌표값 검증
    if (!this.isValidNumber(element.x) || !this.isValidNumber(element.y)) {
      return false;
    }
    
    // 크기값 검증 (연결선이 아닌 경우)
    if (element.width !== undefined && !this.isValidNumber(element.width)) {
      return false;
    }
    
    if (element.height !== undefined && !this.isValidNumber(element.height)) {
      return false;
    }
    
    return true;
  }

  /**
   * 요소 그래픽스 복구
   * @param {Object} element - 복구할 요소
   */
  recoverElementGraphics(element) {
    try {
      // 기본값으로 복구
      if (!this.isValidNumber(element.x)) element.x = 0;
      if (!this.isValidNumber(element.y)) element.y = 0;
      if (element.width !== undefined && !this.isValidNumber(element.width)) element.width = 100;
      if (element.height !== undefined && !this.isValidNumber(element.height)) element.height = 80;
      
      console.log(`Recovered coordinates for element ${element.id}: x=${element.x}, y=${element.y}`);
    } catch (error) {
      console.error(`Failed to recover element graphics:`, error);
    }
  }
  
  /**
   * 이벤트로부터 Operation 생성
   */
  createOperationFromEvent(event) {
    if (!event.element) return null;
    
    return {
      type: event.type || 'element.changed',
      elementId: event.element.id,
      properties: this.extractElementProperties(event.element),
      context: event.context || {},
      timestamp: Date.now(),
      origin: 'local'
    };
  }
  
  /**
   * 요소 속성 추출
   */
  extractElementProperties(element) {
    const properties = {};
    
    // BusinessObject 속성
    if (element.businessObject) {
      properties.businessObject = {
        name: element.businessObject.name,
        id: element.businessObject.id,
        $type: element.businessObject.$type
      };
      
      // BPMN 특화 속성들 추가
      if (element.businessObject.conditionExpression) {
        properties.businessObject.conditionExpression = element.businessObject.conditionExpression;
      }
    }
    
    // 시각적 속성
    properties.visual = {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height
    };
    
    return properties;
  }
  
  /**
   * 요소 직렬화 (원격 전송용)
   */
  serializeElement(element) {
    return {
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
  }
  
  /**
   * 변경사항 브로드캐스트 (외부 시스템으로 전송)
   */
  broadcastChange(operation) {
    // 실제 웹소켓이나 다른 통신 수단으로 전송
    // 현재는 로깅만 수행
    console.log('Broadcasting change:', operation);
    
    // 이벤트 발생하여 외부 시스템이 구독할 수 있도록 함
    this.eventBus.fire('collaboration.change', {
      operation: operation,
      source: 'CollaborationManager'
    });
  }
  
  /**
   * 배치 업데이트 모드 설정
   */
  setBatchUpdateMode(enabled) {
    this.batchUpdateInProgress = enabled;
  }
  
  /**
   * 원격 이벤트 처리 상태 확인
   */
  isProcessingRemote() {
    return this.isProcessingRemoteEvent;
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
      
      // 좌표값 검증 (NaN, Infinity 방지)
      if ((key === 'x' || key === 'y' || key === 'width' || key === 'height') && !this.isValidNumber(value)) {
        console.warn(`Invalid coordinate value for ${key}: ${value}, skipping`);
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
   * 유효한 숫자인지 검증
   * @param {*} value - 검증할 값
   * @returns {boolean} 유효한 숫자이면 true
   */
  isValidNumber(value) {
    return typeof value === 'number' && 
           !isNaN(value) && 
           isFinite(value) && 
           value !== null && 
           value !== undefined;
  }

  /**
   * 리소스 정리
   */
  destroy() {
    this.remoteEventSources.clear();
    this.eventOriginMap.clear();
    this.silentUpdateService = null;
    this.changeTracker = null;
  }
}

export default CollaborationManager;