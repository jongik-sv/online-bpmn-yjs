/**
 * Y.js 동기화 서비스
 * Y.js 문서 관리 및 실시간 동기화
 */
export class YjsSyncService {
  constructor(clientId = null) {
    // Y.js 라이브러리 확인
    if (!window.Y || !window.Y.Doc) {
      console.error('Y.js 라이브러리가 로드되지 않았습니다. window.Y:', window.Y);
      throw new Error('Y.js 라이브러리가 로드되지 않았습니다.');
    }
    
    this.yjsDoc = new window.Y.Doc();
    this.yProvider = null;
    this.yElements = this.yjsDoc.getMap('elements');
    this.yConnections = this.yjsDoc.getMap('connections');
    this.yMetadata = this.yjsDoc.getMap('metadata');
    this.syncCount = 0;
    this.clientId = clientId || this.generateClientId();
    this.lastSyncedData = new Map(); // 마지막 동기화 데이터 캐시 (중복 방지)
  }

  /**
   * 클라이언트 ID 생성
   */
  generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Y.js 초기화
   */
  initializeYjs() {
    try {
      // Y.js 이벤트 리스너 설정 (Map의 경우 observe 사용)
      this.yElements.observe(this.handleYjsElementsChange.bind(this));
      this.yConnections.observe(this.handleYjsConnectionsChange.bind(this));
      this.yMetadata.observe(this.handleYjsMetadataChange.bind(this));
      this.yjsDoc.on('update', this.handleYjsDocumentUpdate.bind(this));

      // Note: observeDeep already handles all changes, direct observe removed to prevent duplicates

      console.log('✅ Y.js 초기화 완료');
    } catch (error) {
      console.error('❌ Y.js 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * Y.js Provider 초기화
   */
  async initializeYjsProvider(wsUrl, documentId) {
    try {
      if (this.yProvider) {
        this.yProvider.disconnect();
      }

      // WebsocketProvider 확인
      if (!window.WebsocketProvider && !window.Y.WebsocketProvider) {
        console.error('WebsocketProvider를 찾을 수 없습니다:', {
          'window.WebsocketProvider': window.WebsocketProvider,
          'window.Y.WebsocketProvider': window.Y.WebsocketProvider
        });
        throw new Error('WebsocketProvider가 로드되지 않았습니다.');
      }

      // WebsocketProvider 생성자 확인
      const WebsocketProvider = window.WebsocketProvider || window.Y.WebsocketProvider;
      console.log('WebsocketProvider 확인:', WebsocketProvider);

      this.yProvider = new WebsocketProvider(wsUrl, documentId, this.yjsDoc, {
        connect: true,
        resyncInterval: 5000,
        maxBackoffTime: 5000
      });

      // Provider 이벤트 리스너
      this.yProvider.on('status', this.handleProviderStatus.bind(this));
      this.yProvider.on('sync', this.handleProviderSync.bind(this));

      console.log('✅ Y.js Provider 초기화 완료');
      return this.yProvider;
    } catch (error) {
      console.error('❌ Y.js Provider 초기화 실패:', error);
      throw error;
    }
  }

  /**
   * Y.js Elements 변경 처리 (demo-original.js 방식)
   */
  handleYjsElementsChange(event) {
    // 로컬 변경으로 인한 Y.js 업데이트는 무시 (자신의 변경사항은 이미 로컬에 적용됨)
    const origin = event.transaction.origin;
    if (origin === this.clientId) {
      console.log('로컬 변경으로 인한 Y.js 요소 이벤트 무시', { 
        origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
        clientId: this.clientId 
      });
      return;
    }
    
    // WebSocketProvider가 origin인 경우는 원격 변경사항이므로 처리
    console.log('Y.js 요소 변경 처리', {
      origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
      isProvider: origin === this.yProvider
    });
    
    event.changes.keys.forEach((change, key) => {
      if (change.action === 'add' || change.action === 'update') {
        const elementData = this.yElements.get(key);
        this.applyElementChange?.(key, elementData);
      } else if (change.action === 'delete') {
        this.removeElement?.(key);
      }
    });
  }

  /**
   * Y.js Connections 변경 처리 (demo-original.js 방식)
   */
  handleYjsConnectionsChange(event) {
    // 로컬 변경으로 인한 Y.js 업데이트는 무시 (자신의 변경사항은 이미 로컬에 적용됨)
    const origin = event.transaction.origin;
    if (origin === this.clientId) {
      console.log('로컬 변경으로 인한 Y.js 연결 이벤트 무시', { 
        origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
        clientId: this.clientId 
      });
      return;
    }
    
    // WebSocketProvider가 origin인 경우는 원격 변경사항이므로 처리
    console.log('Y.js 연결 변경 처리', {
      origin: typeof origin === 'string' ? origin : origin?.constructor?.name,
      isProvider: origin === this.yProvider
    });

    event.changes.keys.forEach((change, key) => {
      if (change.action === 'add' || change.action === 'update') {
        const connectionData = this.yConnections.get(key);
        this.applyConnectionChange?.(key, connectionData);
      } else if (change.action === 'delete') {
        this.removeConnection?.(key);
      }
    });
  }


  /**
   * Y.js Metadata 변경 처리
   */
  handleYjsMetadataChange(event) {
    this.onMetadataChange?.(event);
  }

  /**
   * Y.js 문서 업데이트 처리
   */
  handleYjsDocumentUpdate(update) {
    this.syncCount++;
    this.onDocumentUpdate?.(update);
  }

  /**
   * Provider 상태 변경 처리
   */
  handleProviderStatus(event) {
    console.log('Y.js Provider 상태:', event.status);
    this.onProviderStatusChange?.(event.status);
  }

  /**
   * Provider 동기화 완료 처리
   */
  handleProviderSync(synced) {
    console.log('Y.js Provider 동기화:', synced);
    this.onProviderSync?.(synced);
  }

  /**
   * 요소를 Y.js에 동기화
   */
  syncElementToYjs(element) {
    try {
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
        lastModified: Date.now()
      };

      console.log(`📤 Y.js 동기화 데이터: ${element.id} [위치: (${elementData.x}, ${elementData.y}), 크기: ${this.yElements.size}]`);

      // 기존 데이터와 비교
      const existingData = this.yElements.get(element.id);
      console.log(`📋 기존 데이터: ${element.id} [위치: (${existingData?.x || 0}, ${existingData?.y || 0})]`);
      
      // 트랜잭션으로 감싸서 origin 설정
      this.yjsDoc.transact(() => {
        this.yElements.set(element.id, elementData);
      }, this.clientId);
      
      console.log(`📤 요소 Y.js 동기화 완료: ${element.id}, 새로운_크기: ${this.yElements.size}`);
      
      // 동기화 후 확인
      const storedData = this.yElements.get(element.id);
      console.log(`✅ 저장된 데이터 확인: ${element.id} [위치: (${storedData?.x || 0}, ${storedData?.y || 0})]`);
      
    } catch (error) {
      console.error('요소 Y.js 동기화 실패:', error);
    }
  }

  /**
   * 연결을 Y.js에 동기화
   */
  syncConnectionToYjs(connection) {
    try {
      const connectionData = {
        type: connection.type,
        source: connection.source?.id,
        target: connection.target?.id,
        // businessObject는 기본 정보만 저장 (BPMN.js 내부 객체 구조 제외)
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

      // 기존 데이터와 비교하여 실제로 변경된 경우만 동기화
      const existingData = this.yConnections.get(connection.id);
      if (existingData && this.areConnectionsEqual(existingData, connectionData)) {
        console.log(`⏭️ 연결 데이터 동일함: ${connection.id}, 동기화 스킵`);
        return;
      }

      console.log(`📤 연결 Y.js 동기화 데이터: ${connection.id} [waypoints: ${connectionData.waypoints.length}개]`);

      // 트랜잭션으로 감싸서 origin 설정
      this.yjsDoc.transact(() => {
        this.yConnections.set(connection.id, connectionData);
      }, this.clientId);
      console.log(`📤 연결 Y.js 동기화 완료: ${connection.id}`);
    } catch (error) {
      console.error('연결 Y.js 동기화 실패:', error);
    }
  }

  /**
   * Y.js에서 요소 제거
   */
  removeElementFromYjs(elementId) {
    try {
      // 트랜잭션으로 감싸서 origin 설정
      this.yjsDoc.transact(() => {
        this.yElements.delete(elementId);
      }, this.clientId);
      console.log(`🗑️ 요소 Y.js에서 제거: ${elementId}`);
    } catch (error) {
      console.error('요소 Y.js 제거 실패:', error);
    }
  }

  /**
   * Y.js에서 연결 제거
   */
  removeConnectionFromYjs(connectionId) {
    try {
      // 트랜잭션으로 감싸서 origin 설정
      this.yjsDoc.transact(() => {
        this.yConnections.delete(connectionId);
      }, this.clientId);
      console.log(`🗑️ 연결 Y.js에서 제거: ${connectionId}`);
    } catch (error) {
      console.error('연결 Y.js 제거 실패:', error);
    }
  }


  /**
   * Y.js 문서 가져오기
   */
  getDocument() {
    return this.yjsDoc;
  }

  /**
   * Y.js 맵 가져오기
   */
  getElements() {
    return this.yElements;
  }

  getConnections() {
    return this.yConnections;
  }

  getMetadata() {
    return this.yMetadata;
  }

  /**
   * 연결 데이터 비교
   */
  areConnectionsEqual(conn1, conn2) {
    if (!conn1 || !conn2) return false;
    
    // 기본 속성 비교
    if (conn1.type !== conn2.type || 
        conn1.source !== conn2.source || 
        conn1.target !== conn2.target) {
      return false;
    }

    // waypoints 비교
    if (!conn1.waypoints || !conn2.waypoints) {
      return !conn1.waypoints && !conn2.waypoints;
    }

    if (conn1.waypoints.length !== conn2.waypoints.length) {
      return false;
    }

    for (let i = 0; i < conn1.waypoints.length; i++) {
      const wp1 = conn1.waypoints[i];
      const wp2 = conn2.waypoints[i];
      
      // 1픽셀 차이까지는 동일한 것으로 간주
      if (Math.abs(wp1.x - wp2.x) > 1 || Math.abs(wp1.y - wp2.y) > 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * 이벤트 핸들러 설정
   */
  setEventHandlers({
    applyElementChange,
    removeElement,
    applyConnectionChange,
    removeConnection,
    onMetadataChange,
    onDocumentUpdate,
    onProviderStatusChange,
    onProviderSync
  }) {
    this.applyElementChange = applyElementChange;
    this.removeElement = removeElement;
    this.applyConnectionChange = applyConnectionChange;
    this.removeConnection = removeConnection;
    this.onMetadataChange = onMetadataChange;
    this.onDocumentUpdate = onDocumentUpdate;
    this.onProviderStatusChange = onProviderStatusChange;
    this.onProviderSync = onProviderSync;
  }

  /**
   * 서비스 종료
   */
  destroy() {
    if (this.yProvider) {
      this.yProvider.disconnect();
      this.yProvider = null;
    }
    if (this.yjsDoc) {
      this.yjsDoc.destroy();
    }
  }
}