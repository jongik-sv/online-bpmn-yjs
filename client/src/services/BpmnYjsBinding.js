/**
 * BPMN Y.js 직접 바인딩
 * Y-Quill, Y-CodeMirror와 동일한 패턴으로 BPMN.js와 Y.js를 직접 연결
 */
export class BpmnYjsBinding {
  constructor(yElements, yConnections, bpmnModeler, awareness = null) {
    this.yElements = yElements;
    this.yConnections = yConnections;
    this.bpmnModeler = bpmnModeler;
    this.awareness = awareness;
    
    // 서비스 참조
    this.elementRegistry = bpmnModeler.get('elementRegistry');
    this.modeling = bpmnModeler.get('modeling');
    this.elementFactory = bpmnModeler.get('elementFactory');
    this.bpmnFactory = bpmnModeler.get('bpmnFactory');
    
    // 내부 상태
    this.isLocalChange = false;
    this.observing = true;
    
    // 바인딩 시작
    this.bind();
  }

  /**
   * 바인딩 시작 - Y-Quill과 동일한 패턴
   */
  bind() {
    // Y.js -> BPMN 방향 바인딩
    this.yElements.observe(this.handleYElementsChange.bind(this));
    this.yConnections.observe(this.handleYConnectionsChange.bind(this));
    
    // BPMN -> Y.js 방향 바인딩
    this.bpmnModeler.on('element.changed', this.handleBpmnElementChanged.bind(this));
    this.bpmnModeler.on('elements.changed', this.handleBpmnElementsChanged.bind(this));
    this.bpmnModeler.on('commandStack.shape.create.postExecuted', this.handleBpmnElementCreated.bind(this));
    this.bpmnModeler.on('commandStack.connection.create.postExecuted', this.handleBpmnConnectionCreated.bind(this));
    this.bpmnModeler.on('commandStack.shape.delete.postExecuted', this.handleBpmnElementDeleted.bind(this));
    this.bpmnModeler.on('commandStack.connection.delete.postExecuted', this.handleBpmnConnectionDeleted.bind(this));
    
    console.log('✅ BPMN Y.js 직접 바인딩 활성화됨');
  }

  /**
   * Y.js 요소 변경 처리 - Y-Quill observe 패턴
   */
  handleYElementsChange(event) {
    if (!this.observing) return;
    
    // 로컬 변경은 무시 (origin 체크)
    if (event.transaction.origin === this) return;
    
    this.withoutObserving(() => {
      event.changes.keys.forEach((change, elementId) => {
        if (change.action === 'add' || change.action === 'update') {
          const elementData = this.yElements.get(elementId);
          this.applyElementToModel(elementId, elementData);
        } else if (change.action === 'delete') {
          this.removeElementFromModel(elementId);
        }
      });
    });
  }

  /**
   * Y.js 연결 변경 처리
   */
  handleYConnectionsChange(event) {
    if (!this.observing) return;
    
    if (event.transaction.origin === this) return;
    
    this.withoutObserving(() => {
      event.changes.keys.forEach((change, connectionId) => {
        if (change.action === 'add' || change.action === 'update') {
          const connectionData = this.yConnections.get(connectionId);
          this.applyConnectionToModel(connectionId, connectionData);
        } else if (change.action === 'delete') {
          this.removeConnectionFromModel(connectionId);
        }
      });
    });
  }

  /**
   * BPMN 요소 변경 처리 - Y-Quill input 패턴
   */
  handleBpmnElementChanged(event) {
    if (!this.observing) return;
    
    const element = event.element;
    
    // 연결선은 별도 처리
    if (element.type && element.type.includes('SequenceFlow')) {
      this.syncConnectionToY(element);
    } else {
      this.syncElementToY(element);
    }
  }

  /**
   * 여러 BPMN 요소 변경 처리
   */
  handleBpmnElementsChanged(event) {
    if (!this.observing) return;
    
    event.elements.forEach(element => {
      if (element.type && element.type.includes('SequenceFlow')) {
        this.syncConnectionToY(element);
      } else {
        this.syncElementToY(element);
      }
    });
  }

  /**
   * BPMN 요소 생성 처리
   */
  handleBpmnElementCreated(event) {
    if (!this.observing) return;
    this.syncElementToY(event.context.shape);
  }

  /**
   * BPMN 연결 생성 처리
   */
  handleBpmnConnectionCreated(event) {
    if (!this.observing) return;
    this.syncConnectionToY(event.context.connection);
  }

  /**
   * BPMN 요소 삭제 처리
   */
  handleBpmnElementDeleted(event) {
    if (!this.observing) return;
    const elementId = event.context.shape.id;
    this.removeElementFromY(elementId);
  }

  /**
   * BPMN 연결 삭제 처리
   */
  handleBpmnConnectionDeleted(event) {
    if (!this.observing) return;
    const connectionId = event.context.connection.id;
    this.removeConnectionFromY(connectionId);
  }

  /**
   * Y.js 변경을 BPMN 모델에 적용
   */
  applyElementToModel(elementId, elementData) {
    try {
      const existingElement = this.elementRegistry.get(elementId);
      
      if (existingElement) {
        // 기존 요소 업데이트
        this.updateElement(existingElement, elementData);
      } else {
        // 새 요소 생성
        this.createElement(elementId, elementData);
      }
    } catch (error) {
      console.error('Y.js -> BPMN 요소 적용 오류:', error);
    }
  }

  /**
   * Y.js 연결을 BPMN 모델에 적용
   */
  applyConnectionToModel(connectionId, connectionData) {
    try {
      const existingConnection = this.elementRegistry.get(connectionId);
      
      if (existingConnection) {
        // waypoints만 업데이트
        if (connectionData.waypoints) {
          this.modeling.updateWaypoints(existingConnection, connectionData.waypoints);
        }
      } else {
        // 새 연결 생성
        this.createConnection(connectionId, connectionData);
      }
    } catch (error) {
      console.error('Y.js -> BPMN 연결 적용 오류:', error);
    }
  }

  /**
   * BPMN 요소를 Y.js에 동기화
   */
  syncElementToY(element) {
    if (!element || element.id.includes('_label')) return;
    
    const elementData = {
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      businessObject: element.businessObject ? {
        id: element.businessObject.id,
        name: element.businessObject.name || '',
        $type: element.businessObject.$type
      } : null,
      parent: element.parent?.id || 'Process_1',
      lastModified: Date.now()
    };

    // Y.js에 동기화 (origin 설정)
    this.yElements.doc.transact(() => {
      this.yElements.set(element.id, elementData);
    }, this);
  }

  /**
   * BPMN 연결을 Y.js에 동기화
   */
  syncConnectionToY(connection) {
    if (!connection || !connection.source || !connection.target) return;
    
    const connectionData = {
      type: connection.type,
      source: connection.source.id,
      target: connection.target.id,
      businessObject: connection.businessObject ? {
        id: connection.businessObject.id,
        $type: connection.businessObject.$type
      } : null,
      waypoints: connection.waypoints ? connection.waypoints.map(wp => ({
        x: Math.round(wp.x),
        y: Math.round(wp.y)
      })) : [],
      lastModified: Date.now()
    };

    // Y.js에 동기화 (origin 설정)
    this.yConnections.doc.transact(() => {
      this.yConnections.set(connection.id, connectionData);
    }, this);
  }

  /**
   * Y.js에서 요소 제거
   */
  removeElementFromY(elementId) {
    this.yElements.doc.transact(() => {
      this.yElements.delete(elementId);
    }, this);
  }

  /**
   * Y.js에서 연결 제거
   */
  removeConnectionFromY(connectionId) {
    this.yConnections.doc.transact(() => {
      this.yConnections.delete(connectionId);
    }, this);
  }

  /**
   * 모델에서 요소 제거
   */
  removeElementFromModel(elementId) {
    const element = this.elementRegistry.get(elementId);
    if (element) {
      this.modeling.removeShape(element);
    }
  }

  /**
   * 모델에서 연결 제거
   */
  removeConnectionFromModel(connectionId) {
    const connection = this.elementRegistry.get(connectionId);
    if (connection) {
      this.modeling.removeConnection(connection);
    }
  }

  /**
   * 요소 생성 (Y.js -> BPMN)
   */
  createElement(elementId, elementData) {
    try {
      const parent = this.elementRegistry.get(elementData.parent || 'Process_1');
      const position = { x: elementData.x || 100, y: elementData.y || 100 };
      
      const businessObject = this.bpmnFactory.create(elementData.type, {
        id: elementId,
        name: elementData.businessObject?.name || ''
      });
      
      const newElement = this.elementFactory.createElement('shape', {
        type: elementData.type,
        businessObject: businessObject
      });
      
      this.modeling.createShape(newElement, position, parent);
      
    } catch (error) {
      console.error('요소 생성 오류:', error);
    }
  }

  /**
   * 요소 업데이트 (Y.js -> BPMN)
   */
  updateElement(element, elementData) {
    try {
      // 위치 업데이트
      if (elementData.x !== undefined && elementData.y !== undefined) {
        const deltaX = elementData.x - (element.x || 0);
        const deltaY = elementData.y - (element.y || 0);
        
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          this.modeling.moveShape(element, { x: deltaX, y: deltaY });
        }
      }
      
      // 이름 업데이트
      if (elementData.businessObject?.name !== element.businessObject?.name) {
        this.modeling.updateProperties(element, {
          name: elementData.businessObject.name
        });
      }
      
    } catch (error) {
      console.error('요소 업데이트 오류:', error);
    }
  }

  /**
   * 연결 생성 (Y.js -> BPMN)
   */
  createConnection(connectionId, connectionData) {
    try {
      const source = this.elementRegistry.get(connectionData.source);
      const target = this.elementRegistry.get(connectionData.target);
      
      if (!source || !target) return;
      
      const connection = this.modeling.connect(source, target, {
        type: connectionData.type || 'bpmn:SequenceFlow'
      });
      
      // waypoints 설정
      if (connection && connectionData.waypoints?.length > 0) {
        this.modeling.updateWaypoints(connection, connectionData.waypoints);
      }
      
    } catch (error) {
      console.error('연결 생성 오류:', error);
    }
  }

  /**
   * 관찰 일시 중단하고 작업 실행 - Y-Quill 패턴
   */
  withoutObserving(fn) {
    this.observing = false;
    try {
      fn();
    } finally {
      this.observing = true;
    }
  }

  /**
   * 바인딩 해제
   */
  unbind() {
    this.observing = false;
    this.yElements.unobserve(this.handleYElementsChange);
    this.yConnections.unobserve(this.handleYConnectionsChange);
    
    // BPMN 이벤트 해제
    this.bpmnModeler.off('element.changed', this.handleBpmnElementChanged);
    this.bpmnModeler.off('elements.changed', this.handleBpmnElementsChanged);
    this.bpmnModeler.off('commandStack.shape.create.postExecuted', this.handleBpmnElementCreated);
    this.bpmnModeler.off('commandStack.connection.create.postExecuted', this.handleBpmnConnectionCreated);
    this.bpmnModeler.off('commandStack.shape.delete.postExecuted', this.handleBpmnElementDeleted);
    this.bpmnModeler.off('commandStack.connection.delete.postExecuted', this.handleBpmnConnectionDeleted);
    
    console.log('🔌 BPMN Y.js 바인딩 해제됨');
  }

  /**
   * 바인딩 상태 확인
   */
  isBound() {
    return this.observing;
  }
}