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
    this.processingDeletion = new Set(); // 삭제 처리 중인 요소 추적
    this.processingCreation = new Set(); // 생성 처리 중인 요소 추적
    
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
    
    // console.log('✅ BPMN Y.js 직접 바인딩 활성화됨');
  }

  /**
   * Y.js 요소 변경 처리 - Y-Quill observe 패턴
   */
  handleYElementsChange(event) {
    if (!this.observing) return;
    
    // 로컬 변경은 무시 (origin 체크)
    if (event.transaction.origin === this) return;
    
    this.withoutObserving(() => {
      try {
        event.changes.keys.forEach((change, elementId) => {
          try {
            if (change.action === 'add' || change.action === 'update') {
              const elementData = this.yElements.get(elementId);
              if (elementData) {
                this.applyElementToModel(elementId, elementData);
              }
            } else if (change.action === 'delete') {
              console.log(`📤 Y.js에서 요소 삭제 감지: ${elementId}`);
              this.removeElementFromModel(elementId);
            }
          } catch (error) {
            console.error(`❌ 요소 변경 처리 오류 (${elementId}):`, error);
            // 개별 요소 오류는 전체 프로세스를 중단시키지 않음
          }
        });
      } catch (error) {
        console.error('❌ Y.js 요소 변경 처리 전체 오류:', error);
      }
    });
  }

  /**
   * Y.js 연결 변경 처리
   */
  handleYConnectionsChange(event) {
    if (!this.observing) return;
    
    if (event.transaction.origin === this) return;
    
    this.withoutObserving(() => {
      try {
        event.changes.keys.forEach((change, connectionId) => {
          try {
            if (change.action === 'add' || change.action === 'update') {
              const connectionData = this.yConnections.get(connectionId);
              if (connectionData) {
                this.applyConnectionToModel(connectionId, connectionData);
              }
            } else if (change.action === 'delete') {
              console.log(`📤 Y.js에서 연결 삭제 감지: ${connectionId}`);
              this.removeConnectionFromModel(connectionId);
            }
          } catch (error) {
            console.error(`❌ 연결 변경 처리 오류 (${connectionId}):`, error);
            // 개별 연결 오류는 전체 프로세스를 중단시키지 않음
          }
        });
      } catch (error) {
        console.error('❌ Y.js 연결 변경 처리 전체 오류:', error);
      }
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
      // 이미 처리 중인 연결은 스킵
      if (this.processingCreation.has(element.id)) {
        console.log(`⏭️ 변경 이벤트 스킵 (생성 처리 중): ${element.id}`);
        return;
      }
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
        // 이미 처리 중인 연결은 스킵
        if (this.processingCreation.has(element.id)) {
          console.log(`⏭️ 복수 변경 이벤트 스킵 (생성 처리 중): ${element.id}`);
          return;
        }
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
    
    const connection = event.context.connection;
    if (!connection) return;
    
    // 이미 처리 중인 연결은 스킵
    if (this.processingCreation.has(connection.id)) {
      console.log(`⏭️ 이미 처리 중인 연결 동기화 스킵: ${connection.id}`);
      return;
    }
    
    console.log(`🔗 BPMN 연결 생성 이벤트: ${connection.id}`);
    this.syncConnectionToY(connection);
  }

  /**
   * BPMN 요소 삭제 처리
   */
  handleBpmnElementDeleted(event) {
    if (!this.observing) return;
    
    try {
      const elementId = event.context?.shape?.id;
      if (elementId) {
        console.log(`🗑️ BPMN 요소 삭제 이벤트: ${elementId}`);
        this.removeElementFromY(elementId);
      }
    } catch (error) {
      console.error('❌ BPMN 요소 삭제 이벤트 처리 오류:', error);
    }
  }

  /**
   * BPMN 연결 삭제 처리
   */
  handleBpmnConnectionDeleted(event) {
    if (!this.observing) return;
    
    try {
      const connectionId = event.context?.connection?.id;
      if (connectionId) {
        console.log(`🗑️ BPMN 연결 삭제 이벤트: ${connectionId}`);
        this.removeConnectionFromY(connectionId);
      }
    } catch (error) {
      console.error('❌ BPMN 연결 삭제 이벤트 처리 오류:', error);
    }
  }

  /**
   * Y.js 변경을 BPMN 모델에 적용
   */
  applyElementToModel(elementId, elementData) {
    try {
      // 삭제 처리 중인 요소는 생성하지 않음
      if (this.processingDeletion.has(elementId)) {
        console.log(`⏭️ 삭제 처리 중인 요소는 생성하지 않음: ${elementId}`);
        return;
      }
      
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
      // 삭제 처리 중인 연결은 생성하지 않음
      if (this.processingDeletion.has(connectionId)) {
        console.log(`⏭️ 삭제 처리 중인 연결은 생성하지 않음: ${connectionId}`);
        return;
      }
      
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
    
    // 이미 Y.js에 동일한 데이터가 있는지 확인
    const existingData = this.yConnections.get(connection.id);
    
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

    // 데이터가 동일하면 동기화 스킵
    if (existingData && this.isConnectionDataEqual(existingData, connectionData)) {
      console.log(`⏭️ 동일한 연결 데이터, 동기화 스킵: ${connection.id}`);
      return;
    }

    console.log(`🔗 연결 Y.js 동기화: ${connection.id}`);
    
    // Y.js에 동기화 (origin 설정)
    this.yConnections.doc.transact(() => {
      this.yConnections.set(connection.id, connectionData);
    }, this);
  }

  /**
   * 연결 데이터 비교
   */
  isConnectionDataEqual(data1, data2) {
    if (!data1 || !data2) return false;
    
    return data1.type === data2.type &&
           data1.source === data2.source &&
           data1.target === data2.target &&
           JSON.stringify(data1.waypoints) === JSON.stringify(data2.waypoints);
  }

  /**
   * Y.js에서 요소 제거
   */
  removeElementFromY(elementId) {
    try {
      this.yElements.doc.transact(() => {
        this.yElements.delete(elementId);
      }, this);
      console.log(`✅ Y.js에서 요소 제거 완료: ${elementId}`);
    } catch (error) {
      console.error(`❌ Y.js에서 요소 제거 실패: ${elementId}`, error);
    }
  }

  /**
   * Y.js에서 연결 제거
   */
  removeConnectionFromY(connectionId) {
    try {
      this.yConnections.doc.transact(() => {
        this.yConnections.delete(connectionId);
      }, this);
      console.log(`✅ Y.js에서 연결 제거 완료: ${connectionId}`);
    } catch (error) {
      console.error(`❌ Y.js에서 연결 제거 실패: ${connectionId}`, error);
    }
  }

  /**
   * 모델에서 요소 제거
   */
  removeElementFromModel(elementId) {
    // 이미 삭제 처리 중인 요소는 스킵
    if (this.processingDeletion.has(elementId)) {
      console.log(`⏭️ 이미 삭제 처리 중: ${elementId}`);
      return;
    }
    
    const element = this.elementRegistry.get(elementId);
    if (element) {
      console.log(`🗑️ 원격 요소 제거: ${elementId}`);
      this.processingDeletion.add(elementId);
      
      try {
        // 요소가 여전히 존재하는지 재확인
        if (this.elementRegistry.get(elementId)) {
          this.modeling.removeElements([element]);
          console.log(`✅ 요소 제거 완료: ${elementId}`);
        } else {
          console.log(`ℹ️ 요소가 이미 제거됨: ${elementId}`);
        }
      } catch (error) {
        console.error(`❌ 요소 제거 실패: ${elementId}`, error);
        // 에러 발생 시에도 시스템이 계속 작동하도록 함
      } finally {
        // 1초 후 삭제 플래그 해제
        setTimeout(() => {
          this.processingDeletion.delete(elementId);
        }, 1000);
      }
    } else {
      console.log(`ℹ️ 제거할 요소가 존재하지 않음: ${elementId}`);
    }
  }

  /**
   * 모델에서 연결 제거
   */
  removeConnectionFromModel(connectionId) {
    // 이미 삭제 처리 중인 연결은 스킵
    if (this.processingDeletion.has(connectionId)) {
      console.log(`⏭️ 이미 삭제 처리 중: ${connectionId}`);
      return;
    }
    
    const connection = this.elementRegistry.get(connectionId);
    if (connection) {
      console.log(`🗑️ 원격 연결 제거: ${connectionId}`);
      this.processingDeletion.add(connectionId);
      
      try {
        // 연결이 여전히 존재하는지 재확인
        if (this.elementRegistry.get(connectionId)) {
          this.modeling.removeElements([connection]);
          console.log(`✅ 연결 제거 완료: ${connectionId}`);
        } else {
          console.log(`ℹ️ 연결이 이미 제거됨: ${connectionId}`);
        }
      } catch (error) {
        console.error(`❌ 연결 제거 실패: ${connectionId}`, error);
        // 에러 발생 시에도 시스템이 계속 작동하도록 함
      } finally {
        // 1초 후 삭제 플래그 해제
        setTimeout(() => {
          this.processingDeletion.delete(connectionId);
        }, 1000);
      }
    } else {
      console.log(`ℹ️ 제거할 연결이 존재하지 않음: ${connectionId}`);
    }
  }

  /**
   * 요소 생성 (Y.js -> BPMN)
   */
  createElement(elementId, elementData) {
    try {
      // 삭제 처리 중인 요소는 생성하지 않음
      if (this.processingDeletion.has(elementId)) {
        console.log(`⏭️ 삭제 처리 중인 요소는 생성하지 않음 (createElement): ${elementId}`);
        return;
      }
      
      // 이미 존재하는 요소는 생성하지 않음
      const existingElement = this.elementRegistry.get(elementId);
      if (existingElement) {
        console.log(`⏭️ 이미 존재하는 요소는 생성하지 않음: ${elementId}`);
        return;
      }
      
      // 부모 요소 찾기 (기본값: Process_1)
      let parent = this.elementRegistry.get(elementData.parent || 'Process_1');
      
      // 부모가 없으면 루트 요소 찾기
      if (!parent) {
        const rootElements = this.elementRegistry.filter(element => 
          element.type === 'bpmn:Process' || element.type === 'bpmn:Collaboration'
        );
        parent = rootElements[0];
      }
      
      // 여전히 부모가 없으면 생성 포기
      if (!parent) {
        console.warn(`부모 요소를 찾을 수 없음: ${elementData.parent}, 요소 생성 스킵: ${elementId}`);
        return;
      }
      
      const position = { x: elementData.x || 100, y: elementData.y || 100 };
      
      const businessObject = this.bpmnFactory.create(elementData.type, {
        id: elementId,
        name: elementData.businessObject?.name || ''
      });
      
      const newElement = this.elementFactory.createElement('shape', {
        type: elementData.type,
        businessObject: businessObject
      });
      
      console.log(`요소 생성 시도: ${elementId} (parent: ${parent.id})`);
      this.modeling.createShape(newElement, position, parent);
      
    } catch (error) {
      console.error('요소 생성 오류:', error, { elementId, elementData });
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
      // 삭제 처리 중인 연결은 생성하지 않음
      if (this.processingDeletion.has(connectionId)) {
        console.log(`⏭️ 삭제 처리 중인 연결은 생성하지 않음 (createConnection): ${connectionId}`);
        return;
      }
      
      // 이미 생성 처리 중인 연결은 생성하지 않음
      if (this.processingCreation.has(connectionId)) {
        console.log(`⏭️ 이미 생성 처리 중인 연결: ${connectionId}`);
        return;
      }
      
      // 이미 존재하는 연결은 생성하지 않음
      const existingConnection = this.elementRegistry.get(connectionId);
      if (existingConnection) {
        console.log(`⏭️ 이미 존재하는 연결은 생성하지 않음: ${connectionId}`);
        return;
      }
      
      const source = this.elementRegistry.get(connectionData.source);
      const target = this.elementRegistry.get(connectionData.target);
      
      if (!source || !target) {
        console.log(`⏭️ 연결 대상 요소 부재로 생성 스킵: ${connectionId} (source: ${!!source}, target: ${!!target})`);
        return;
      }
      
      // 같은 source-target 사이에 이미 연결이 있는지 확인
      const existingConnections = this.elementRegistry.filter(el => 
        el.type === 'connection' &&
        el.source?.id === connectionData.source &&
        el.target?.id === connectionData.target
      );
      
      if (existingConnections.length > 0) {
        console.log(`⏭️ 같은 방향 연결이 이미 존재: ${connectionData.source} → ${connectionData.target}`);
        return;
      }
      
      // 생성 처리 중 플래그 설정
      this.processingCreation.add(connectionId);
      
      const connection = this.modeling.connect(source, target, {
        type: connectionData.type || 'bpmn:SequenceFlow'
      });
      
      // waypoints 설정
      if (connection && connectionData.waypoints?.length > 0) {
        this.modeling.updateWaypoints(connection, connectionData.waypoints);
      }
      
      console.log(`✅ 연결 생성 완료: ${connectionId}`);
      
      // 생성 완료 후 플래그 해제
      setTimeout(() => {
        this.processingCreation.delete(connectionId);
      }, 1000);
      
    } catch (error) {
      console.error('연결 생성 오류:', error);
      // 에러 발생 시 플래그 해제
      this.processingCreation.delete(connectionId);
    }
  }

  /**
   * 관찰 일시 중단하고 작업 실행 - Y-Quill 패턴
   */
  withoutObserving(fn) {
    this.observing = false;
    try {
      fn();
    } catch (error) {
      console.error('❌ withoutObserving 실행 중 오류:', error);
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