/**
 * Model Tree Manipulator
 * 
 * BPMN 모델의 트리 구조(부모-자식 관계, 연결 관계)를 직접 조작하는 서비스입니다.
 * BusinessObject 레벨과 Diagram 레벨에서의 관계를 동시에 관리합니다.
 */
export class ModelTreeManipulator {
  constructor(modeler) {
    this.modeler = modeler;
    this.elementRegistry = modeler.get('elementRegistry');
    this.canvas = modeler.get('canvas');
    
    // Root element 캐싱
    this.rootElement = this.canvas.getRootElement();
  }

  /**
   * 부모-자식 관계 직접 설정
   * @param {string|Object} parentElementOrId - 부모 요소 또는 ID
   * @param {string|Object} childElementOrId - 자식 요소 또는 ID
   * @returns {boolean} 성공 여부
   */
  setParentChild(parentElementOrId, childElementOrId) {
    try {
      const parent = this.resolveElement(parentElementOrId);
      const child = this.resolveElement(childElementOrId);

      if (!parent || !child) {
        console.error('ModelTreeManipulator: Parent or child element not found');
        return false;
      }

      // 1. Diagram 레벨에서 관계 설정
      this.setDiagramParentChild(parent, child);

      // 2. BusinessObject 레벨에서 관계 설정
      this.setBusinessObjectParentChild(parent, child);

      return true;
    } catch (error) {
      console.error('ModelTreeManipulator: Error setting parent-child relationship:', error);
      return false;
    }
  }

  /**
   * 부모-자식 관계 제거
   * @param {string|Object} childElementOrId - 자식 요소 또는 ID
   * @returns {boolean} 성공 여부
   */
  removeParentChild(childElementOrId) {
    try {
      const child = this.resolveElement(childElementOrId);
      if (!child) {
        console.error('ModelTreeManipulator: Child element not found');
        return false;
      }

      const parent = child.parent;
      if (!parent) {
        return true; // 이미 부모가 없음
      }

      // 1. Diagram 레벨에서 관계 제거
      this.removeDiagramParentChild(parent, child);

      // 2. BusinessObject 레벨에서 관계 제거
      this.removeBusinessObjectParentChild(parent, child);

      return true;
    } catch (error) {
      console.error('ModelTreeManipulator: Error removing parent-child relationship:', error);
      return false;
    }
  }

  /**
   * 연결 관계 직접 설정
   * @param {string|Object} sourceElementOrId - 시작 요소 또는 ID
   * @param {string|Object} targetElementOrId - 종료 요소 또는 ID
   * @param {string|Object} connectionElementOrId - 연결 요소 또는 ID
   * @returns {boolean} 성공 여부
   */
  setConnection(sourceElementOrId, targetElementOrId, connectionElementOrId) {
    try {
      const source = this.resolveElement(sourceElementOrId);
      const target = this.resolveElement(targetElementOrId);
      const connection = this.resolveElement(connectionElementOrId);

      if (!source || !target || !connection) {
        console.error('ModelTreeManipulator: Source, target, or connection element not found');
        return false;
      }

      // 1. Diagram 레벨에서 연결 관계 설정
      this.setDiagramConnection(source, target, connection);

      // 2. BusinessObject 레벨에서 연결 관계 설정
      this.setBusinessObjectConnection(source, target, connection);

      return true;
    } catch (error) {
      console.error('ModelTreeManipulator: Error setting connection:', error);
      return false;
    }
  }

  /**
   * 연결 관계 제거
   * @param {string|Object} connectionElementOrId - 연결 요소 또는 ID
   * @returns {boolean} 성공 여부
   */
  removeConnection(connectionElementOrId) {
    try {
      const connection = this.resolveElement(connectionElementOrId);
      if (!connection) {
        console.error('ModelTreeManipulator: Connection element not found');
        return false;
      }

      const source = connection.source;
      const target = connection.target;

      if (source && target) {
        // 1. Diagram 레벨에서 연결 관계 제거
        this.removeDiagramConnection(source, target, connection);

        // 2. BusinessObject 레벨에서 연결 관계 제거 
        this.removeBusinessObjectConnection(source, target, connection);
      }

      return true;
    } catch (error) {
      console.error('ModelTreeManipulator: Error removing connection:', error);
      return false;
    }
  }

  /**
   * 요소를 다른 부모로 이동
   * @param {string|Object} elementOrId - 이동할 요소 또는 ID
   * @param {string|Object} newParentOrId - 새 부모 요소 또는 ID
   * @returns {boolean} 성공 여부
   */
  moveToParent(elementOrId, newParentOrId) {
    try {
      const element = this.resolveElement(elementOrId);
      const newParent = this.resolveElement(newParentOrId);

      if (!element || !newParent) {
        console.error('ModelTreeManipulator: Element or new parent not found');
        return false;
      }

      // 기존 부모 관계 제거
      this.removeParentChild(element);

      // 새 부모 관계 설정
      this.setParentChild(newParent, element);

      return true;
    } catch (error) {
      console.error('ModelTreeManipulator: Error moving to parent:', error);
      return false;
    }
  }

  /**
   * Diagram 레벨에서 부모-자식 관계 설정
   * @param {Object} parent - 부모 요소
   * @param {Object} child - 자식 요소
   */
  setDiagramParentChild(parent, child) {
    // 자식의 부모 참조 설정
    child.parent = parent;

    // 부모의 자식 목록에 추가
    if (!parent.children) {
      parent.children = [];
    }
    
    if (!parent.children.includes(child)) {
      parent.children.push(child);
    }
  }

  /**
   * Diagram 레벨에서 부모-자식 관계 제거
   * @param {Object} parent - 부모 요소
   * @param {Object} child - 자식 요소
   */
  removeDiagramParentChild(parent, child) {
    // 자식의 부모 참조 제거
    child.parent = null;

    // 부모의 자식 목록에서 제거
    if (parent.children) {
      const index = parent.children.indexOf(child);
      if (index > -1) {
        parent.children.splice(index, 1);
      }
    }
  }

  /**
   * BusinessObject 레벨에서 부모-자식 관계 설정
   * @param {Object} parent - 부모 요소
   * @param {Object} child - 자식 요소
   */
  setBusinessObjectParentChild(parent, child) {
    if (!parent.businessObject || !child.businessObject) {
      return;
    }

    // 자식 BusinessObject의 부모 참조 설정
    child.businessObject.$parent = parent.businessObject;

    // 부모 BusinessObject의 자식 목록에 추가
    this.addToBusinessObjectCollection(parent.businessObject, child.businessObject);
  }

  /**
   * BusinessObject 레벨에서 부모-자식 관계 제거
   * @param {Object} parent - 부모 요소
   * @param {Object} child - 자식 요소
   */
  removeBusinessObjectParentChild(parent, child) {
    if (!parent.businessObject || !child.businessObject) {
      return;
    }

    // 자식 BusinessObject의 부모 참조 제거
    child.businessObject.$parent = null;

    // 부모 BusinessObject의 자식 목록에서 제거
    this.removeFromBusinessObjectCollection(parent.businessObject, child.businessObject);
  }

  /**
   * Diagram 레벨에서 연결 관계 설정
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   * @param {Object} connection - 연결 요소
   */
  setDiagramConnection(source, target, connection) {
    // Connection 속성 설정
    connection.source = source;
    connection.target = target;

    // Source의 outgoing 목록에 추가
    if (!source.outgoing) {
      source.outgoing = [];
    }
    if (!source.outgoing.includes(connection)) {
      source.outgoing.push(connection);
    }

    // Target의 incoming 목록에 추가
    if (!target.incoming) {
      target.incoming = [];
    }
    if (!target.incoming.includes(connection)) {
      target.incoming.push(connection);
    }
  }

  /**
   * Diagram 레벨에서 연결 관계 제거
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   * @param {Object} connection - 연결 요소
   */
  removeDiagramConnection(source, target, connection) {
    // Connection 속성 제거
    connection.source = null;
    connection.target = null;

    // Source의 outgoing 목록에서 제거
    if (source.outgoing) {
      const outgoingIndex = source.outgoing.indexOf(connection);
      if (outgoingIndex > -1) {
        source.outgoing.splice(outgoingIndex, 1);
      }
    }

    // Target의 incoming 목록에서 제거
    if (target.incoming) {
      const incomingIndex = target.incoming.indexOf(connection);
      if (incomingIndex > -1) {
        target.incoming.splice(incomingIndex, 1);
      }
    }
  }

  /**
   * BusinessObject 레벨에서 연결 관계 설정
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   * @param {Object} connection - 연결 요소
   */
  setBusinessObjectConnection(source, target, connection) {
    if (!source.businessObject || !target.businessObject || !connection.businessObject) {
      return;
    }

    // Connection BusinessObject의 참조 설정
    connection.businessObject.sourceRef = source.businessObject;
    connection.businessObject.targetRef = target.businessObject;

    // Source BusinessObject의 outgoing 목록에 추가
    if (!source.businessObject.outgoing) {
      source.businessObject.outgoing = [];
    }
    if (!source.businessObject.outgoing.includes(connection.businessObject)) {
      source.businessObject.outgoing.push(connection.businessObject);
    }

    // Target BusinessObject의 incoming 목록에 추가
    if (!target.businessObject.incoming) {
      target.businessObject.incoming = [];
    }
    if (!target.businessObject.incoming.includes(connection.businessObject)) {
      target.businessObject.incoming.push(connection.businessObject);
    }
  }

  /**
   * BusinessObject 레벨에서 연결 관계 제거
   * @param {Object} source - 시작 요소
   * @param {Object} target - 종료 요소
   * @param {Object} connection - 연결 요소
   */
  removeBusinessObjectConnection(source, target, connection) {
    if (!source.businessObject || !target.businessObject || !connection.businessObject) {
      return;
    }

    // Connection BusinessObject의 참조 제거
    connection.businessObject.sourceRef = null;
    connection.businessObject.targetRef = null;

    // Source BusinessObject의 outgoing 목록에서 제거
    if (source.businessObject.outgoing) {
      const outgoingIndex = source.businessObject.outgoing.indexOf(connection.businessObject);
      if (outgoingIndex > -1) {
        source.businessObject.outgoing.splice(outgoingIndex, 1);
      }
    }

    // Target BusinessObject의 incoming 목록에서 제거
    if (target.businessObject.incoming) {
      const incomingIndex = target.businessObject.incoming.indexOf(connection.businessObject);
      if (incomingIndex > -1) {
        target.businessObject.incoming.splice(incomingIndex, 1);
      }
    }
  }

  /**
   * BusinessObject 컬렉션에 요소 추가
   * @param {Object} parentBO - 부모 BusinessObject
   * @param {Object} childBO - 자식 BusinessObject
   */
  addToBusinessObjectCollection(parentBO, childBO) {
    const childType = childBO.$type;
    
    // 요소 타입에 따라 적절한 컬렉션에 추가
    if (childType.includes('Event') || childType.includes('Task') || childType.includes('Gateway')) {
      if (!parentBO.flowElements) {
        parentBO.flowElements = [];
      }
      if (!parentBO.flowElements.includes(childBO)) {
        parentBO.flowElements.push(childBO);
      }
    } else if (childType.includes('Lane')) {
      if (!parentBO.lanes) {
        parentBO.lanes = [];
      }
      if (!parentBO.lanes.includes(childBO)) {
        parentBO.lanes.push(childBO);
      }
    } else if (childType.includes('Artifact')) {
      if (!parentBO.artifacts) {
        parentBO.artifacts = [];
      }
      if (!parentBO.artifacts.includes(childBO)) {
        parentBO.artifacts.push(childBO);
      }
    }
  }

  /**
   * BusinessObject 컬렉션에서 요소 제거
   * @param {Object} parentBO - 부모 BusinessObject
   * @param {Object} childBO - 자식 BusinessObject
   */
  removeFromBusinessObjectCollection(parentBO, childBO) {
    const collections = ['flowElements', 'lanes', 'artifacts'];
    
    collections.forEach(collectionName => {
      const collection = parentBO[collectionName];
      if (collection && Array.isArray(collection)) {
        const index = collection.indexOf(childBO);
        if (index > -1) {
          collection.splice(index, 1);
        }
      }
    });
  }

  /**
   * 요소 해석 (ID 또는 요소 객체를 요소 객체로 변환)
   * @param {string|Object} elementOrId - 요소 또는 ID
   * @returns {Object|null} 요소 객체
   */
  resolveElement(elementOrId) {
    if (typeof elementOrId === 'string') {
      return this.elementRegistry.get(elementOrId);
    } else if (elementOrId && elementOrId.id) {
      return elementOrId;
    }
    return null;
  }

  /**
   * 요소의 모든 자식 요소 반환
   * @param {string|Object} elementOrId - 요소 또는 ID
   * @param {boolean} recursive - 재귀적으로 모든 하위 요소 포함 여부
   * @returns {Array} 자식 요소 배열
   */
  getChildren(elementOrId, recursive = false) {
    const element = this.resolveElement(elementOrId);
    if (!element || !element.children) {
      return [];
    }

    let children = [...element.children];

    if (recursive) {
      children.forEach(child => {
        children = children.concat(this.getChildren(child, true));
      });
    }

    return children;
  }

  /**
   * 요소의 모든 연결 관계 반환
   * @param {string|Object} elementOrId - 요소 또는 ID
   * @returns {Object} {incoming: Array, outgoing: Array}
   */
  getConnections(elementOrId) {
    const element = this.resolveElement(elementOrId);
    if (!element) {
      return { incoming: [], outgoing: [] };
    }

    return {
      incoming: element.incoming || [],
      outgoing: element.outgoing || []
    };
  }

  /**
   * 모델 트리 구조 검증
   * @returns {Object} 검증 결과
   */
  validateModelTree() {
    const issues = [];
    const stats = {
      totalElements: 0,
      orphanElements: 0,
      invalidConnections: 0,
      businessObjectMismatches: 0
    };

    const allElements = this.elementRegistry.getAll();
    
    allElements.forEach(element => {
      stats.totalElements++;

      // 고아 요소 검사 (root가 아닌데 부모가 없는 경우)
      if (element !== this.rootElement && !element.parent) {
        stats.orphanElements++;
        issues.push({
          elementId: element.id,
          issue: 'orphan_element'
        });
      }

      // 연결 요소의 source/target 검증
      if (element.waypoints) { // Connection인 경우
        if (!element.source || !element.target) {
          stats.invalidConnections++;
          issues.push({
            elementId: element.id,
            issue: 'invalid_connection'
          });
        }
      }

      // BusinessObject 관계 일치성 검증
      if (element.parent && element.businessObject && element.parent.businessObject) {
        if (element.businessObject.$parent !== element.parent.businessObject) {
          stats.businessObjectMismatches++;
          issues.push({
            elementId: element.id,
            issue: 'business_object_mismatch'
          });
        }
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
    this.canvas = null;
    this.rootElement = null;
  }
}

export default ModelTreeManipulator;