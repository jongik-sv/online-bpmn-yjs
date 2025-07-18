/**
 * Direct Model Manipulator
 * 
 * bpmn-js의 내부 API를 직접 조작하여 ElementRegistry, Canvas, GraphicsFactory를
 * 우회하는 저수준 모델 조작 서비스입니다.
 */
export class DirectModelManipulator {
  constructor(modeler) {
    this.modeler = modeler;
    this.elementRegistry = modeler.get('elementRegistry');
    this.elementFactory = modeler.get('elementFactory');
    this.bpmnFactory = modeler.get('bpmnFactory');
    this.canvas = modeler.get('canvas');
    this.graphicsFactory = modeler.get('graphicsFactory');
    
    // 내부 API 접근을 위한 준비
    this.initializeInternalAccess();
  }

  /**
   * 내부 API 접근 초기화
   */
  initializeInternalAccess() {
    // ElementRegistry 내부 요소 저장소 접근
    this.registryElements = this.elementRegistry._elements || {};
    
    // Canvas 내부 메소드 바인딩
    this.canvasAddElement = this.canvas._addElement?.bind(this.canvas);
    this.canvasRemoveElement = this.canvas._removeElement?.bind(this.canvas);
    
    // Root element 캐싱
    this.rootElement = this.canvas.getRootElement();
  }

  /**
   * ElementRegistry에 직접 요소 추가
   * @param {Object} element - 추가할 요소
   * @param {Object} gfx - 그래픽스 객체
   */
  addToRegistry(element, gfx) {
    if (!element || !element.id) {
      console.error('DirectModelManipulator: Invalid element for registry');
      return false;
    }

    try {
      // 내부 요소 저장소에 직접 추가
      this.registryElements[element.id] = {
        element: element,
        gfx: gfx
      };
      
      return true;
    } catch (error) {
      console.error('DirectModelManipulator: Error adding to registry:', error);
      return false;
    }
  }

  /**
   * ElementRegistry에서 직접 요소 제거
   * @param {string} elementId - 제거할 요소 ID
   */
  removeFromRegistry(elementId) {
    try {
      delete this.registryElements[elementId];
      return true;
    } catch (error) {
      console.error('DirectModelManipulator: Error removing from registry:', error);
      return false;
    }
  }

  /**
   * Canvas에 직접 요소 추가
   * @param {Object} element - 추가할 요소
   * @param {Object} parent - 부모 요소 (선택사항)
   * @returns {Object} 생성된 그래픽스 객체
   */
  addToCanvas(element, parent = null) {
    if (!element) {
      console.error('DirectModelManipulator: No element provided for canvas addition');
      return null;
    }

    try {
      const targetParent = parent || this.rootElement;
      
      // Canvas에 직접 추가
      if (this.canvasAddElement) {
        this.canvasAddElement(element, targetParent);
      }

      // 그래픽스 생성
      const elementType = this.getElementType(element);
      const gfx = this.graphicsFactory.create(elementType, element);
      
      // Registry에 등록
      this.addToRegistry(element, gfx);
      
      return gfx;
    } catch (error) {
      console.error('DirectModelManipulator: Error adding to canvas:', error);
      return null;
    }
  }

  /**
   * Canvas에서 직접 요소 제거
   * @param {Object} element - 제거할 요소
   */
  removeFromCanvas(element) {
    if (!element) {
      console.error('DirectModelManipulator: No element provided for canvas removal');
      return false;
    }

    try {
      // Canvas에서 직접 제거
      if (this.canvasRemoveElement) {
        this.canvasRemoveElement(element);
      }

      // Registry에서 제거
      this.removeFromRegistry(element.id);
      
      return true;
    } catch (error) {
      console.error('DirectModelManipulator: Error removing from canvas:', error);
      return false;
    }
  }

  /**
   * BusinessObject 직접 생성
   * @param {string} type - BPMN 요소 타입 (예: 'bpmn:Task')
   * @param {Object} properties - 요소 속성
   * @returns {Object} 생성된 BusinessObject
   */
  createBusinessObject(type, properties = {}) {
    try {
      return this.bpmnFactory.create(type, {
        id: properties.id || this.generateElementId(type),
        ...properties
      });
    } catch (error) {
      console.error('DirectModelManipulator: Error creating business object:', error);
      return null;
    }
  }

  /**
   * 완전한 요소 생성 (BusinessObject + Shape + Canvas 추가)
   * @param {string} type - BPMN 요소 타입
   * @param {Object} properties - 요소 속성
   * @param {Object} position - 위치 정보 {x, y, width?, height?}
   * @param {Object} parent - 부모 요소 (선택사항)
   * @returns {Object} 생성된 요소
   */
  createCompleteElement(type, properties = {}, position = {}, parent = null) {
    try {
      // 1. BusinessObject 생성
      const businessObject = this.createBusinessObject(type, properties);
      if (!businessObject) {
        throw new Error('Failed to create business object');
      }

      // 2. Shape 생성
      const defaultSize = this.getDefaultElementSize(type);
      const shape = this.elementFactory.createShape({
        type: type,
        businessObject: businessObject,
        x: position.x || 0,
        y: position.y || 0,
        width: position.width || defaultSize.width,
        height: position.height || defaultSize.height
      });

      // 3. Canvas에 추가
      const gfx = this.addToCanvas(shape, parent);
      if (!gfx) {
        throw new Error('Failed to add to canvas');
      }

      return shape;
    } catch (error) {
      console.error('DirectModelManipulator: Error creating complete element:', error);
      return null;
    }
  }

  /**
   * Connection 직접 생성
   * @param {string} type - 연결 타입 (예: 'bpmn:SequenceFlow')
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   * @param {Object} properties - 연결 속성
   * @returns {Object} 생성된 연결 요소
   */
  createCompleteConnection(type, source, target, properties = {}) {
    try {
      // 1. BusinessObject 생성
      const businessObject = this.createBusinessObject(type, properties);
      if (!businessObject) {
        throw new Error('Failed to create connection business object');
      }

      // 2. Connection 생성
      const connection = this.elementFactory.createConnection({
        type: type,
        businessObject: businessObject,
        source: source,
        target: target,
        waypoints: this.calculateWaypoints(source, target)
      });

      // 3. Canvas에 추가
      const gfx = this.graphicsFactory.create('connection', connection);
      
      // Canvas에 직접 추가
      if (this.canvasAddElement) {
        this.canvasAddElement(connection, this.rootElement);
      }

      // Registry에 등록
      this.addToRegistry(connection, gfx);

      // 4. Source/Target 관계 설정
      this.setConnectionRelations(connection, source, target);

      return connection;
    } catch (error) {
      console.error('DirectModelManipulator: Error creating complete connection:', error);
      return null;
    }
  }

  /**
   * 요소의 그래픽스 직접 업데이트
   * @param {Object} element - 업데이트할 요소
   */
  updateElementGraphics(element) {
    try {
      const registryEntry = this.registryElements[element.id];
      if (registryEntry && registryEntry.gfx) {
        const elementType = this.getElementType(element);
        this.graphicsFactory.update(elementType, element, registryEntry.gfx);
      }
    } catch (error) {
      console.error('DirectModelManipulator: Error updating graphics:', error);
    }
  }

  /**
   * 요소 간 연결 관계 설정
   * @param {Object} connection - 연결 요소
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   */
  setConnectionRelations(connection, source, target) {
    try {
      // Connection 속성 설정
      connection.source = source;
      connection.target = target;

      // Source outgoing 관계 설정
      if (!source.outgoing) source.outgoing = [];
      if (!source.outgoing.includes(connection)) {
        source.outgoing.push(connection);
      }

      // Target incoming 관계 설정
      if (!target.incoming) target.incoming = [];
      if (!target.incoming.includes(connection)) {
        target.incoming.push(connection);
      }

      // BusinessObject 레벨에서의 관계 설정
      if (source.businessObject && target.businessObject) {
        connection.businessObject.sourceRef = source.businessObject;
        connection.businessObject.targetRef = target.businessObject;
      }
    } catch (error) {
      console.error('DirectModelManipulator: Error setting connection relations:', error);
    }
  }

  /**
   * 연결을 위한 waypoints 계산
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   * @returns {Array} waypoints 배열
   */
  calculateWaypoints(source, target) {
    const sourceCenter = {
      x: source.x + (source.width || 0) / 2,
      y: source.y + (source.height || 0) / 2
    };

    const targetCenter = {
      x: target.x + (target.width || 0) / 2,
      y: target.y + (target.height || 0) / 2
    };

    return [sourceCenter, targetCenter];
  }

  /**
   * 요소 타입에 따른 기본 크기 반환
   * @param {string} type - BPMN 요소 타입
   * @returns {Object} {width, height}
   */
  getDefaultElementSize(type) {
    const sizes = {
      'bpmn:Task': { width: 100, height: 80 },
      'bpmn:UserTask': { width: 100, height: 80 },
      'bpmn:ServiceTask': { width: 100, height: 80 },
      'bpmn:StartEvent': { width: 36, height: 36 },
      'bpmn:EndEvent': { width: 36, height: 36 },
      'bpmn:IntermediateEvent': { width: 36, height: 36 },
      'bpmn:ExclusiveGateway': { width: 50, height: 50 },
      'bpmn:ParallelGateway': { width: 50, height: 50 },
      'bpmn:InclusiveGateway': { width: 50, height: 50 },
      'bpmn:SubProcess': { width: 200, height: 150 }
    };

    return sizes[type] || { width: 100, height: 80 };
  }

  /**
   * 요소 타입 확인 (shape 또는 connection)
   * @param {Object} element - 요소
   * @returns {string} 'shape' 또는 'connection'
   */
  getElementType(element) {
    if (element.waypoints || element.source || element.target) {
      return 'connection';
    }
    return 'shape';
  }

  /**
   * 요소 ID 생성
   * @param {string} type - BPMN 요소 타입
   * @returns {string} 생성된 ID
   */
  generateElementId(type) {
    const prefix = type.includes(':') ? type.split(':')[1] : 'Element';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Registry 상태 검증
   * @returns {Object} 검증 결과
   */
  validateRegistry() {
    const issues = [];
    const stats = {
      totalElements: 0,
      elementsWithGraphics: 0,
      elementsWithoutGraphics: 0
    };

    Object.keys(this.registryElements).forEach(elementId => {
      const entry = this.registryElements[elementId];
      stats.totalElements++;

      if (!entry.gfx) {
        stats.elementsWithoutGraphics++;
        issues.push({
          elementId,
          issue: 'missing_graphics'
        });
      } else {
        stats.elementsWithGraphics++;
      }

      if (!entry.element) {
        issues.push({
          elementId,
          issue: 'missing_element'
        });
      }
    });

    return { stats, issues };
  }

  /**
   * 서비스 정리 및 리소스 해제
   */
  destroy() {
    this.modeler = null;
    this.elementRegistry = null;
    this.elementFactory = null;
    this.bpmnFactory = null;
    this.canvas = null;
    this.graphicsFactory = null;
    this.registryElements = null;
    this.rootElement = null;
  }
}

export default DirectModelManipulator;