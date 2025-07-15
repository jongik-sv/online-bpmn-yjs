/**
 * BpmnDiffSync 단위 테스트
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { BpmnDiffSync } from '../../src/core/BpmnDiffSync.js';
import { Logger } from '../../src/utils/Logger.js';
import { EventBus } from '../../src/utils/EventBus.js';

describe('BpmnDiffSync', () => {
  let diffSync;
  let mockModeler;
  let mockProvider;
  let logger;
  let eventBus;

  beforeEach(() => {
    logger = new Logger({ level: 'error' }); // 테스트 중 로그 최소화
    eventBus = new EventBus();
    
    // Mock BPMN 모델러
    mockModeler = {
      get: (service) => {
        const mockServices = {
          'modeling': {
            createShape: () => ({}),
            removeElements: () => {},
            updateProperties: () => {}
          },
          'elementRegistry': {
            getAll: () => [],
            get: () => null
          },
          'canvas': {
            getRootElement: () => ({ id: 'root' })
          }
        };
        return mockServices[service];
      }
    };

    // Mock 협업 프로바이더
    mockProvider = {
      on: () => {},
      off: () => {},
      awareness: {
        setLocalStateField: () => {},
        on: () => {},
        off: () => {}
      }
    };

    diffSync = new BpmnDiffSync();
  });

  afterEach(async () => {
    if (diffSync.isInitialized) {
      await diffSync.destroy();
    }
  });

  describe('초기화', () => {
    it('기본 설정으로 초기화되어야 한다', () => {
      assert.strictEqual(diffSync.isInitialized, false);
      assert.ok(diffSync.config);
      assert.ok(diffSync.engine);
    });

    it('커스텀 설정으로 초기화되어야 한다', () => {
      const customConfig = {
        syncInterval: 500,
        enablePerformanceMonitoring: false
      };

      const customDiffSync = new BpmnDiffSync(customConfig);
      assert.strictEqual(customDiffSync.config.syncInterval, 500);
      assert.strictEqual(customDiffSync.config.enablePerformanceMonitoring, false);
    });

    it('모델러와 프로바이더로 초기화되어야 한다', async () => {
      await diffSync.initialize(mockModeler, mockProvider);
      
      assert.strictEqual(diffSync.isInitialized, true);
      assert.ok(diffSync.context);
      assert.strictEqual(diffSync.context.modeler, mockModeler);
      assert.strictEqual(diffSync.context.collaborationProvider, mockProvider);
    });

    it('중복 초기화를 방지해야 한다', async () => {
      await diffSync.initialize(mockModeler, mockProvider);
      
      await assert.rejects(
        () => diffSync.initialize(mockModeler, mockProvider),
        { message: 'BpmnDiffSync already initialized' }
      );
    });

    it('필수 인수 없이 초기화하면 오류가 발생해야 한다', async () => {
      await assert.rejects(
        () => diffSync.initialize(),
        { message: 'Modeler and collaboration provider are required' }
      );
    });
  });

  describe('동기화', () => {
    beforeEach(async () => {
      await diffSync.initialize(mockModeler, mockProvider);
    });

    it('수동 동기화가 작동해야 한다', async () => {
      const result = await diffSync.sync();
      
      assert.ok(result);
      assert.strictEqual(typeof result.success, 'boolean');
      assert.ok(result.timestamp);
    });

    it('자동 동기화를 시작할 수 있어야 한다', () => {
      diffSync.startAutoSync();
      assert.strictEqual(diffSync.isAutoSyncRunning, true);
    });

    it('자동 동기화를 중지할 수 있어야 한다', () => {
      diffSync.startAutoSync();
      diffSync.stopAutoSync();
      assert.strictEqual(diffSync.isAutoSyncRunning, false);
    });
  });

  describe('플러그인 관리', () => {
    beforeEach(async () => {
      await diffSync.initialize(mockModeler, mockProvider);
    });

    it('플러그인을 등록할 수 있어야 한다', () => {
      const mockPlugin = {
        name: 'TestPlugin',
        initialize: () => {},
        destroy: () => {}
      };

      diffSync.registerPlugin(mockPlugin);
      
      const plugins = diffSync.getRegisteredPlugins();
      assert.strictEqual(plugins.length, 1);
      assert.strictEqual(plugins[0].name, 'TestPlugin');
    });

    it('플러그인을 제거할 수 있어야 한다', () => {
      const mockPlugin = {
        name: 'TestPlugin',
        initialize: () => {},
        destroy: () => {}
      };

      diffSync.registerPlugin(mockPlugin);
      const removed = diffSync.unregisterPlugin('TestPlugin');
      
      assert.strictEqual(removed, true);
      assert.strictEqual(diffSync.getRegisteredPlugins().length, 0);
    });

    it('존재하지 않는 플러그인 제거는 false를 반환해야 한다', () => {
      const removed = diffSync.unregisterPlugin('NonExistentPlugin');
      assert.strictEqual(removed, false);
    });
  });

  describe('이벤트 처리', () => {
    beforeEach(async () => {
      await diffSync.initialize(mockModeler, mockProvider);
    });

    it('이벤트 리스너를 등록할 수 있어야 한다', () => {
      let eventFired = false;
      
      diffSync.on('sync:completed', () => {
        eventFired = true;
      });

      diffSync.eventBus.emit('sync:completed');
      assert.strictEqual(eventFired, true);
    });

    it('이벤트 리스너를 제거할 수 있어야 한다', () => {
      let eventCount = 0;
      
      const removeListener = diffSync.on('test:event', () => {
        eventCount++;
      });

      diffSync.eventBus.emit('test:event');
      removeListener();
      diffSync.eventBus.emit('test:event');

      assert.strictEqual(eventCount, 1);
    });
  });

  describe('상태 관리', () => {
    beforeEach(async () => {
      await diffSync.initialize(mockModeler, mockProvider);
    });

    it('현재 상태를 조회할 수 있어야 한다', async () => {
      const state = await diffSync.getCurrentState();
      
      assert.ok(state);
      assert.ok(state.timestamp);
      assert.ok(state.elements);
    });

    it('상태 히스토리를 조회할 수 있어야 한다', () => {
      const history = diffSync.getStateHistory();
      assert.ok(Array.isArray(history));
    });

    it('상태를 리셋할 수 있어야 한다', async () => {
      await diffSync.resetState();
      
      const history = diffSync.getStateHistory();
      assert.strictEqual(history.length, 0);
    });
  });

  describe('성능 모니터링', () => {
    beforeEach(async () => {
      await diffSync.initialize(mockModeler, mockProvider, {
        enablePerformanceMonitoring: true
      });
    });

    it('성능 메트릭스를 조회할 수 있어야 한다', () => {
      const metrics = diffSync.getPerformanceMetrics();
      
      assert.ok(metrics);
      assert.ok(typeof metrics.totalSyncs === 'number');
      assert.ok(typeof metrics.averageSyncTime === 'number');
    });

    it('통계를 조회할 수 있어야 한다', () => {
      const stats = diffSync.getStatistics();
      
      assert.ok(stats);
      assert.ok(stats.engine);
      assert.ok(stats.performance);
    });
  });

  describe('오류 처리', () => {
    it('초기화되지 않은 상태에서 sync 호출 시 오류가 발생해야 한다', async () => {
      await assert.rejects(
        () => diffSync.sync(),
        { message: 'BpmnDiffSync not initialized' }
      );
    });

    it('초기화되지 않은 상태에서 getCurrentState 호출 시 오류가 발생해야 한다', async () => {
      await assert.rejects(
        () => diffSync.getCurrentState(),
        { message: 'BpmnDiffSync not initialized' }
      );
    });
  });

  describe('리소스 정리', () => {
    it('destroy가 정상적으로 작동해야 한다', async () => {
      await diffSync.initialize(mockModeler, mockProvider);
      await diffSync.destroy();
      
      assert.strictEqual(diffSync.isInitialized, false);
    });

    it('초기화되지 않은 상태에서 destroy 호출 시 문제없어야 한다', async () => {
      await assert.doesNotReject(() => diffSync.destroy());
    });
  });
});