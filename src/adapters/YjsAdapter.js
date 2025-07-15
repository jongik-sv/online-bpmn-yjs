/**
 * Y.js 어댑터
 * Y.js CRDT를 이용한 실시간 동기화 구현
 */

import { BaseAdapter } from './BaseAdapter.js';

export class YjsAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.options = {
      documentName: 'bpmn-collaboration',
      mapName: 'elements',
      enableAwareness: true,
      awarenessTimeout: 30000,
      enableHistory: false,
      batchUpdates: true,
      batchDelay: 100,
      ...config.options
    };
    
    // Y.js 관련 객체들
    this.yjsDoc = null;
    this.yElements = null;
    this.awareness = null;
    this.provider = null;
    
    // 상태 관리
    this.clientId = null;
    this.lastUpdateTime = 0;
    this.pendingUpdates = [];
    this.updateTimer = null;
    
    // 이벤트 리스너들
    this.boundHandlers = {
      onUpdate: this._handleUpdate.bind(this),
      onAwarenessChange: this._handleAwarenessChange.bind(this),
      onProviderStatus: this._handleProviderStatus.bind(this),
      onProviderSync: this._handleProviderSync.bind(this)
    };
  }

  /**
   * Y.js 어댑터 초기화
   * @param {Object} context - { modeler, collaborationProvider, clientId }
   */
  async initialize(context) {
    if (this.isInitialized) {
      throw new Error('YjsAdapter already initialized');
    }

    try {
      this.logger.info('Initializing YjsAdapter');
      
      // 컨텍스트에서 Y.js 문서 가져오기
      this.yjsDoc = context.collaborationProvider;
      this.clientId = context.clientId || this._generateClientId();
      
      if (!this.yjsDoc) {
        throw new Error('Y.js document not provided');
      }

      // Y.js 맵 초기화
      this.yElements = this.yjsDoc.getMap(this.options.mapName);
      
      // 프로바이더 설정 (WebSocket 등)
      await this._setupProvider(context);
      
      // Awareness 설정
      if (this.options.enableAwareness && this.provider?.awareness) {
        this._setupAwareness();
      }
      
      // 이벤트 리스너 등록
      this._setupEventListeners();
      
      // 초기 연결 상태 확인
      this._checkInitialConnection();
      
      this.isInitialized = true;
      this.logger.info('YjsAdapter initialized successfully');
      
    } catch (error) {
      this._handleError(error, 'YjsAdapter initialization');
    }
  }

  /**
   * Diff 전송
   * @param {DocumentDiff} diff - 전송할 Diff
   */
  async sendDiff(diff) {
    if (!this.isInitialized) {
      throw new Error('YjsAdapter not initialized');
    }

    if (!this._validateDiff(diff)) {
      throw new Error('Invalid diff format');
    }

    try {
      // 배치 업데이트 사용
      if (this.options.batchUpdates) {
        this._addToBatch(diff);
      } else {
        await this._sendDiffImmediate(diff);
      }
      
    } catch (error) {
      if (this.config.retryOnError) {
        await this._retry(() => this._sendDiffImmediate(diff), 'sendDiff');
      } else {
        throw error;
      }
    }
  }

  /**
   * 즉시 Diff 전송
   * @private
   */
  async _sendDiffImmediate(diff) {
    const startTime = performance.now();
    
    try {
      // Y.js 트랜잭션으로 원자적 업데이트
      this.yjsDoc.transact(() => {
        // Diff 데이터를 Y.js 맵에 저장
        const diffData = {
          ...diff,
          timestamp: Date.now(),
          clientId: this.clientId
        };
        
        // 압축 적용
        const compressedDiff = this._compressDiff(diffData);
        
        // Y.js 맵에 저장
        this.yElements.set(`diff_${diff.id}`, compressedDiff);
        
        // 메타데이터 업데이트
        this._updateMetadata(diffData);
        
      }, this.clientId); // 클라이언트 ID를 origin으로 설정
      
      const duration = performance.now() - startTime;
      this.logger.debug(`Diff sent in ${duration.toFixed(2)}ms: ${diff.id}`);
      
    } catch (error) {
      this.logger.error('Failed to send diff:', error);
      throw new Error(`Failed to send diff: ${error.message}`);
    }
  }

  /**
   * 배치에 추가
   * @private
   */
  _addToBatch(diff) {
    this.pendingUpdates.push(diff);
    
    // 배치 타이머 설정
    if (!this.updateTimer) {
      this.updateTimer = setTimeout(() => {
        this._flushBatch();
      }, this.options.batchDelay);
    }
  }

  /**
   * 배치 플러시
   * @private
   */
  async _flushBatch() {
    if (this.pendingUpdates.length === 0) return;
    
    const updates = [...this.pendingUpdates];
    this.pendingUpdates = [];
    this.updateTimer = null;
    
    try {
      // 여러 Diff를 하나의 트랜잭션으로 처리
      this.yjsDoc.transact(() => {
        updates.forEach(diff => {
          const diffData = {
            ...diff,
            timestamp: Date.now(),
            clientId: this.clientId
          };
          
          const compressedDiff = this._compressDiff(diffData);
          this.yElements.set(`diff_${diff.id}`, compressedDiff);
        });
        
        // 배치 메타데이터
        this._updateMetadata({
          type: 'batch',
          count: updates.length,
          timestamp: Date.now(),
          clientId: this.clientId
        });
        
      }, this.clientId);
      
      this.logger.debug(`Flushed batch: ${updates.length} diffs`);
      
    } catch (error) {
      this.logger.error('Failed to flush batch:', error);
      // 실패한 업데이트를 다시 큐에 추가
      this.pendingUpdates.unshift(...updates);
    }
  }

  /**
   * 원격 Diff 수신 콜백 등록
   * @param {Function} callback - 수신 콜백 함수
   */
  onRemoteDiff(callback) {
    this.remoteDiffCallback = callback;
  }

  /**
   * Y.js 업데이트 이벤트 처리
   * @private
   */
  _handleUpdate(update, origin, doc, transaction) {
    // 자신이 보낸 업데이트는 무시
    if (origin === this.clientId) {
      return;
    }

    try {
      // 변경된 키들 분석
      const changedKeys = new Set();
      
      transaction.changedParentTypes.forEach((subEvents, type) => {
        if (type === this.yElements) {
          subEvents.forEach(event => {
            event.keys.forEach((change, key) => {
              if (key.startsWith('diff_')) {
                changedKeys.add(key);
              }
            });
          });
        }
      });

      // 새로운 Diff들 처리
      changedKeys.forEach(key => {
        const diffData = this.yElements.get(key);
        if (diffData && diffData.clientId !== this.clientId) {
          this._processRemoteDiff(diffData);
        }
      });

    } catch (error) {
      this.logger.error('Failed to handle Y.js update:', error);
    }
  }

  /**
   * 원격 Diff 처리
   * @private
   */
  _processRemoteDiff(diffData) {
    try {
      // 압축 해제
      const diff = this._decompressDiff(diffData);
      
      // 검증
      if (!this._validateDiff(diff)) {
        this.logger.warn('Invalid remote diff received');
        return;
      }

      // 중복 처리 방지
      if (this._isDuplicateDiff(diff)) {
        this.logger.debug(`Duplicate diff ignored: ${diff.id}`);
        return;
      }

      // 콜백 호출
      if (this.remoteDiffCallback) {
        this.remoteDiffCallback(diff);
      }

      this.logger.debug(`Remote diff processed: ${diff.id} from ${diff.clientId}`);

    } catch (error) {
      this.logger.error('Failed to process remote diff:', error);
    }
  }

  /**
   * 중복 Diff 확인
   * @private
   */
  _isDuplicateDiff(diff) {
    // 간단한 중복 체크 (실제로는 더 정교한 로직 필요)
    const recentTime = Date.now() - 5000; // 5초 이내
    return diff.timestamp < recentTime && diff.timestamp < this.lastUpdateTime;
  }

  /**
   * 프로바이더 설정
   * @private
   */
  async _setupProvider(context) {
    // WebSocket 프로바이더가 이미 설정되어 있는지 확인
    if (context.wsProvider) {
      this.provider = context.wsProvider;
    } else if (this.yjsDoc.share && this.yjsDoc.share.size > 0) {
      // 기존 프로바이더 감지
      this.provider = Array.from(this.yjsDoc.share.values())[0];
    }

    if (this.provider) {
      this.provider.on('status', this.boundHandlers.onProviderStatus);
      this.provider.on('sync', this.boundHandlers.onProviderSync);
      
      // 연결 상태 확인
      if (this.provider.wsconnected !== undefined) {
        this.isConnected = this.provider.wsconnected;
      }
    }
  }

  /**
   * Awareness 설정
   * @private
   */
  _setupAwareness() {
    this.awareness = this.provider.awareness;
    
    if (this.awareness) {
      // 로컬 사용자 정보 설정
      this.awareness.setLocalStateField('user', {
        clientId: this.clientId,
        name: `User-${this.clientId.substring(0, 8)}`,
        color: this._generateUserColor(),
        timestamp: Date.now()
      });

      // Awareness 변경 이벤트
      this.awareness.on('change', this.boundHandlers.onAwarenessChange);
      
      // 주기적 하트비트
      this._startAwarenessHeartbeat();
    }
  }

  /**
   * 이벤트 리스너 설정
   * @private
   */
  _setupEventListeners() {
    // Y.js 문서 업데이트 이벤트
    this.yjsDoc.on('update', this.boundHandlers.onUpdate);
    
    // Y.js 문서 삭제 이벤트 (선택적)
    if (this.options.enableHistory) {
      this.yjsDoc.on('destroy', () => {
        this.logger.info('Y.js document destroyed');
      });
    }
  }

  /**
   * 프로바이더 상태 이벤트 처리
   * @private
   */
  _handleProviderStatus(event) {
    const wasConnected = this.isConnected;
    this.isConnected = event.status === 'connected';
    
    if (wasConnected !== this.isConnected) {
      this._notifyConnectionChange(event.status, {
        provider: this.provider?.constructor?.name,
        url: this.provider?.url
      });
    }
    
    this.logger.info(`Provider status: ${event.status}`);
  }

  /**
   * 프로바이더 동기화 이벤트 처리
   * @private
   */
  _handleProviderSync(isSynced) {
    if (isSynced) {
      this.logger.info('Provider synchronized');
      this._notifyConnectionChange('synced');
    }
  }

  /**
   * Awareness 변경 이벤트 처리
   * @private
   */
  _handleAwarenessChange({ added, updated, removed }) {
    const changes = { added, updated, removed };
    this.logger.debug('Awareness changed:', changes);
    
    // 사용자 목록 업데이트 이벤트 발생 (필요시)
    this._notifyConnectionChange('awareness_changed', { changes });
  }

  /**
   * 초기 연결 상태 확인
   * @private
   */
  _checkInitialConnection() {
    if (this.provider) {
      // WebSocket 프로바이더인 경우
      if (this.provider.wsconnected !== undefined) {
        this.isConnected = this.provider.wsconnected;
      } else {
        // 다른 프로바이더의 경우 연결 상태 추정
        this.isConnected = true;
      }
    } else {
      // 프로바이더가 없으면 로컬 모드
      this.isConnected = false;
    }
    
    this._notifyConnectionChange(
      this.isConnected ? 'connected' : 'disconnected'
    );
  }

  /**
   * 메타데이터 업데이트
   * @private
   */
  _updateMetadata(data) {
    try {
      const metadata = this.yElements.get('_metadata') || {};
      
      metadata.lastUpdate = data.timestamp;
      metadata.lastClient = data.clientId;
      metadata.updateCount = (metadata.updateCount || 0) + 1;
      
      if (data.type === 'batch') {
        metadata.lastBatch = {
          count: data.count,
          timestamp: data.timestamp
        };
      }
      
      this.yElements.set('_metadata', metadata);
      this.lastUpdateTime = data.timestamp;
      
    } catch (error) {
      this.logger.warn('Failed to update metadata:', error);
    }
  }

  /**
   * Awareness 하트비트 시작
   * @private
   */
  _startAwarenessHeartbeat() {
    if (this.awarenessInterval) {
      clearInterval(this.awarenessInterval);
    }
    
    this.awarenessInterval = setInterval(() => {
      if (this.awareness) {
        // 타임스탬프 업데이트로 활성 상태 표시
        const currentUser = this.awareness.getLocalState()?.user;
        if (currentUser) {
          this.awareness.setLocalStateField('user', {
            ...currentUser,
            timestamp: Date.now()
          });
        }
      }
    }, this.options.awarenessTimeout / 3); // 타임아웃의 1/3 간격
  }

  /**
   * 사용자 색상 생성
   * @private
   */
  _generateUserColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
      '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43'
    ];
    
    const hash = this.clientId.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    
    return colors[hash % colors.length];
  }

  /**
   * 클라이언트 ID 생성
   * @private
   */
  _generateClientId() {
    return 'yjs-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 연결된 사용자 목록 조회
   */
  getConnectedUsers() {
    if (!this.awareness) return [];
    
    const users = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (state.user && clientId !== this.awareness.clientID) {
        users.push({
          clientId,
          ...state.user
        });
      }
    });
    
    return users;
  }

  /**
   * 문서 크기 조회
   */
  getDocumentSize() {
    if (!this.yjsDoc) return 0;
    return this.yjsDoc.getUpdateV2().length;
  }

  /**
   * Y.js 상태 벡터 조회
   */
  getStateVector() {
    if (!this.yjsDoc) return null;
    return Array.from(this.yjsDoc.getStateVector());
  }

  /**
   * 통계 정보 조회 (오버라이드)
   */
  getStatistics() {
    const baseStats = super.getStatistics();
    
    return {
      ...baseStats,
      yjsDoc: {
        size: this.getDocumentSize(),
        stateVector: this.getStateVector(),
        elementCount: this.yElements?.size || 0
      },
      awareness: {
        enabled: this.options.enableAwareness,
        connectedUsers: this.getConnectedUsers().length,
        localClientId: this.clientId
      },
      provider: {
        type: this.provider?.constructor?.name || 'none',
        connected: this.isConnected
      },
      batching: {
        enabled: this.options.batchUpdates,
        pendingUpdates: this.pendingUpdates.length,
        batchDelay: this.options.batchDelay
      }
    };
  }

  /**
   * 리소스 정리
   */
  async destroy() {
    this.logger.info('Destroying YjsAdapter');
    
    // 배치 타이머 정리
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Awareness 하트비트 정리
    if (this.awarenessInterval) {
      clearInterval(this.awarenessInterval);
      this.awarenessInterval = null;
    }
    
    // 이벤트 리스너 제거
    if (this.yjsDoc) {
      this.yjsDoc.off('update', this.boundHandlers.onUpdate);
    }
    
    if (this.provider) {
      this.provider.off('status', this.boundHandlers.onProviderStatus);
      this.provider.off('sync', this.boundHandlers.onProviderSync);
    }
    
    if (this.awareness) {
      this.awareness.off('change', this.boundHandlers.onAwarenessChange);
    }
    
    // 대기 중인 배치 플러시
    if (this.pendingUpdates.length > 0) {
      await this._flushBatch();
    }
    
    await super.destroy();
  }
}