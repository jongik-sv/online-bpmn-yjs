/**
 * Silent Modeling Service
 * 
 * bpmn-js의 Modeling 서비스를 확장하여 협업용 Silent 작업을 수행하는 서비스입니다.
 * 일반 Modeling과 동일한 API를 제공하되, 이벤트 발생 없이 동작합니다.
 */
export class SilentModeling {
  constructor(modeler, commandStackManager) {
    this.modeler = modeler;
    this.commandStackManager = commandStackManager;
    
    // bpmn-js 내부 서비스들
    this.modeling = modeler.get('modeling');
    this.elementFactory = modeler.get('elementFactory');
    this.bpmnFactory = modeler.get('bpmnFactory');
    this.canvas = modeler.get('canvas');
    this.elementRegistry = modeler.get('elementRegistry');
    this.graphicsFactory = modeler.get('graphicsFactory');
    
    // Silent 작업을 위한 내부 메소드들 바인딩
    this.bindInternalMethods();
  }

  /**
   * 내부 메소드들을 바인딩하여 직접 접근 가능하게 설정
   */
  bindInternalMethods() {
    // Canvas의 내부 메소드들
    this._addElement = this.canvas._addElement?.bind(this.canvas);
    this._removeElement = this.canvas._removeElement?.bind(this.canvas);
    
    // ElementRegistry의 내부 메소드들
    this._addToRegistry = (element, gfx) => {
      if (this.elementRegistry._elements) {
        this.elementRegistry._elements[element.id] = { element, gfx };
      }
    };
    
    this._removeFromRegistry = (elementId) => {
      if (this.elementRegistry._elements) {
        delete this.elementRegistry._elements[elementId];
      }
    };
  }

  /**
   * 요소를 조용히 생성
   * @param {string} type - 요소 타입 (예: 'bpmn:Task')
   * @param {Object} properties - 요소 속성
   * @param {Object} position - 위치 정보 {x, y}
   * @param {Object} parent - 부모 요소
   * @returns {Object} 생성된 요소
   */
  createElementSilently(type, properties, position, parent) {
    try {
      // Business Object 생성
      const businessObject = this.bpmnFactory.create(type, {
        id: properties.id || this.generateId(type),
        ...properties
      });

      // Shape 생성
      const shape = this.elementFactory.createShape({
        type: type,
        businessObject: businessObject,
        x: position.x || 0,
        y: position.y || 0,
        width: properties.width || this.getDefaultSize(type).width,
        height: properties.height || this.getDefaultSize(type).height
      });

      // Canvas에 조용히 추가
      this.addToCanvasSilently(shape, parent);

      return shape;
    } catch (error) {
      console.error('SilentModeling: Error creating element:', error);
      return null;
    }
  }

  /**
   * 요소를 Canvas에 조용히 추가
   * @param {Object} element - 추가할 요소
   * @param {Object} parent - 부모 요소
   */
  addToCanvasSilently(element, parent) {
    if (!element) return;

    const targetParent = parent || this.canvas.getRootElement();
    
    // Canvas에 직접 추가
    if (this._addElement) {
      this._addElement(element, targetParent);
    }

    // 그래픽스 생성 및 등록
    const gfx = this.graphicsFactory.create('shape', element);
    this._addToRegistry(element, gfx);

    // 부모-자식 관계 설정
    this.setParentChildRelation(element, targetParent);
  }

  /**
   * 요소를 조용히 제거
   * @param {string|Object} elementOrId - 제거할 요소 또는 ID
   */
  removeElementSilently(elementOrId) {
    const element = typeof elementOrId === 'string' 
      ? this.elementRegistry.get(elementOrId)
      : elementOrId;

    if (!element) {
      console.warn('SilentModeling: Element not found for removal');
      return;
    }

    try {
      // 자식 요소들도 함께 제거
      const children = element.children || [];
      children.forEach(child => this.removeElementSilently(child));

      // Canvas에서 직접 제거
      if (this._removeElement) {
        this._removeElement(element);
      }

      // Registry에서 제거
      this._removeFromRegistry(element.id);

      // 부모에서 자식 관계 제거
      this.removeParentChildRelation(element);

    } catch (error) {
      console.error('SilentModeling: Error removing element:', error);
    }
  }

  /**
   * 요소를 조용히 이동
   * @param {string|Object} elementOrId - 이동할 요소 또는 ID
   * @param {Object} position - 새 위치 {x, y}
   */
  moveElementSilently(elementOrId, position) {
    const element = typeof elementOrId === 'string'
      ? this.elementRegistry.get(elementOrId)
      : elementOrId;

    if (!element) {
      console.warn('SilentModeling: Element not found for move');
      return;
    }

    // 위치 직접 업데이트
    element.x = position.x;
    element.y = position.y;

    // 그래픽스 업데이트
    this.updateElementGraphics(element);
  }

  /**
   * 요소 속성을 조용히 업데이트
   * @param {string|Object} elementOrId - 업데이트할 요소 또는 ID
   * @param {Object} properties - 새 속성들
   */
  updateElementPropertiesSilently(elementOrId, properties) {
    const element = typeof elementOrId === 'string'
      ? this.elementRegistry.get(elementOrId)
      : elementOrId;

    if (!element) {
      console.warn('SilentModeling: Element not found for property update');
      return;
    }

    // Business Object 속성 직접 업데이트
    Object.assign(element.businessObject, properties);

    // 그래픽스 업데이트
    this.updateElementGraphics(element);
  }

  /**
   * 연결(Connection)을 조용히 생성
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   * @param {Object} properties - 연결 속성
   * @returns {Object} 생성된 연결
   */
  createConnectionSilently(source, target, properties = {}) {
    try {
      const connectionType = properties.type || 'bpmn:SequenceFlow';
      
      // Business Object 생성
      const businessObject = this.bpmnFactory.create(connectionType, {
        id: properties.id || this.generateId(connectionType),
        ...properties
      });

      // Connection 생성
      const connection = this.elementFactory.createConnection({
        type: connectionType,
        businessObject: businessObject,
        source: source,
        target: target
      });

      // Canvas에 추가
      this.addConnectionToCanvas(connection, source, target);

      return connection;
    } catch (error) {
      console.error('SilentModeling: Error creating connection:', error);
      return null;
    }
  }

  /**
   * Connection을 Canvas에 추가
   * @param {Object} connection - 연결 요소
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   */
  addConnectionToCanvas(connection, source, target) {
    // Canvas에 연결 추가
    if (this._addElement) {
      this._addElement(connection, this.canvas.getRootElement());
    }

    // 그래픽스 생성 및 등록
    const gfx = this.graphicsFactory.create('connection', connection);
    this._addToRegistry(connection, gfx);

    // Source/Target 관계 설정
    this.setConnectionRelations(connection, source, target);
  }

  /**
   * 부모-자식 관계 설정
   * @param {Object} child - 자식 요소
   * @param {Object} parent - 부모 요소
   */
  setParentChildRelation(child, parent) {
    child.parent = parent;
    
    if (!parent.children) parent.children = [];
    if (!parent.children.includes(child)) {
      parent.children.push(child);
    }

    // Business Object 레벨에서도 관계 설정
    if (child.businessObject && parent.businessObject) {
      child.businessObject.$parent = parent.businessObject;
      
      if (!parent.businessObject.flowElements) {
        parent.businessObject.flowElements = [];
      }
      
      if (!parent.businessObject.flowElements.includes(child.businessObject)) {
        parent.businessObject.flowElements.push(child.businessObject);
      }
    }
  }

  /**
   * 부모-자식 관계 제거
   * @param {Object} element - 요소
   */
  removeParentChildRelation(element) {
    const parent = element.parent;
    if (parent && parent.children) {
      const index = parent.children.indexOf(element);
      if (index > -1) {
        parent.children.splice(index, 1);
      }
    }

    // Business Object 레벨에서도 관계 제거
    if (element.businessObject && parent?.businessObject?.flowElements) {
      const boIndex = parent.businessObject.flowElements.indexOf(element.businessObject);
      if (boIndex > -1) {
        parent.businessObject.flowElements.splice(boIndex, 1);
      }
    }
  }

  /**
   * Connection 관계 설정
   * @param {Object} connection - 연결 요소
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   */
  setConnectionRelations(connection, source, target) {
    connection.source = source;
    connection.target = target;

    // Source outgoing 관계
    if (!source.outgoing) source.outgoing = [];
    if (!source.outgoing.includes(connection)) {
      source.outgoing.push(connection);
    }

    // Target incoming 관계
    if (!target.incoming) target.incoming = [];
    if (!target.incoming.includes(connection)) {
      target.incoming.push(connection);
    }
  }

  /**
   * 요소 그래픽스 업데이트
   * @param {Object} element - 업데이트할 요소
   */
  updateElementGraphics(element) {
    try {
      const gfx = this.elementRegistry.getGraphics(element);
      if (gfx && this.graphicsFactory.update) {
        this.graphicsFactory.update('shape', element, gfx);
      }
    } catch (error) {
      console.error('SilentModeling: Error updating graphics:', error);
    }
  }

  /**
   * 요소 타입별 기본 크기 반환
   * @param {string} type - 요소 타입
   * @returns {Object} {width, height}
   */
  getDefaultSize(type) {
    const sizes = {
      'bpmn:Task': { width: 100, height: 80 },
      'bpmn:StartEvent': { width: 36, height: 36 },
      'bpmn:EndEvent': { width: 36, height: 36 },
      'bpmn:Gateway': { width: 50, height: 50 },
      'bpmn:IntermediateEvent': { width: 36, height: 36 }
    };

    return sizes[type] || { width: 100, height: 80 };
  }

  /**
   * 요소 ID 생성
   * @param {string} type - 요소 타입
   * @returns {string} 생성된 ID
   */
  generateId(type) {
    const prefix = type.split(':')[1] || 'Element';
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 서비스 정리 및 리소스 해제
   */
  destroy() {
    this.modeler = null;
    this.commandStackManager = null;
    this.modeling = null;
    this.elementFactory = null;
    this.bpmnFactory = null;
    this.canvas = null;
    this.elementRegistry = null;
    this.graphicsFactory = null;
  }
}

export default SilentModeling;