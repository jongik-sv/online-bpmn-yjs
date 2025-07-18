/**
 * Silent Update Service
 * 
 * bpmn-js의 EventBus를 우회하여 원격 변경사항을 로컬 모델에 적용하는 서비스
 * 이벤트 발생 없이 BusinessObject와 시각적 속성을 직접 업데이트
 */
export class SilentUpdateService {
  constructor(modeler) {
    this.modeler = modeler;
    this.canvas = modeler.get('canvas');
    this.elementRegistry = modeler.get('elementRegistry');
    this.graphicsFactory = modeler.get('graphicsFactory');
    this.eventBus = modeler.get('eventBus');
    
    // 렌더링 제어 상태
    this.isRenderingSuspended = false;
  }

  /**
   * BusinessObject 속성을 직접 업데이트 (이벤트 없음)
   * @param {string} elementId - 업데이트할 요소 ID
   * @param {Object} properties - 업데이트할 속성들
   * @returns {Object|null} 업데이트된 요소 또는 null
   */
  updateBusinessObject(elementId, properties) {
    try {
      const element = this.elementRegistry.get(elementId);
      if (!element || !element.businessObject) {
        console.warn(`Element not found: ${elementId}`);
        return null;
      }

      // businessObject 안전 업데이트 (읽기 전용 속성 제외)
      this.updateBusinessObjectSafely(element.businessObject, properties);

      // 그래픽스 업데이트
      this.updateGraphicsSilently(element);

      return element;
    } catch (error) {
      console.error('Error updating business object:', error);
      return null;
    }
  }

  /**
   * 시각적 속성을 직접 업데이트 (이벤트 없음)
   * @param {string} elementId - 업데이트할 요소 ID
   * @param {Object} visualProps - 시각적 속성 (x, y, width, height 등)
   * @returns {Object|null} 업데이트된 요소 또는 null
   */
  updateVisualProperties(elementId, visualProps) {
    try {
      const element = this.elementRegistry.get(elementId);
      if (!element) {
        console.warn(`Element not found: ${elementId}`);
        return null;
      }

      // 시각적 속성 안전 업데이트
      this.updateElementPropertiesSafely(element, visualProps);

      // 그래픽스 강제 업데이트
      this.updateGraphicsSilently(element);

      return element;
    } catch (error) {
      console.error('Error updating visual properties:', error);
      return null;
    }
  }

  /**
   * 그래픽스를 Silent하게 업데이트
   * @param {Object} element - 업데이트할 요소
   */
  updateGraphicsSilently(element) {
    try {
      const gfx = this.elementRegistry.getGraphics(element);
      if (gfx) {
        // 그래픽스 팩토리를 사용한 직접 업데이트
        const elementType = element.waypoints ? 'connection' : 'shape';
        this.graphicsFactory.update(elementType, element, gfx);
      }
    } catch (error) {
      console.error('Error updating graphics silently:', error);
    }
  }

  /**
   * 여러 업데이트를 배치로 처리
   * @param {Array} updates - 업데이트 배열
   */
  batchUpdate(updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
      return;
    }

    // 렌더링 일시 중단
    this.suspendRendering();

    try {
      // 요소 추가를 타입별로 분류하여 순서대로 처리 (연결선은 마지막에)
      const shapeAdditions = [];
      const connectionAdditions = [];
      const otherUpdates = [];

      updates.forEach(update => {
        if (update.type === 'element.added') {
          const elementType = update.element?.type || update.element?.businessObject?.$type || '';
          if (elementType.includes('Flow') || update.element?.waypoints) {
            connectionAdditions.push(update);
          } else {
            shapeAdditions.push(update);
          }
        } else {
          otherUpdates.push(update);
        }
      });

      // 1. 일반 요소(Shape) 먼저 처리
      shapeAdditions.forEach(update => {
        this.handleElementAddition(update);
      });

      // 2. 기타 업데이트 처리
      otherUpdates.forEach(update => {
        switch (update.type) {
          case 'business':
            this.updateBusinessObject(update.elementId, update.properties);
            break;
          case 'visual':
            this.updateVisualProperties(update.elementId, update.properties);
            break;
          case 'element_update':
          case 'element.changed':
            // 복합 업데이트 처리 (business + visual)
            this.handleElementUpdate(update);
            break;
          case 'connection.changed':
          case 'waypoints.changed':
            // 연결선 업데이트 처리
            this.handleConnectionUpdate(update);
            break;
          case 'element.removed':
            // 요소 제거 처리
            this.handleElementRemoval(update);
            break;
          case 'marker':
            this.canvas.addMarker(update.elementId, update.marker);
            break;
          case 'removeMarker':
            this.canvas.removeMarker(update.elementId, update.marker);
            break;
          default:
            console.warn('Unknown update type:', update.type);
        }
      });

      // 3. 연결선(Connection) 마지막에 처리
      connectionAdditions.forEach(update => {
        this.handleElementAddition(update);
      });

    } finally {
      // 렌더링 재개
      this.resumeRendering();
    }
  }

  /**
   * 요소 업데이트 처리 (business + visual)
   * @param {Object} update - 업데이트 정보
   */
  handleElementUpdate(update) {
    if (!update.elementId) return;

    const changes = update.changes || update.properties || {};
    
    // BusinessObject 업데이트
    if (changes.businessObject) {
      this.updateBusinessObject(update.elementId, changes.businessObject);
    }
    
    // Visual 속성 업데이트
    if (changes.visual) {
      this.updateVisualProperties(update.elementId, changes.visual);
    }
    
    // 직접 속성이 있는 경우 (이전 방식 호환)
    if (!changes.businessObject && !changes.visual && Object.keys(changes).length > 0) {
      this.updateBusinessObject(update.elementId, changes);
    }
  }

  /**
   * 연결선 업데이트 처리
   * @param {Object} update - 업데이트 정보
   */
  handleConnectionUpdate(update) {
    if (!update.elementId) return;

    const element = this.elementRegistry.get(update.elementId);
    if (!element || !element.waypoints) return;

    // waypoints 업데이트
    const waypoints = update.waypoints || (update.changes && update.changes.waypoints);
    if (waypoints && Array.isArray(waypoints)) {
      this.updateWaypoints(element, waypoints);
    }
  }

  /**
   * Waypoints 업데이트
   * @param {Object} element - 연결선 요소
   * @param {Array} waypoints - 새로운 waypoints
   */
  updateWaypoints(element, waypoints) {
    try {
      // waypoints 검증 및 정밀도 제한
      const validWaypoints = waypoints.filter(wp => {
        return wp && 
               typeof wp.x === 'number' && 
               typeof wp.y === 'number' && 
               !isNaN(wp.x) && 
               !isNaN(wp.y) && 
               isFinite(wp.x) && 
               isFinite(wp.y);
      }).map(wp => ({
        x: Math.round(wp.x),
        y: Math.round(wp.y)
      }));

      if (validWaypoints.length > 0) {
        element.waypoints = validWaypoints;
        this.updateGraphicsSilently(element);
      }
    } catch (error) {
      console.error('Failed to update waypoints:', error);
    }
  }

  /**
   * 요소 추가 처리
   * @param {Object} update - 업데이트 정보
   */
  handleElementAddition(update) {
    if (!update.elementId || !update.element) return;

    try {
      // 이미 존재하는지 확인
      const existingElement = this.elementRegistry.get(update.elementId);
      if (existingElement) {
        console.log(`Element already exists: ${update.elementId}`);
        return;
      }

      console.log(`Creating element: ${update.elementId} (${update.element.type})`);
      
      // BPMN 요소 생성
      this.createElement(update.element, update.parent);
      
    } catch (error) {
      console.error(`Failed to create element ${update.elementId}:`, error);
    }
  }

  /**
   * 요소 제거 처리
   * @param {Object} update - 업데이트 정보
   */
  handleElementRemoval(update) {
    if (!update.elementId) return;

    try {
      const element = this.elementRegistry.get(update.elementId);
      if (element) {
        // Canvas에서 요소 직접 제거
        this.canvas.removeShape(element);
        console.log(`Element removed: ${update.elementId}`);
      } else {
        console.warn(`Element not found for removal: ${update.elementId}`);
      }
    } catch (error) {
      console.error(`Failed to remove element ${update.elementId}:`, error);
    }
  }

  /**
   * 요소 생성
   * @param {Object} elementData - 요소 데이터
   * @param {string} parentId - 부모 요소 ID
   */
  createElement(elementData, parentId) {
    try {
      const elementFactory = this.modeler.get('elementFactory');
      const bpmnFactory = this.modeler.get('bpmnFactory');
      
      // 부모 요소 찾기 (기본값: 루트 요소)
      let parent = null;
      if (parentId) {
        parent = this.elementRegistry.get(parentId);
      }
      if (!parent) {
        // 루트 요소(Process) 찾기
        const rootElements = this.elementRegistry.filter(element => 
          element.type === 'bpmn:Process' || !element.parent
        );
        parent = rootElements[0] || this.canvas.getRootElement();
      }

      // 요소 타입 결정
      const elementType = elementData.businessObject?.$type || elementData.type;
      
      // BusinessObject 생성
      const businessObjectProps = {
        id: elementData.id,
        name: elementData.businessObject?.name || ''
      };
      
      // BPMN.js가 요구하는 기본 속성들 설정
      if (elementType.includes('Task')) {
        // Task 타입의 경우 추가 속성
        businessObjectProps.isExecutable = elementData.businessObject?.isExecutable || true;
      }
      
      // 타입별 추가 속성 설정
      if (elementData.businessObject) {
        Object.keys(elementData.businessObject).forEach(key => {
          if (key !== '$type' && key !== 'id' && key !== 'name') {
            businessObjectProps[key] = elementData.businessObject[key];
          }
        });
      }
      
      const businessObject = bpmnFactory.create(elementType, businessObjectProps);

      // 연결선인 경우 특별 처리
      if (elementData.waypoints || elementType.includes('SequenceFlow') || elementType.includes('MessageFlow')) {
        return this.createConnection(elementData, parent, businessObject, elementFactory);
      }

      // 기본 크기 설정 (요소 타입별)
      const defaultSizes = this.getDefaultElementSize(elementType);
      
      // 요소 객체를 메모리에 직접 생성
      const element = {
        id: elementData.id,
        type: elementType,
        businessObject: businessObject,
        x: elementData.x || 100,
        y: elementData.y || 100,
        width: elementData.width || defaultSizes.width,
        height: elementData.height || defaultSizes.height,
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
            width: elementData.width || defaultSizes.width,
            height: elementData.height || defaultSizes.height
          }
        }
      };

      // Canvas에 먼저 추가 (그래픽스 생성)
      this.canvas.addShape(element, parent);

      // ElementRegistry에 등록은 Canvas가 처리하므로 생략
      
      console.log(`Element created successfully: ${elementData.id} (${elementType})`);
      return element;

    } catch (error) {
      console.error('Failed to create element:', error);
      throw error;
    }
  }

  /**
   * 연결선 생성
   * @param {Object} elementData - 연결선 데이터
   * @param {Object} parent - 부모 요소
   * @param {Object} businessObject - 비즈니스 객체
   * @param {Object} elementFactory - 요소 팩토리
   * @param {boolean} isRetry - 재시도인지 여부
   */
  createConnection(elementData, parent, businessObject, elementFactory, isRetry = false) {
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
      // 디버깅 정보 출력
      const allElements = this.elementRegistry.getAll().map(el => el.id);
      console.warn(`Cannot create connection ${elementData.id}: source(${sourceRef}) or target(${targetRef}) not found`);
      console.warn(`Available elements:`, allElements);
      console.warn(`Element data:`, elementData);
      
      // 재시도가 아닌 경우에만 한 번 더 시도
      if (!isRetry) {
        setTimeout(() => {
          this.retryConnectionCreation(elementData, parent, businessObject, elementFactory);
        }, 100);
      } else {
        console.error(`Failed to create connection after retry: ${elementData.id} - giving up`);
      }
      
      return null;
    }
    
    // 연결선 객체를 메모리에 직접 생성
    const waypoints = elementData.waypoints || this.generateDefaultWaypoints(source, target);
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
    
    console.log(`Connection created successfully: ${elementData.id} (${source.id} → ${target.id})`);
    return connection;
  }

  /**
   * 연결선 생성 재시도 (한 번만)
   * @param {Object} elementData - 연결선 데이터
   * @param {Object} parent - 부모 요소
   * @param {Object} businessObject - 비즈니스 객체
   * @param {Object} elementFactory - 요소 팩토리
   */
  retryConnectionCreation(elementData, parent, businessObject, elementFactory) {
    try {
      // isRetry = true로 설정하여 무한 재시도 방지
      const result = this.createConnection(elementData, parent, businessObject, elementFactory, true);
      if (!result) {
        console.warn(`Connection creation failed definitively: ${elementData.id}`);
      }
    } catch (error) {
      console.error(`Error retrying connection creation: ${elementData.id}`, error);
    }
  }

  /**
   * 기본 waypoints 생성
   * @param {Object} source - 소스 요소
   * @param {Object} target - 타겟 요소
   * @returns {Array} waypoints 배열
   */
  generateDefaultWaypoints(source, target) {
    return [
      { x: source.x + source.width / 2, y: source.y + source.height / 2 },
      { x: target.x + target.width / 2, y: target.y + target.height / 2 }
    ];
  }

  /**
   * 요소 타입별 기본 크기 반환
   * @param {string} elementType - 요소 타입
   * @returns {Object} 기본 크기 {width, height}
   */
  getDefaultElementSize(elementType) {
    const sizeMap = {
      'bpmn:Task': { width: 100, height: 80 },
      'bpmn:UserTask': { width: 100, height: 80 },
      'bpmn:ServiceTask': { width: 100, height: 80 },
      'bpmn:ManualTask': { width: 100, height: 80 },
      'bpmn:BusinessRuleTask': { width: 100, height: 80 },
      'bpmn:ScriptTask': { width: 100, height: 80 },
      'bpmn:SendTask': { width: 100, height: 80 },
      'bpmn:ReceiveTask': { width: 100, height: 80 },
      'bpmn:StartEvent': { width: 36, height: 36 },
      'bpmn:EndEvent': { width: 36, height: 36 },
      'bpmn:IntermediateThrowEvent': { width: 36, height: 36 },
      'bpmn:IntermediateCatchEvent': { width: 36, height: 36 },
      'bpmn:ExclusiveGateway': { width: 50, height: 50 },
      'bpmn:InclusiveGateway': { width: 50, height: 50 },
      'bpmn:ParallelGateway': { width: 50, height: 50 },
      'bpmn:EventBasedGateway': { width: 50, height: 50 },
      'bpmn:SubProcess': { width: 350, height: 200 },
      'bpmn:CallActivity': { width: 100, height: 80 },
      'bpmn:DataObjectReference': { width: 36, height: 50 },
      'bpmn:DataStoreReference': { width: 50, height: 50 },
      'bpmn:Participant': { width: 600, height: 250 },
      'bpmn:Lane': { width: 600, height: 125 },
      'bpmn:TextAnnotation': { width: 100, height: 30 },
      'bpmn:Group': { width: 300, height: 300 }
    };
    
    return sizeMap[elementType] || { width: 100, height: 80 };
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
   * 렌더링 일시 중단
   */
  suspendRendering() {
    if (this.canvas._suspendRendering !== undefined) {
      this.canvas._suspendRendering = true;
      this.isRenderingSuspended = true;
    }
  }

  /**
   * 렌더링 재개 및 강제 리렌더링
   */
  resumeRendering() {
    if (this.isRenderingSuspended) {
      if (this.canvas._suspendRendering !== undefined) {
        this.canvas._suspendRendering = false;
      }
      this.isRenderingSuspended = false;
      
      // 강제 리렌더링
      this.forceRedraw();
    }
  }

  /**
   * 캔버스 강제 리렌더링
   */
  forceRedraw() {
    try {
      if (this.canvas._redraw) {
        this.canvas._redraw();
      } else if (this.canvas.redraw) {
        this.canvas.redraw();
      }
    } catch (error) {
      console.error('Error during force redraw:', error);
    }
  }

  /**
   * 요소 마커 추가 (Silent)
   * @param {string} elementId - 요소 ID
   * @param {string} marker - 마커 클래스
   */
  addMarkerSilently(elementId, marker) {
    try {
      this.canvas.addMarker(elementId, marker);
    } catch (error) {
      console.error('Error adding marker silently:', error);
    }
  }

  /**
   * 요소 마커 제거 (Silent)
   * @param {string} elementId - 요소 ID
   * @param {string} marker - 마커 클래스
   */
  removeMarkerSilently(elementId, marker) {
    try {
      this.canvas.removeMarker(elementId, marker);
    } catch (error) {
      console.error('Error removing marker silently:', error);
    }
  }

  /**
   * 모든 요소의 그래픽스 강제 업데이트
   */
  refreshAllGraphics() {
    this.suspendRendering();
    
    try {
      const elements = this.elementRegistry.getAll();
      elements.forEach(element => {
        this.updateGraphicsSilently(element);
      });
    } finally {
      this.resumeRendering();
    }
  }

  /**
   * 서비스 정리
   */
  destroy() {
    // 렌더링이 중단된 상태라면 재개
    if (this.isRenderingSuspended) {
      this.resumeRendering();
    }
  }
}