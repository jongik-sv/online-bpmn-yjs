/**
 * Model Tree Manipulator
 * 
 * BPMN 모델 트리 구조를 직접 조작하는 서비스
 * 부모-자식 관계, 연결 관계 등을 EventBus 없이 직접 설정
 */
export class ModelTreeManipulator {
  constructor(modeler) {
    this.modeler = modeler;
    this.elementRegistry = modeler.get('elementRegistry');
    this.bpmnFactory = modeler.get('bpmnFactory');
    this.elementFactory = modeler.get('elementFactory');
    this.canvas = modeler.get('canvas');
  }

  /**
   * 부모-자식 관계 직접 설정
   * @param {string} parentId - 부모 요소 ID
   * @param {string} childId - 자식 요소 ID
   * @returns {boolean} 성공 여부
   */
  setParentChild(parentId, childId) {
    try {
      const parent = this.elementRegistry.get(parentId);
      const child = this.elementRegistry.get(childId);

      if (!parent || !child) {
        console.warn(`Parent or child not found: ${parentId}, ${childId}`);
        return false;
      }

      // 기존 부모에서 제거
      this.removeFromParent(child);

      // 새 부모-자식 관계 설정
      child.parent = parent;
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(child);

      // BusinessObject 레벨에서도 관계 설정
      if (parent.businessObject && child.businessObject) {
        child.businessObject.$parent = parent.businessObject;
        
        // flowElements 배열에 추가
        if (!parent.businessObject.flowElements) {
          parent.businessObject.flowElements = [];
        }
        parent.businessObject.flowElements.push(child.businessObject);
      }

      return true;
    } catch (error) {
      console.error('Error setting parent-child relationship:', error);
      return false;
    }
  }

  /**
   * 부모에서 자식 제거
   * @param {Object} child - 제거할 자식 요소
   */
  removeFromParent(child) {
    try {
      if (child.parent) {
        const parent = child.parent;
        
        // children 배열에서 제거
        if (parent.children) {
          const index = parent.children.indexOf(child);
          if (index > -1) {
            parent.children.splice(index, 1);
          }
        }

        // BusinessObject 레벨에서도 제거
        if (parent.businessObject && parent.businessObject.flowElements) {
          const boIndex = parent.businessObject.flowElements.indexOf(child.businessObject);
          if (boIndex > -1) {
            parent.businessObject.flowElements.splice(boIndex, 1);
          }
        }

        child.parent = null;
        if (child.businessObject) {
          child.businessObject.$parent = null;
        }
      }
    } catch (error) {
      console.error('Error removing from parent:', error);
    }
  }

  /**
   * 연결 관계 직접 설정
   * @param {string} sourceId - 시작 요소 ID
   * @param {string} targetId - 끝 요소 ID
   * @param {string} connectionId - 연결 요소 ID
   * @returns {boolean} 성공 여부
   */
  setConnection(sourceId, targetId, connectionId) {
    try {
      const source = this.elementRegistry.get(sourceId);
      const target = this.elementRegistry.get(targetId);
      const connection = this.elementRegistry.get(connectionId);

      if (!source || !target || !connection) {
        console.warn(`Source, target, or connection not found: ${sourceId}, ${targetId}, ${connectionId}`);
        return false;
      }

      // 연결 관계 설정
      connection.source = source;
      connection.target = target;

      // outgoing/incoming 관계 설정
      if (!source.outgoing) {
        source.outgoing = [];
      }
      if (!target.incoming) {
        target.incoming = [];
      }

      // 중복 방지
      if (!source.outgoing.includes(connection)) {
        source.outgoing.push(connection);
      }
      if (!target.incoming.includes(connection)) {
        target.incoming.push(connection);
      }

      // BusinessObject 레벨에서도 관계 설정
      if (source.businessObject && target.businessObject && connection.businessObject) {
        connection.businessObject.sourceRef = source.businessObject;
        connection.businessObject.targetRef = target.businessObject;
      }

      return true;
    } catch (error) {
      console.error('Error setting connection:', error);
      return false;
    }
  }

  /**
   * 연결 관계 제거
   * @param {string} connectionId - 제거할 연결 ID
   * @returns {boolean} 성공 여부
   */
  removeConnection(connectionId) {
    try {
      const connection = this.elementRegistry.get(connectionId);
      if (!connection) {
        return false;
      }

      const source = connection.source;
      const target = connection.target;

      // source의 outgoing에서 제거
      if (source && source.outgoing) {
        const outIndex = source.outgoing.indexOf(connection);
        if (outIndex > -1) {
          source.outgoing.splice(outIndex, 1);
        }
      }

      // target의 incoming에서 제거
      if (target && target.incoming) {
        const inIndex = target.incoming.indexOf(connection);
        if (inIndex > -1) {
          target.incoming.splice(inIndex, 1);
        }
      }

      // connection 자체 정리
      connection.source = null;
      connection.target = null;

      return true;
    } catch (error) {
      console.error('Error removing connection:', error);
      return false;
    }
  }

  /**
   * 새 연결 생성 및 관계 설정
   * @param {string} sourceId - 시작 요소 ID
   * @param {string} targetId - 끝 요소 ID
   * @param {string} connectionType - 연결 타입 (기본: 'bpmn:SequenceFlow')
   * @param {Object} properties - 연결 속성
   * @returns {Object|null} 생성된 연결 요소
   */
  createConnection(sourceId, targetId, connectionType = 'bpmn:SequenceFlow', properties = {}) {
    try {
      const source = this.elementRegistry.get(sourceId);
      const target = this.elementRegistry.get(targetId);

      if (!source || !target) {
        console.warn(`Source or target not found: ${sourceId}, ${targetId}`);
        return null;
      }

      // BusinessObject 생성
      const businessObject = this.bpmnFactory.create(connectionType, {
        id: properties.id || this.generateConnectionId(connectionType),
        name: properties.name || '',
        sourceRef: source.businessObject,
        targetRef: target.businessObject,
        ...properties
      });

      // Connection 요소 생성
      const connection = this.elementFactory.createConnection({
        type: connectionType,
        businessObject: businessObject,
        source: source,
        target: target,
        waypoints: this.calculateWaypoints(source, target)
      });

      // 연결 관계 설정
      this.setConnection(sourceId, targetId, connection.id);

      return connection;
    } catch (error) {
      console.error('Error creating connection:', error);
      return null;
    }
  }

  /**
   * 연결을 위한 waypoints 계산
   * @param {Object} source - 시작 요소
   * @param {Object} target - 끝 요소
   * @returns {Array} waypoints 배열
   */
  calculateWaypoints(source, target) {
    const sourceMid = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2
    };
    const targetMid = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2
    };

    return [sourceMid, targetMid];
  }

  /**
   * 연결 ID 생성
   * @param {string} connectionType - 연결 타입
   * @returns {string} 생성된 ID
   */
  generateConnectionId(connectionType) {
    const prefix = connectionType.replace('bpmn:', '');
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * 요소 트리 구조 출력 (디버깅용)
   * @param {Object} rootElement - 루트 요소 (선택사항)
   * @returns {Object} 트리 구조
   */
  getTreeStructure(rootElement = null) {
    const root = rootElement || this.canvas.getRootElement();
    
    const buildTree = (element) => {
      const node = {
        id: element.id,
        type: element.businessObject ? element.businessObject.$type : element.type,
        children: []
      };

      if (element.children) {
        element.children.forEach(child => {
          node.children.push(buildTree(child));
        });
      }

      return node;
    };

    return buildTree(root);
  }

  /**
   * 요소의 모든 하위 요소 반환
   * @param {string} elementId - 부모 요소 ID
   * @returns {Array} 하위 요소 배열
   */
  getAllChildren(elementId) {
    const element = this.elementRegistry.get(elementId);
    if (!element) {
      return [];
    }

    const children = [];
    
    const collectChildren = (el) => {
      if (el.children) {
        el.children.forEach(child => {
          children.push(child);
          collectChildren(child);
        });
      }
    };

    collectChildren(element);
    return children;
  }

  /**
   * 요소의 모든 연결 반환
   * @param {string} elementId - 요소 ID
   * @returns {Object} {incoming: [], outgoing: []}
   */
  getAllConnections(elementId) {
    const element = this.elementRegistry.get(elementId);
    if (!element) {
      return { incoming: [], outgoing: [] };
    }

    return {
      incoming: element.incoming || [],
      outgoing: element.outgoing || []
    };
  }

  /**
   * 두 요소 간 경로 찾기
   * @param {string} sourceId - 시작 요소 ID
   * @param {string} targetId - 끝 요소 ID
   * @returns {Array} 경로상의 요소들
   */
  findPath(sourceId, targetId) {
    const source = this.elementRegistry.get(sourceId);
    const target = this.elementRegistry.get(targetId);
    
    if (!source || !target) {
      return [];
    }

    const visited = new Set();
    const path = [];

    const dfs = (current, currentPath) => {
      if (visited.has(current.id)) {
        return false;
      }

      visited.add(current.id);
      currentPath.push(current);

      if (current.id === targetId) {
        path.push(...currentPath);
        return true;
      }

      if (current.outgoing) {
        for (const connection of current.outgoing) {
          if (connection.target && dfs(connection.target, [...currentPath])) {
            return true;
          }
        }
      }

      return false;
    };

    dfs(source, []);
    return path;
  }

  /**
   * 요소 이동 (부모 변경)
   * @param {string} elementId - 이동할 요소 ID
   * @param {string} newParentId - 새 부모 ID
   * @returns {boolean} 성공 여부
   */
  moveElement(elementId, newParentId) {
    try {
      const element = this.elementRegistry.get(elementId);
      const newParent = this.elementRegistry.get(newParentId);

      if (!element || !newParent) {
        return false;
      }

      // 기존 부모에서 제거
      this.removeFromParent(element);

      // 새 부모에 추가
      return this.setParentChild(newParentId, elementId);
    } catch (error) {
      console.error('Error moving element:', error);
      return false;
    }
  }

  /**
   * 순환 참조 검사
   * @param {string} parentId - 부모 요소 ID
   * @param {string} childId - 자식 요소 ID
   * @returns {boolean} 순환 참조 여부
   */
  hasCyclicReference(parentId, childId) {
    const visited = new Set();
    
    const checkCycle = (currentId) => {
      if (visited.has(currentId)) {
        return true;
      }
      
      if (currentId === childId) {
        return true;
      }

      visited.add(currentId);
      const current = this.elementRegistry.get(currentId);
      
      if (current && current.children) {
        for (const child of current.children) {
          if (checkCycle(child.id)) {
            return true;
          }
        }
      }

      return false;
    };

    return checkCycle(parentId);
  }
}