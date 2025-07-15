/**
 * Diff 기반 동기화 엔진
 * 핵심 동기화 로직을 담당하는 엔진 클래스
 */

import { EventBus } from '../utils/EventBus.js';
import { StateManager } from './StateManager.js';
import { Logger } from '../utils/Logger.js';
import { ComponentFactory } from '../factories/ComponentFactory.js';

export class DiffSyncEngine {
  constructor(config = {}) {
    this.config = this._mergeDefaultConfig(config);
    this.logger = new Logger(this.config.logging);
    this.eventBus = new EventBus();
    this.stateManager = new StateManager(this.config.state);
    
    // 엔진 상태
    this.isInitialized = false;
    this.isRunning = false;
    this.isPaused = false;
    this.syncIntervalId = null;
    
    // 동기화 컴포넌트
    this.extractor = null;
    this.calculator = null;
    this.applicator = null;
    this.adapter = null;
    
    // 플러그인 시스템
    this.plugins = new Map();
    
    // 성능 메트릭
    this.metrics = {
      sync: {
        cycles: 0,
        totalTime: 0,
        averageTime: 0,
        lastSyncTime: null,
        errors: 0
      },
      extractor: {
        calls: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 0
      },
      calculator: {
        calls: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 0
      },
      applicator: {
        calls: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 0,
        errorRate: 0
      }
    };
    
    this.logger.info('DiffSyncEngine created');
  }

  /**
   * 엔진 초기화
   * @param {Object} context - 초기화 컨텍스트
   */
  async initialize(context) {
    if (this.isInitialized) {
      throw new Error('Engine already initialized');
    }

    this.logger.info('Initializing DiffSyncEngine');
    this.context = context;

    try {
      // 컴포넌트 생성
      await this._createComponents();
      
      // 어댑터 초기화
      await this.adapter.initialize(context);
      
      // 상태 매니저 초기화
      await this.stateManager.initialize(context);
      
      // 플러그인 초기화
      await this._initializePlugins();
      
      // 초기 상태 캡처
      await this._captureInitialState();
      
      this.isInitialized = true;
      this.eventBus.emit('initialized', { engine: this });
      
      this.logger.info('DiffSyncEngine initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize engine:', error);
      throw error;
    }
  }

  /**
   * 동기화 시작
   */
  async start() {
    if (!this.isInitialized) {
      throw new Error('Engine not initialized');
    }

    if (this.isRunning) {
      this.logger.warn('Engine already running');
      return;
    }

    this.logger.info('Starting DiffSyncEngine');

    // 원격 변경 리스너 등록
    this.adapter.onRemoteDiff(this._handleRemoteDiff.bind(this));
    
    // 주기적 동기화 시작
    this._startSyncLoop();
    
    this.isRunning = true;
    this.eventBus.emit('started');
    
    this.logger.info('DiffSyncEngine started');
  }

  /**
   * 동기화 중단
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping DiffSyncEngine');
    
    // 동기화 루프 중단
    this._stopSyncLoop();
    
    this.isRunning = false;
    this.eventBus.emit('stopped');
    
    this.logger.info('DiffSyncEngine stopped');
  }

  /**
   * 동기화 일시 정지
   */
  pause() {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      this.logger.info('DiffSyncEngine paused');
    }
  }

  /**
   * 동기화 재개
   */
  resume() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.logger.info('DiffSyncEngine resumed');
    }
  }

  /**
   * 동기화 간격 변경
   * @param {number} interval - 새로운 간격 (ms)
   */
  setSyncInterval(interval) {
    this.config.syncInterval = interval;
    
    if (this.isRunning) {
      this._stopSyncLoop();
      this._startSyncLoop();
    }
  }

  /**
   * 즉시 동기화 실행
   * @returns {Promise<SyncResult>}
   */
  async sync() {
    if (!this.isInitialized) {
      throw new Error('Engine not initialized');
    }

    if (this.isPaused) {
      return { success: false, reason: 'Engine is paused' };
    }

    try {
      const startTime = performance.now();
      
      // 현재 상태 추출
      const extractStartTime = performance.now();
      const currentState = await this.extractor.extract(this.context);
      const extractTime = performance.now() - extractStartTime;
      
      // 메트릭 업데이트
      this._updateExtractorMetrics(extractTime);
      
      // Diff 계산
      const calcStartTime = performance.now();
      const lastState = this.stateManager.getLastState();
      const diff = await this.calculator.calculate(lastState, currentState);
      const calcTime = performance.now() - calcStartTime;
      
      // 메트릭 업데이트
      this._updateCalculatorMetrics(calcTime);

      if (diff.hasChanges) {
        this.logger.debug(`Local changes detected: +${diff.added.length} ~${diff.modified.length} -${diff.removed.length}`);
        
        // 어댑터를 통해 전송
        await this.adapter.sendDiff(diff);
        
        // 상태 업데이트
        await this.stateManager.updateState(currentState);
        
        const totalTime = performance.now() - startTime;
        
        // 성공 이벤트 발생
        this.eventBus.emit('localSync', { 
          diff, 
          timing: {
            extraction: extractTime,
            calculation: calcTime,
            total: totalTime
          }
        });
        
        // 메트릭 업데이트
        this._updateSyncMetrics(totalTime, true);
        
        this.logger.debug(`Local sync completed in ${totalTime.toFixed(2)}ms`);
        
        return {
          success: true,
          syncId: this._generateSyncId(),
          timestamp: Date.now(),
          appliedChanges: {
            added: diff.added.length,
            modified: diff.modified.length,
            removed: diff.removed.length
          },
          errors: [],
          warnings: [],
          timing: {
            extraction: extractTime,
            calculation: calcTime,
            total: totalTime
          }
        };
      } else {
        // 변경사항 없음
        const totalTime = performance.now() - startTime;
        this._updateSyncMetrics(totalTime, true);
        
        return {
          success: true,
          syncId: this._generateSyncId(),
          timestamp: Date.now(),
          appliedChanges: { added: 0, modified: 0, removed: 0 },
          errors: [],
          warnings: [],
          timing: { extraction: extractTime, calculation: calcTime, total: totalTime }
        };
      }
      
    } catch (error) {
      this.logger.error('Sync failed:', error);
      this._updateSyncMetrics(0, false);
      this.eventBus.emit('syncError', { error, context: 'local_sync' });
      throw error;
    }
  }

  /**
   * 원격 Diff 처리
   * @private
   * @param {DocumentDiff} diff - 원격 Diff
   */
  async _handleRemoteDiff(diff) {
    try {
      const startTime = performance.now();
      
      this.logger.debug(`Remote changes received: +${diff.added.length} ~${diff.modified.length} -${diff.removed.length}`);
      
      // Diff 적용
      const applyStartTime = performance.now();
      const result = await this.applicator.apply(diff, this.context);
      const applyTime = performance.now() - applyStartTime;
      
      // 메트릭 업데이트
      this._updateApplicatorMetrics(applyTime, result.success);

      if (result.success) {
        // 새 상태 캡처 및 저장
        const newState = await this.extractor.extract(this.context);
        await this.stateManager.updateState(newState);
        
        const totalTime = performance.now() - startTime;
        
        this.eventBus.emit('remoteSync', { 
          diff, 
          result, 
          timing: {
            application: applyTime,
            total: totalTime
          }
        });
        
        this.logger.debug(`Remote sync completed in ${totalTime.toFixed(2)}ms`);
      } else {
        this.logger.error('Failed to apply remote diff:', result.errors);
        this.eventBus.emit('remoteSyncError', { diff, result });
      }
      
    } catch (error) {
      this.logger.error('Remote diff handling failed:', error);
      this._updateApplicatorMetrics(0, false);
      this.eventBus.emit('syncError', { error, context: 'remote_diff' });
    }
  }

  /**
   * 동기화 루프 시작
   * @private
   */
  _startSyncLoop() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    this.syncIntervalId = setInterval(async () => {
      if (!this.isPaused) {
        try {
          await this.sync();
        } catch (error) {
          // 에러는 이미 로깅됨
        }
      }
    }, this.config.syncInterval);
  }

  /**
   * 동기화 루프 중단
   * @private
   */
  _stopSyncLoop() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * 컴포넌트 생성
   * @private
   */
  async _createComponents() {
    const factory = new ComponentFactory();
    
    this.extractor = factory.createExtractor(this.config.extractor);
    this.calculator = factory.createCalculator(this.config.calculator);
    this.applicator = factory.createApplicator(this.config.applicator);
    this.adapter = factory.createAdapter(this.config.adapter);
    
    this.logger.debug('Components created');
  }

  /**
   * 플러그인 초기화
   * @private
   */
  async _initializePlugins() {
    const factory = new ComponentFactory();
    
    for (const pluginConfig of this.config.plugins) {
      try {
        const plugin = factory.createPlugin(pluginConfig);
        await plugin.initialize(this);
        this.plugins.set(plugin.name, plugin);
        this.logger.debug(`Plugin initialized: ${plugin.name}`);
      } catch (error) {
        this.logger.error(`Failed to initialize plugin ${pluginConfig.type}:`, error);
      }
    }
  }

  /**
   * 초기 상태 캡처
   * @private
   */
  async _captureInitialState() {
    try {
      const initialState = await this.extractor.extract(this.context);
      await this.stateManager.updateState(initialState);
      this.logger.info(`Initial state captured: ${Object.keys(initialState.elements).length} elements`);
    } catch (error) {
      this.logger.error('Failed to capture initial state:', error);
      throw error;
    }
  }

  /**
   * 설정 업데이트
   * @param {Object} newConfig - 새로운 설정
   */
  updateConfig(newConfig) {
    this.config = this._mergeDefaultConfig({ ...this.config, ...newConfig });
    this.logger.info('Engine configuration updated');
  }

  /**
   * 플러그인 추가
   * @param {Plugin} plugin - 추가할 플러그인
   */
  async addPlugin(plugin) {
    await plugin.initialize(this);
    this.plugins.set(plugin.name, plugin);
    this.logger.info(`Plugin added: ${plugin.name}`);
  }

  /**
   * 플러그인 제거
   * @param {string} pluginName - 제거할 플러그인 이름
   */
  async removePlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      await plugin.destroy();
      this.plugins.delete(pluginName);
      this.logger.info(`Plugin removed: ${pluginName}`);
    }
  }

  /**
   * 플러그인 조회
   * @param {string} pluginName - 플러그인 이름
   * @returns {Plugin|null}
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName) || null;
  }

  /**
   * 플러그인 목록 조회
   * @returns {string[]}
   */
  listPlugins() {
    return Array.from(this.plugins.keys());
  }

  /**
   * 성능 메트릭 조회
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      plugins: Array.from(this.plugins.values())
        .filter(plugin => plugin.getMetrics)
        .reduce((acc, plugin) => {
          acc[plugin.name] = plugin.getMetrics();
          return acc;
        }, {})
    };
  }

  /**
   * 디버그 정보 조회
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      config: this.config,
      currentState: this.stateManager.getCurrentState(),
      metrics: this.getMetrics(),
      plugins: this.listPlugins()
    };
  }

  /**
   * 스냅샷 복원
   * @param {DocumentState} snapshot - 복원할 스냅샷
   */
  async restoreSnapshot(snapshot) {
    await this.stateManager.updateState(snapshot);
    // 복원된 상태를 모델러에 적용하는 로직 필요
    this.logger.info('Snapshot restored');
  }

  /**
   * 강제 리셋
   */
  async reset() {
    this.logger.info('Resetting DiffSyncEngine');
    
    // 상태 초기화
    await this._captureInitialState();
    
    // 메트릭 리셋
    this.metrics = {
      sync: { cycles: 0, totalTime: 0, averageTime: 0, lastSyncTime: null, errors: 0 },
      extractor: { calls: 0, totalTime: 0, averageTime: 0, errors: 0 },
      calculator: { calls: 0, totalTime: 0, averageTime: 0, errors: 0 },
      applicator: { calls: 0, totalTime: 0, averageTime: 0, errors: 0, errorRate: 0 }
    };
    
    this.eventBus.emit('reset');
    this.logger.info('DiffSyncEngine reset completed');
  }

  /**
   * 리소스 정리
   */
  async destroy() {
    this.logger.info('Destroying DiffSyncEngine');
    
    await this.stop();
    
    // 플러그인 정리
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.destroy();
      } catch (error) {
        this.logger.error(`Failed to destroy plugin ${plugin.name}:`, error);
      }
    }
    this.plugins.clear();
    
    // 어댑터 정리
    if (this.adapter) {
      await this.adapter.destroy();
    }
    
    // 이벤트 리스너 정리
    this.eventBus.removeAllListeners();
    
    this.isInitialized = false;
    this.logger.info('DiffSyncEngine destroyed');
  }

  /**
   * 기본 설정과 사용자 설정 병합
   * @private
   */
  _mergeDefaultConfig(userConfig) {
    const defaultConfig = {
      syncInterval: 500,
      maxBatchSize: 100,
      enableOptimization: true,
      extractor: { type: 'BpmnStateExtractor', options: {} },
      calculator: { type: 'StandardDiffCalculator', options: {} },
      applicator: { type: 'BpmnDiffApplicator', options: {} },
      adapter: { type: 'YjsAdapter', options: {} },
      plugins: [],
      logging: { level: 'info' }
    };

    return this._deepMerge(defaultConfig, userConfig);
  }

  /**
   * 깊은 병합
   * @private
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
   * 동기화 메트릭 업데이트
   * @private
   */
  _updateSyncMetrics(time, success) {
    this.metrics.sync.cycles++;
    this.metrics.sync.lastSyncTime = Date.now();
    
    if (success) {
      this.metrics.sync.totalTime += time;
      this.metrics.sync.averageTime = this.metrics.sync.totalTime / this.metrics.sync.cycles;
    } else {
      this.metrics.sync.errors++;
    }
  }

  /**
   * 추출기 메트릭 업데이트
   * @private
   */
  _updateExtractorMetrics(time, success = true) {
    this.metrics.extractor.calls++;
    
    if (success) {
      this.metrics.extractor.totalTime += time;
      this.metrics.extractor.averageTime = this.metrics.extractor.totalTime / this.metrics.extractor.calls;
    } else {
      this.metrics.extractor.errors++;
    }
  }

  /**
   * 계산기 메트릭 업데이트
   * @private
   */
  _updateCalculatorMetrics(time, success = true) {
    this.metrics.calculator.calls++;
    
    if (success) {
      this.metrics.calculator.totalTime += time;
      this.metrics.calculator.averageTime = this.metrics.calculator.totalTime / this.metrics.calculator.calls;
    } else {
      this.metrics.calculator.errors++;
    }
  }

  /**
   * 적용기 메트릭 업데이트
   * @private
   */
  _updateApplicatorMetrics(time, success) {
    this.metrics.applicator.calls++;
    
    if (success) {
      this.metrics.applicator.totalTime += time;
      this.metrics.applicator.averageTime = this.metrics.applicator.totalTime / this.metrics.applicator.calls;
    } else {
      this.metrics.applicator.errors++;
    }
    
    this.metrics.applicator.errorRate = this.metrics.applicator.errors / this.metrics.applicator.calls;
  }

  /**
   * 동기화 ID 생성
   * @private
   */
  _generateSyncId() {
    return 'sync-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}