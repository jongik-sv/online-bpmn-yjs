/**
 * Direct Model Manipulator
 * 
 * bpmn-js의 내부 API를 직접 사용하여 모델을 조작하는 서비스
 * EventBus나 CommandStack을 우회하여 요소를 생성, 수정, 삭제
 */
export class DirectModelManipulator {
  constructor(modeler) {
    this.modeler = modeler;
    this.elementRegistry = modeler.get('elementRegistry');
    this.elementFactory = modeler.get('elementFactory');
    this.bpmnFactory = modeler.get('bpmnFactory');
    this.canvas = modeler.get('canvas');
    this.graphicsFactory = modeler.get('graphicsFactory');
    this.eventBus = modeler.get('eventBus');
  }

  /**
   * ElementRegistry에 직접 요소 추가
   * @param {Object} element - 추가할 요소
   * @param {Object} gfx - 그래픽스 요소
   */
  addToRegistry(element, gfx) {
    try {
      this.elementRegistry._elements[element.id] = {
        element: element,
        gfx: gfx
      };
    } catch (error) {
      console.error('Error adding to registry:', error);
    }
  }

  /**
   * ElementRegistry에서 직접 요소 제거
   * @param {string} elementId - 제거할 요소 ID
   */
  removeFromRegistry(elementId) {
    try {
      delete this.elementRegistry._elements[elementId];
    } catch (error) {
      console.error('Error removing from registry:', error);
    }
  }

  /**
   * Canvas에 직접 요소 추가
   * @param {Object} element - 추가할 요소
   * @param {Object} parent - 부모 요소
   * @returns {Object} 생성된 그래픽스 요소
   */
  addToCanvas(element, parent) {
    try {
      // 그래픽스 생성
      const elementType = element.waypoints ? 'connection' : 'shape';
      const gfx = this.graphicsFactory.create(elementType, element);
      
      // Canvas에 직접 추가
      this.canvas._addElement(element, parent);
      
      // Registry에 등록
      this.addToRegistry(element, gfx);
      
      return gfx;
    } catch (error) {
      console.error('Error adding to canvas:', error);
      return null;
    }
  }

  /**
   * Canvas에서 직접 요소 제거
   * @param {Object} element - 제거할 요소
   */
  removeFromCanvas(element) {
    try {
      // Canvas에서 제거
      this.canvas._removeElement(element);
      
      // Registry에서 제거
      this.removeFromRegistry(element.id);
    } catch (error) {
      console.error('Error removing from canvas:', error);
    }
  }

  /**
   * BusinessObject 직접 생성
   * @param {string} type - BPMN 요소 타입 (예: 'bpmn:Task')
   * @param {Object} properties - 속성들
   * @returns {Object} 생성된 BusinessObject
   */
  createBusinessObject(type, properties = {}) {
    try {
      return this.bpmnFactory.create(type, properties);
    } catch (error) {
      console.error('Error creating business object:', error);
      return null;
    }
  }

  /**
   * 완전한 요소 생성 (이벤트 없음)
   * @param {string} type - BPMN 요소 타입
   * @param {Object} properties - 요소 속성
   * @param {Object} position - 위치 {x, y}
   * @param {Object} parent - 부모 요소
   * @param {Object} dimensions - 크기 {width, height} (선택사항)
   * @returns {Object} 생성된 요소
   */
  createCompleteElement(type, properties = {}, position = {}, parent = null, dimensions = {}) {
    try {
      // BusinessObject 생성
      const businessObject = this.createBusinessObject(type, {
        id: properties.id || this.generateId(type),
        name: properties.name || '',
        ...properties
      });

      if (!businessObject) {
        throw new Error(`Failed to create business object for type: ${type}`);
      }

      // 기본 크기 설정
      const defaultDimensions = this.getDefaultDimensions(type);
      const finalDimensions = { ...defaultDimensions, ...dimensions };

      // Shape 또는 Connection 생성
      let element;
      if (type.includes('SequenceFlow') || type.includes('MessageFlow')) {
        // Connection 생성
        element = this.elementFactory.createConnection({
          type: type,
          businessObject: businessObject,
          waypoints: position.waypoints || [
            { x: position.x || 0, y: position.y || 0 },
            { x: (position.x || 0) + 100, y: position.y || 0 }
          ]
        });
      } else {
        // Shape 생성
        element = this.elementFactory.createShape({
          type: type,
          businessObject: businessObject,
          x: position.x || 0,
          y: position.y || 0,
          width: finalDimensions.width,
          height: finalDimensions.height
        });
      }

      // 부모 설정
      if (!parent) {
        parent = this.canvas.getRootElement();
      }

      // Canvas에 추가
      this.addToCanvas(element, parent);

      // 부모-자식 관계 설정
      this.setParentChildRelation(parent, element);

      return element;
    } catch (error) {
      console.error('Error creating complete element:', error);
      return null;
    }
  }

  /**
   * 요소 타입에 따른 기본 크기 반환
   * @param {string} type - BPMN 요소 타입
   * @returns {Object} {width, height}
   */
  getDefaultDimensions(type) {
    const dimensions = {
      'bpmn:Task': { width: 100, height: 80 },
      'bpmn:UserTask': { width: 100, height: 80 },
      'bpmn:ServiceTask': { width: 100, height: 80 },
      'bpmn:ScriptTask': { width: 100, height: 80 },
      'bpmn:SendTask': { width: 100, height: 80 },
      'bpmn:ReceiveTask': { width: 100, height: 80 },
      'bpmn:ManualTask': { width: 100, height: 80 },
      'bpmn:BusinessRuleTask': { width: 100, height: 80 },
      'bpmn:StartEvent': { width: 36, height: 36 },
      'bpmn:EndEvent': { width: 36, height: 36 },
      'bpmn:IntermediateThrowEvent': { width: 36, height: 36 },
      'bpmn:IntermediateCatchEvent': { width: 36, height: 36 },
      'bpmn:ExclusiveGateway': { width: 50, height: 50 },
      'bpmn:ParallelGateway': { width: 50, height: 50 },
      'bpmn:InclusiveGateway': { width: 50, height: 50 },
      'bpmn:ComplexGateway': { width: 50, height: 50 },
      'bpmn:EventBasedGateway': { width: 50, height: 50 },
      'bpmn:SubProcess': { width: 350, height: 200 },
      'bpmn:CallActivity': { width: 100, height: 80 },
      'bpmn:DataObjectReference': { width: 36, height: 50 },
      'bpmn:DataStoreReference': { width: 50, height: 50 },
      'bpmn:TextAnnotation': { width: 100, height: 30 }
    };

    return dimensions[type] || { width: 100, height: 80 };
  }

  /**
   * 고유 ID 생성
   * @param {string} type - BPMN 요소 타입
   * @returns {string} 생성된 ID
   */
  generateId(type) {
    const prefix = type.replace('bpmn:', '');
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * 부모-자식 관계 직접 설정
   * @param {Object} parent - 부모 요소
   * @param {Object} child - 자식 요소
   */
  setParentChildRelation(parent, child) {
    try {
      // 다이어그램 레벨 관계 설정
      child.parent = parent;
      if (!parent.children) {
        parent.children = [];
      }
      if (!parent.children.includes(child)) {
        parent.children.push(child);
      }

      // BusinessObject 레벨 관계 설정
      if (parent.businessObject && child.businessObject) {
        child.businessObject.$parent = parent.businessObject;
        
        // flowElements 배열에 추가
        if (!parent.businessObject.flowElements) {
          parent.businessObject.flowElements = [];
        }
        if (!parent.businessObject.flowElements.includes(child.businessObject)) {
          parent.businessObject.flowElements.push(child.businessObject);
        }
      }
    } catch (error) {
      console.error('Error setting parent-child relation:', error);
    }
  }

  /**
   * 요소 복사 생성
   * @param {Object} sourceElement - 복사할 원본 요소
   * @param {Object} position - 새 위치
   * @param {Object} parent - 부모 요소 (선택사항)
   * @returns {Object} 복사된 요소
   */
  cloneElement(sourceElement, position, parent = null) {
    try {
      const sourceBO = sourceElement.businessObject;
      
      // BusinessObject 속성 복사
      const clonedProperties = {
        id: this.generateId(sourceBO.$type),
        name: sourceBO.name ? `${sourceBO.name} Copy` : '',
        // 다른 속성들도 복사 (필요에 따라 확장)
      };

      // 새 요소 생성
      return this.createCompleteElement(
        sourceBO.$type,
        clonedProperties,
        position,
        parent || sourceElement.parent,
        {
          width: sourceElement.width,
          height: sourceElement.height
        }
      );
    } catch (error) {
      console.error('Error cloning element:', error);
      return null;
    }
  }

  /**
   * 요소 완전 삭제 (관계 정리 포함)
   * @param {Object} element - 삭제할 요소
   */
  deleteElementCompletely(element) {
    try {
      // 연결된 connection들 먼저 정리
      if (element.incoming) {
        [...element.incoming].forEach(connection => {
          this.removeFromCanvas(connection);
        });
      }
      if (element.outgoing) {
        [...element.outgoing].forEach(connection => {
          this.removeFromCanvas(connection);
        });
      }

      // 자식 요소들 재귀적 삭제
      if (element.children) {
        [...element.children].forEach(child => {
          this.deleteElementCompletely(child);
        });
      }

      // 부모에서 제거
      if (element.parent) {
        const parent = element.parent;
        if (parent.children) {
          const index = parent.children.indexOf(element);
          if (index > -1) {
            parent.children.splice(index, 1);
          }
        }

        // BusinessObject 레벨에서도 제거
        if (parent.businessObject && parent.businessObject.flowElements) {
          const boIndex = parent.businessObject.flowElements.indexOf(element.businessObject);
          if (boIndex > -1) {
            parent.businessObject.flowElements.splice(boIndex, 1);
          }
        }
      }

      // Canvas에서 제거
      this.removeFromCanvas(element);
    } catch (error) {
      console.error('Error deleting element completely:', error);
    }
  }

  /**
   * 여러 요소 배치 생성
   * @param {Array} elementSpecs - 요소 명세 배열
   * @returns {Array} 생성된 요소들
   */
  createMultipleElements(elementSpecs) {
    const createdElements = [];
    
    try {
      elementSpecs.forEach(spec => {
        const element = this.createCompleteElement(
          spec.type,
          spec.properties || {},
          spec.position || {},
          spec.parent,
          spec.dimensions
        );
        
        if (element) {
          createdElements.push(element);
        }
      });
    } catch (error) {
      console.error('Error creating multiple elements:', error);
    }

    return createdElements;
  }
}