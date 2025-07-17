/**
 * 요소 관리자
 * BPMN 요소 생성, 수정, 삭제 관리
 */
export class ElementManager {
  constructor(bpmnModelerService, yjsSyncService) {
    this.bpmnModelerService = bpmnModelerService;
    this.yjsSyncService = yjsSyncService;
    this.pendingElements = new Map();
    this.tempIdCounter = 0;
    this.connectionRetryCount = new Map();
    this.lastSyncedData = new Map();
  }

  /**
   * 요소 생성
   */
  createElement(elementId, elementData) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');
      const elementFactory = this.bpmnModelerService.getService('elementFactory');
      const bpmnFactory = this.bpmnModelerService.getService('bpmnFactory');

      // 이미 존재하는 요소 확인
      const existingElement = elementRegistry.get(elementId);
      if (existingElement) {
        console.log(`🔄 요소 존재 확인: ${elementId} → 업데이트 처리`);
        return this.updateElement(existingElement, elementData);
      }

      // 부모 요소 찾기
      const parent = elementRegistry.get(elementData.parent || 'Process_1');
      const position = elementData.position || { x: 100, y: 100 };

      // name이 빈 문자열인 경우 제외
      const cleanBusinessObject = {};
      if (elementData.businessObject) {
        Object.keys(elementData.businessObject).forEach(key => {
          if (key === 'name' && elementData.businessObject[key] === '') {
            // name이 빈 문자열이면 제외
            return;
          }
          cleanBusinessObject[key] = elementData.businessObject[key];
        });
      }
      
      const businessObject = bpmnFactory.create(elementData.type, {...cleanBusinessObject, id: elementId});
      const newElement = elementFactory.createElement('shape', {type: elementData.type, businessObject: businessObject});
      const shape = modeling.createShape(newElement, position, parent);

      console.log(`✅ 원격 요소 생성: ${elementId} [타입: ${elementData.type}]`);
      return shape;

    } catch (error) {
      console.error(`❌ 요소 생성 실패 (${elementId}):`, error);
      return null;
    }
  }

  /**
   * 요소 업데이트
   */
  updateElement(element, elementData, isRemote = false) {
    try {
      const modeling = this.bpmnModelerService.getService('modeling');
      let hasChanges = false;

      // 위치 업데이트
      if (elementData.x !== undefined && elementData.y !== undefined) {
        const currentX = element.x || 0;
        const currentY = element.y || 0;
        const deltaX = elementData.x - currentX;
        const deltaY = elementData.y - currentY;

        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          console.log(`🚚 원격 요소 이동: ${element.id} (${currentX}, ${currentY}) → (${elementData.x}, ${elementData.y})`);
          modeling.moveShape(element, { x: deltaX, y: deltaY });
          hasChanges = true;
        }
      }

      // 크기 업데이트
      if (elementData.width !== undefined && elementData.height !== undefined) {
        const currentWidth = element.width || 0;
        const currentHeight = element.height || 0;

        if (Math.abs(elementData.width - currentWidth) > 1 || 
            Math.abs(elementData.height - currentHeight) > 1) {
          const bounds = {
            x: element.x,
            y: element.y,
            width: elementData.width,
            height: elementData.height
          };
          modeling.resizeShape(element, bounds);
          hasChanges = true;
        }
      }

      // businessObject 업데이트
      if (elementData.businessObject && element.businessObject) {
        if (elementData.businessObject.name !== element.businessObject.name) {
          modeling.updateProperties(element, {
            name: elementData.businessObject.name
          });
          hasChanges = true;
        }
      }

      if (hasChanges) {
        console.log(`🔄 요소 업데이트 완료: ${element.id}`);
      }

      return element;

    } catch (error) {
      console.error(`❌ 요소 업데이트 실패 (${element.id}):`, error);
      return null;
    }
  }

  /**
   * 연결 생성
   */
  createConnection(connectionId, connectionData) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');

      // 이미 존재하는 연결 확인
      const existingConnection = elementRegistry.get(connectionId);
      if (existingConnection) {
        console.log(`🔄 연결 존재 확인: ${connectionId} → 업데이트 처리`);
        return this.updateConnection(existingConnection, connectionData);
      }

      // 소스/타겟 요소 확인
      const source = elementRegistry.get(connectionData.source);
      const target = elementRegistry.get(connectionData.target);

      if (!source || !target) {
        console.error(`❌ 연결 대상 요소 부재:`, {
          connectionId,
          sourceId: connectionData.source,
          targetId: connectionData.target,
          sourceFound: !!source,
          targetFound: !!target
        });

        // 재시도 로직
        const retryCount = this.connectionRetryCount.get(connectionId) || 0;
        if (retryCount < 3) {
          this.connectionRetryCount.set(connectionId, retryCount + 1);
          setTimeout(() => {
            console.log(`🔄 연결 생성 재시도 ${retryCount + 1}/3: ${connectionId}`);
            this.createConnection(connectionId, connectionData);
          }, 1000 * (retryCount + 1));
        } else {
          console.error(`❌ 연결 생성 최대 재시도 초과: ${connectionId}`);
          this.connectionRetryCount.delete(connectionId);
        }
        return null;
      }

      console.log(`🔗 연결 생성: ${connectionId} [${source.id} → ${target.id}]`);

      try {
        // elementFactory와 modeling.createConnection을 사용하여 ID를 명시적으로 제어
        const bpmnFactory = this.bpmnModelerService.getService('bpmnFactory');
        const elementFactory = this.bpmnModelerService.getService('elementFactory');

        // BusinessObject 생성 (ID 명시)
        const businessObject = bpmnFactory.create(connectionData.type || 'bpmn:SequenceFlow', {
          id: connectionId, // 요청된 ID를 여기에 명시
          sourceRef: source.businessObject,
          targetRef: target.businessObject,
          ...(connectionData.businessObject || {}) // 기타 businessObject 속성 병합
        });

        // Connection Element 생성 (ID 명시)
        const newConnectionElement = elementFactory.create('connection', {
          id: connectionId, // 요청된 ID를 여기에 명시
          type: connectionData.type || 'bpmn:SequenceFlow',
          businessObject: businessObject,
          source: source,
          target: target,
          waypoints: connectionData.waypoints || [] // 웨이포인트 포함
        });

        // modeling.createConnection을 사용하여 다이어그램에 추가
        const connection = modeling.createConnection(
          source,
          target,
          newConnectionElement,
          source.parent // 연결선이 속할 부모 요소
        );
        
        if (connection) {
          console.log('🎯 연결 성공:', {
            id: connection.id,
            sourceId: connection.source?.id,
            targetId: connection.target?.id,
            hasSourceRef: !!connection.businessObject?.sourceRef,
            hasTargetRef: !!connection.businessObject?.targetRef
          });
          
          // 성공 시 재시도 카운트 정리
          this.connectionRetryCount.delete(connectionId);
        } else {
          console.error('❌ 연결 생성 실패: modeling.createConnection()가 null 반환');
        }
        
        return connection;
      } catch (error) {
        console.error(`❌ 연결 생성 오류1: ${connectionId}`, error);
        return null;
      }
    } catch (error) {
        console.error(`❌ 연결 생성 오류2: ${connectionId}`, error);
        return null;
    }
  }

  /**
   * 연결 업데이트
   */
  updateConnection(connection, connectionData, isRemote = false) {
    try {
      const modeling = this.bpmnModelerService.getService('modeling');

      // 이동 중인 요소와 연결된 연결선은 업데이트 스킵
      if (this.isConnectedElementMoving(connection)) {
        console.log(`⏸️ 연결된 요소가 이동 중: ${connection.id}, 업데이트 스킵`);
        return connection;
      }

      // waypoints 업데이트
      if (connectionData.waypoints && connectionData.waypoints.length > 0) {
        const currentWaypoints = connection.waypoints || [];
        const newWaypoints = connectionData.waypoints;

        console.log(`🔍 연결 waypoints 비교: ${connection.id} [원격: ${isRemote}]`);
        console.log(`  현재: ${currentWaypoints.length}개, 새로운: ${newWaypoints.length}개`);

        if (!this.areWaypointsEqual(currentWaypoints, newWaypoints)) {
          // 원격 업데이트의 경우 더 엄격한 검사
          if (isRemote) {
            // 원격 업데이트는 상당한 차이가 있을 때만 적용
            const hasSignificantChange = this.hasSignificantWaypointChange(currentWaypoints, newWaypoints);
            if (!hasSignificantChange) {
              console.log(`⏭️ 원격 연결 waypoints 차이가 미미함: ${connection.id}, 업데이트 스킵`);
              return connection;
            }
          }

          modeling.updateWaypoints(connection, newWaypoints);
          console.log(`🔄 연결 waypoints 업데이트: ${connection.id} [원격: ${isRemote}]`);
        } else {
          console.log(`✅ 연결 waypoints 동일함: ${connection.id}`);
        }
      }

      return connection;

    } catch (error) {
      console.error(`❌ 연결 업데이트 실패 (${connection.id}):`, error);
      return null;
    }
  }

  /**
   * 요소 제거
   */
  removeElement(elementId) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');

      const element = elementRegistry.get(elementId);
      if (!element) {
        console.log(`🔍 제거할 요소를 찾을 수 없음: ${elementId}`);
        return;
      }

      modeling.removeShape(element);
      console.log(`🗑️ 요소 제거 완료: ${elementId}`);

    } catch (error) {
      console.error(`❌ 요소 제거 실패 (${elementId}):`, error);
    }
  }

  /**
   * 연결 제거
   */
  removeConnection(connectionId) {
    try {
      const elementRegistry = this.bpmnModelerService.getService('elementRegistry');
      const modeling = this.bpmnModelerService.getService('modeling');

      const connection = elementRegistry.get(connectionId);
      if (!connection) {
        console.log(`🔍 제거할 연결을 찾을 수 없음: ${connectionId}`);
        return;
      }

      modeling.removeConnection(connection);
      console.log(`🗑️ 연결 제거 완료: ${connectionId}`);

    } catch (error) {
      console.error(`❌ 연결 제거 실패 (${connectionId}):`, error);
    }
  }

  /**
   * 연결 관계 검증
   */
  verifyConnectionRelationships(connection, connectionId) {
    try {
      const source = connection.source;
      const target = connection.target;
      
      // businessObject 레벨 검증
      const businessObject = connection.businessObject;
      const hasSourceRef = businessObject.sourceRef && businessObject.sourceRef.id === source.id;
      const hasTargetRef = businessObject.targetRef && businessObject.targetRef.id === target.id;
      
      // incoming/outgoing 관계 검증
      const sourceOutgoing = source.businessObject.outgoing || [];
      const targetIncoming = target.businessObject.incoming || [];
      
      const sourceHasOutgoing = sourceOutgoing.some(flow => flow.id === connectionId);
      const targetHasIncoming = targetIncoming.some(flow => flow.id === connectionId);
      
      const verification = {
        connectionId,
        businessObject: {
          hasSourceRef,
          hasTargetRef,
          sourceRefId: businessObject.sourceRef?.id,
          targetRefId: businessObject.targetRef?.id
        },
        relationships: {
          sourceHasOutgoing,
          targetHasIncoming,
          sourceOutgoingIds: sourceOutgoing.map(f => f.id),
          targetIncomingIds: targetIncoming.map(f => f.id)
        }
      };
      
      console.log(`🔍 연결 관계 검증:`, verification);
      
      // 문제 감지
      if (!hasSourceRef || !hasTargetRef) {
        console.warn(`⚠️ businessObject 참조 누락!`, {
          connectionId,
          hasSourceRef,
          hasTargetRef
        });
      }
      
      if (!sourceHasOutgoing || !targetHasIncoming) {
        console.warn(`⚠️ incoming/outgoing 관계 누락!`, {
          connectionId,
          sourceHasOutgoing,
          targetHasIncoming
        });
      }
      
      // 성공 시 로그
      if (hasSourceRef && hasTargetRef && sourceHasOutgoing && targetHasIncoming) {
        console.log(`✅ 연결 관계 검증 성공: ${connectionId}`);
      }
      
      return verification;
      
    } catch (error) {
      console.error(`❌ 연결 관계 검증 오류:`, error);
      return null;
    }
  }

  /**
   * 연결된 요소 이동 여부 확인
   */
  isConnectedElementMoving(connection) {
    // 구현 예정: 이동 중인 요소 추적 로직
    return false;
  }

  /**
   * waypoints 동일성 확인
   */
  areWaypointsEqual(waypoints1, waypoints2) {
    if (waypoints1.length !== waypoints2.length) return false;
    
    for (let i = 0; i < waypoints1.length; i++) {
      const wp1 = waypoints1[i];
      const wp2 = waypoints2[i];
      if (Math.abs(wp1.x - wp2.x) > 1 || Math.abs(wp1.y - wp2.y) > 1) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 원격 연결 업데이트를 위한 상당한 변경 확인
   */
  hasSignificantWaypointChange(currentWaypoints, newWaypoints) {
    if (currentWaypoints.length !== newWaypoints.length) return true;
    
    // 원격 업데이트의 경우 더 큰 임계값 사용하여 미세한 차이 무시
    const threshold = 10; // 10픽셀 이상 차이가 있어야 상당한 변경으로 간주
    
    let significantChanges = 0;
    for (let i = 0; i < currentWaypoints.length; i++) {
      const wp1 = currentWaypoints[i];
      const wp2 = newWaypoints[i];
      if (Math.abs(wp1.x - wp2.x) > threshold || Math.abs(wp1.y - wp2.y) > threshold) {
        significantChanges++;
      }
    }
    
    // 절반 이상의 waypoint에서 상당한 변경이 있어야 업데이트
    return significantChanges >= Math.ceil(currentWaypoints.length / 2);
  }

  /**
   * 임시 ID 생성
   */
  generateTempId() {
    return `temp_${Date.now()}_${++this.tempIdCounter}`;
  }

  /**
   * 대기 중인 요소 관리
   */
  addPendingElement(tempId, finalId) {
    this.pendingElements.set(tempId, finalId);
  }

  getPendingElement(tempId) {
    return this.pendingElements.get(tempId);
  }

  removePendingElement(tempId) {
    this.pendingElements.delete(tempId);
  }

  /**
   * 관리자 정리
   */
  cleanup() {
    this.pendingElements.clear();
    this.connectionRetryCount.clear();
    this.lastSyncedData.clear();
  }
}