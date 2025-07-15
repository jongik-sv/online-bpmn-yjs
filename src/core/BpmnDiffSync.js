/**
 * BPMN Diff 기반 실시간 협업 동기화 시스템
 * 메인 API 클래스
 */

import { DiffSyncEngine } from './DiffSyncEngine.js';
import { Logger } from '../utils/Logger.js';

export class BpmnDiffSync {
  constructor(options = {}) {
    this.options = this._validateAndMergeOptions(options);
    this.engine = new DiffSyncEngine(this.options.engine);
    this.logger = new Logger(this.options.logging);
    this.isInitialized = false;
    
    this.logger.info('BpmnDiffSync instance created');
  }

  /**
   * BPMN.js 모델러와 Y.js 문서로 초기화
   * @param {Object} modeler - BPMN.js 모델러 인스턴스
   * @param {Object} collaborationProvider - Y.js 문서 또는 협업 제공자
   * @param {Object} options - 초기화 옵션
   * @returns {Promise<BpmnDiffSync>}
   */
  async initialize(modeler, collaborationProvider, options = {}) {
    if (this.isInitialized) {
      throw new Error('BpmnDiffSync already initialized');
    }

    this.logger.info('Initializing BpmnDiffSync');

    try {
      const context = {
        modeler,
        collaborationProvider,
        clientId: options.clientId || this._generateClientId(),
        ...options
      };

      // 엔진 초기화
      await this.engine.initialize(context);
      
      this.isInitialized = true;
      this.logger.info('BpmnDiffSync initialized successfully');
      
      return this;
    } catch (error) {
      this.logger.error('Failed to initialize BpmnDiffSync:', error);
      throw error;
    }
  }

  /**
   * 동기화 시작
   * @returns {Promise<void>}
   */
  async start() {
    this._ensureInitialized();
    await this.engine.start();
    this.logger.info('BpmnDiffSync started');
  }

  /**
   * 동기화 중단
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.isInitialized) {
      await this.engine.stop();
      this.logger.info('BpmnDiffSync stopped');
    }
  }

  /**
   * 이벤트 리스너 등록
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 콜백 함수
   * @returns {Function} - 제거 함수
   */
  on(event, callback) {
    this._ensureInitialized();
    return this.engine.eventBus.on(event, callback);
  }

  /**
   * 이벤트 리스너 제거
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 콜백 함수
   */
  off(event, callback) {
    if (this.isInitialized) {
      this.engine.eventBus.off(event, callback);
    }
  }

  /**
   * 일회성 이벤트 리스너 등록
   * @param {string} event - 이벤트 이름
   * @param {Function} callback - 콜백 함수
   * @returns {Function} - 제거 함수
   */
  once(event, callback) {
    this._ensureInitialized();
    return this.engine.eventBus.once(event, callback);
  }

  /**
   * 즉시 동기화 실행
   * @returns {Promise<SyncResult>}
   */
  async sync() {
    this._ensureInitialized();
    return this.engine.sync();
  }

  /**
   * 동기화 일시 정지
   */
  pause() {
    if (this.isInitialized) {
      this.engine.pause();
      this.logger.info('BpmnDiffSync paused');
    }
  }

  /**
   * 동기화 재개
   */
  resume() {
    if (this.isInitialized) {
      this.engine.resume();
      this.logger.info('BpmnDiffSync resumed');
    }
  }

  /**
   * 동기화 간격 변경
   * @param {number} interval - 새로운 간격 (ms)
   */
  setSyncInterval(interval) {
    this._ensureInitialized();
    this.engine.setSyncInterval(interval);
    this.logger.info(`Sync interval changed to ${interval}ms`);
  }

  /**
   * 현재 상태 스냅샷 생성
   * @returns {DocumentState}
   */
  createSnapshot() {
    this._ensureInitialized();
    return this.engine.stateManager.getCurrentState();
  }

  /**
   * 상태 스냅샷 복원
   * @param {DocumentState} snapshot - 복원할 스냅샷
   * @returns {Promise<void>}
   */
  async restoreSnapshot(snapshot) {
    this._ensureInitialized();
    await this.engine.restoreSnapshot(snapshot);
    this.logger.info('Snapshot restored');
  }

  /**
   * 현재 설정 조회
   * @returns {DiffSyncConfig}
   */
  getConfig() {
    return this.options;
  }

  /**
   * 설정 업데이트
   * @param {Partial<DiffSyncConfig>} newConfig - 새로운 설정
   */
  updateConfig(newConfig) {
    this.options = this._validateAndMergeOptions({
      ...this.options,
      ...newConfig
    });
    
    if (this.isInitialized) {
      this.engine.updateConfig(this.options.engine);
    }
    
    this.logger.info('Configuration updated');
  }

  /**
   * 플러그인 추가
   * @param {Plugin} plugin - 추가할 플러그인
   */
  addPlugin(plugin) {
    this._ensureInitialized();
    this.engine.addPlugin(plugin);
    this.logger.info(`Plugin added: ${plugin.name}`);
  }

  /**
   * 플러그인 제거
   * @param {string} pluginName - 제거할 플러그인 이름
   */
  removePlugin(pluginName) {
    if (this.isInitialized) {
      this.engine.removePlugin(pluginName);
      this.logger.info(`Plugin removed: ${pluginName}`);
    }
  }

  /**
   * 플러그인 조회
   * @param {string} pluginName - 플러그인 이름
   * @returns {Plugin|null}
   */
  getPlugin(pluginName) {
    return this.isInitialized ? this.engine.getPlugin(pluginName) : null;
  }

  /**
   * 플러그인 목록 조회
   * @returns {string[]}
   */
  listPlugins() {
    return this.isInitialized ? this.engine.listPlugins() : [];
  }

  /**
   * 성능 메트릭 조회
   * @returns {PerformanceMetrics}
   */
  getMetrics() {
    return this.isInitialized ? this.engine.getMetrics() : null;
  }

  /**
   * 디버그 정보 조회
   * @returns {DebugInfo}
   */
  getDebugInfo() {
    return this.isInitialized ? this.engine.getDebugInfo() : null;
  }

  /**
   * 로그 내역 내보내기
   * @returns {LogEntry[]}
   */
  exportLogs() {
    return this.logger.exportLogs();
  }

  /**
   * 강제 상태 리셋
   * @returns {Promise<void>}
   */
  async reset() {
    this._ensureInitialized();
    await this.engine.reset();
    this.logger.info('BpmnDiffSync reset');
  }

  /**
   * 리소스 정리 및 종료
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.isInitialized) {
      this.logger.info('Destroying BpmnDiffSync');
      
      await this.engine.destroy();
      this.isInitialized = false;
      
      this.logger.info('BpmnDiffSync destroyed');
    }
  }

  /**
   * 초기화 여부 확인
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('BpmnDiffSync not initialized. Call initialize() first.');
    }
  }

  /**
   * 설정 옵션 검증 및 병합
   * @private
   * @param {Object} userOptions - 사용자 설정
   * @returns {DiffSyncConfig}
   */
  _validateAndMergeOptions(userOptions) {
    const defaultOptions = {
      // 엔진 설정
      engine: {
        syncInterval: 500,
        maxBatchSize: 100,
        enableOptimization: true,
        autoStart: true
      },
      
      // 상태 추출 설정
      extractor: {
        type: 'BpmnStateExtractor',
        options: {
          includeMetadata: true,
          positionPrecision: 0,
          excludeLabels: true,
          excludeTypes: [],
          customProperties: []
        }
      },
      
      // Diff 계산 설정
      calculator: {
        type: 'StandardDiffCalculator',
        options: {
          positionTolerance: 0.5,
          enableOptimization: true,
          ignoreMinorChanges: true,
          batchThreshold: 10
        }
      },
      
      // Diff 적용 설정
      applicator: {
        type: 'BpmnDiffApplicator',
        options: {
          validateBeforeApply: true,
          rollbackOnError: true,
          batchSize: 50,
          applyTimeout: 5000
        }
      },
      
      // 어댑터 설정
      adapter: {
        type: 'YjsAdapter',
        options: {
          enableCompression: false,
          retryOnError: true,
          maxRetries: 3,
          retryDelay: 1000
        }
      },
      
      // 플러그인 설정
      plugins: [
        {
          type: 'PerformanceMonitor',
          options: {
            slowSyncThreshold: 100,
            enableMetrics: true
          }
        }
      ],
      
      // 로깅 설정
      logging: {
        level: 'info',
        enableConsole: true,
        enableRemote: false,
        maxLogEntries: 1000
      }
    };

    return this._deepMerge(defaultOptions, userOptions);
  }

  /**
   * 깊은 병합
   * @private
   * @param {Object} target - 대상 객체
   * @param {Object} source - 소스 객체
   * @returns {Object}
   */
  _deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * 클라이언트 ID 생성
   * @private
   * @returns {string}
   */
  _generateClientId() {
    return 'client-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}