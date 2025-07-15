/**
 * DiffSyncEngine 단위 테스트
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { DiffSyncEngine } from '../../src/core/DiffSyncEngine.js';
import { BpmnStateExtractor } from '../../src/extractors/BpmnStateExtractor.js';
import { StandardDiffCalculator } from '../../src/calculators/StandardDiffCalculator.js';
import { BpmnDiffApplicator } from '../../src/applicators/BpmnDiffApplicator.js';
import { YjsAdapter } from '../../src/adapters/YjsAdapter.js';
import { StateManager } from '../../src/core/StateManager.js';

describe('DiffSyncEngine', () => {
  let engine;
  let mockExtractor;
  let mockCalculator;
  let mockApplicator;
  let mockAdapter;
  let mockStateManager;
  let mockContext;

  beforeEach(() => {
    // Mock 구성 요소들
    mockExtractor = {
      extract: async () => ({
        timestamp: Date.now(),
        elements: {},
        version: '1.0.0'
      })
    };

    mockCalculator = {
      calculate: async () => ({
        id: 'diff-123',
        hasChanges: false,
        added: [],
        modified: [],
        removed: []
      })
    };

    mockApplicator = {
      apply: async () => ({
        success: true,
        appliedChanges: { added: 0, modified: 0, removed: 0 },
        errors: []
      })
    };

    mockAdapter = {
      sendDiff: async () => {},
      onRemoteDiff: () => {},
      isConnected: true
    };

    mockStateManager = {
      getLastState: () => null,
      updateState: async () => {},
      getStateHistory: () => []
    };

    mockContext = {
      modeler: {
        get: () => ({})
      },
      collaborationProvider: {},
      clientId: 'test-client'
    };

    engine = new DiffSyncEngine({
      extractor: mockExtractor,
      calculator: mockCalculator,
      applicator: mockApplicator,
      adapter: mockAdapter,
      stateManager: mockStateManager
    });
  });

  afterEach(async () => {
    if (engine.isInitialized) {
      await engine.destroy();
    }
  });

  describe('초기화', () => {
    it('필수 구성 요소들과 함께 초기화되어야 한다', async () => {
      await engine.initialize(mockContext);
      
      assert.strictEqual(engine.isInitialized, true);
      assert.strictEqual(engine.context, mockContext);
    });

    it('구성 요소 누락 시 오류가 발생해야 한다', () => {
      const incompleteEngine = new DiffSyncEngine({
        extractor: mockExtractor
        // calculator, applicator, adapter 누락
      });

      assert.rejects(
        () => incompleteEngine.initialize(mockContext),
        { message: /Required component.*not provided/ }
      );
    });

    it('중복 초기화를 방지해야 한다', async () => {
      await engine.initialize(mockContext);
      
      await assert.rejects(
        () => engine.initialize(mockContext),
        { message: 'DiffSyncEngine already initialized' }
      );
    });
  });

  describe('동기화 실행', () => {
    beforeEach(async () => {
      await engine.initialize(mockContext);
    });

    it('기본 동기화가 성공해야 한다', async () => {
      const result = await engine.sync();
      
      assert.strictEqual(result.success, true);
      assert.ok(result.timestamp);
      assert.ok(result.syncId);
    });

    it('변경사항이 있을 때 diff를 전송해야 한다', async () => {
      let diffSent = false;
      
      mockCalculator.calculate = async () => ({
        id: 'diff-123',
        hasChanges: true,
        added: [{ id: 'element-1', type: 'bpmn:Task' }],
        modified: [],
        removed: []
      });

      mockAdapter.sendDiff = async () => {
        diffSent = true;
      };

      await engine.sync();
      assert.strictEqual(diffSent, true);
    });

    it('변경사항이 없을 때 diff를 전송하지 않아야 한다', async () => {
      let diffSent = false;
      
      mockCalculator.calculate = async () => ({
        id: 'diff-123',
        hasChanges: false,
        added: [],
        modified: [],
        removed: []
      });

      mockAdapter.sendDiff = async () => {
        diffSent = true;
      };

      await engine.sync();
      assert.strictEqual(diffSent, false);
    });
  });

  describe('원격 Diff 처리', () => {
    beforeEach(async () => {
      await engine.initialize(mockContext);
    });

    it('원격 diff를 적용해야 한다', async () => {
      let appliedDiff = null;
      
      mockApplicator.apply = async (diff) => {
        appliedDiff = diff;
        return {
          success: true,
          appliedChanges: { added: 1, modified: 0, removed: 0 },
          errors: []
        };
      };

      const remoteDiff = {
        id: 'remote-diff-123',
        added: [{ id: 'remote-element', type: 'bpmn:Task' }],
        modified: [],
        removed: []
      };

      await engine._handleRemoteDiff(remoteDiff);
      assert.deepStrictEqual(appliedDiff, remoteDiff);
    });

    it('자신이 보낸 diff는 무시해야 한다', async () => {
      let appliedDiff = null;
      
      mockApplicator.apply = async (diff) => {
        appliedDiff = diff;
        return { success: true, appliedChanges: {}, errors: [] };
      };

      const ownDiff = {
        id: 'own-diff-123',
        clientId: 'test-client', // 같은 클라이언트 ID
        added: [],
        modified: [],
        removed: []
      };

      await engine._handleRemoteDiff(ownDiff);
      assert.strictEqual(appliedDiff, null);
    });
  });

  describe('자동 동기화', () => {
    beforeEach(async () => {
      await engine.initialize(mockContext);
    });

    it('자동 동기화를 시작할 수 있어야 한다', () => {
      engine.startAutoSync();
      assert.strictEqual(engine.isAutoSyncRunning, true);
    });

    it('자동 동기화를 중지할 수 있어야 한다', () => {
      engine.startAutoSync();
      engine.stopAutoSync();
      assert.strictEqual(engine.isAutoSyncRunning, false);
    });

    it('자동 동기화 간격을 설정할 수 있어야 한다', () => {
      const customEngine = new DiffSyncEngine({
        extractor: mockExtractor,
        calculator: mockCalculator,
        applicator: mockApplicator,
        adapter: mockAdapter,
        stateManager: mockStateManager,
        syncInterval: 2000
      });

      assert.strictEqual(customEngine.config.syncInterval, 2000);
    });
  });

  describe('오류 처리', () => {
    beforeEach(async () => {
      await engine.initialize(mockContext);
    });

    it('extractor 오류를 처리해야 한다', async () => {
      mockExtractor.extract = async () => {
        throw new Error('Extraction failed');
      };

      const result = await engine.sync();
      assert.strictEqual(result.success, false);
      assert.ok(result.errors.length > 0);
    });

    it('calculator 오류를 처리해야 한다', async () => {
      mockCalculator.calculate = async () => {
        throw new Error('Calculation failed');
      };

      const result = await engine.sync();
      assert.strictEqual(result.success, false);
      assert.ok(result.errors.length > 0);
    });

    it('adapter 오류를 처리해야 한다', async () => {
      mockCalculator.calculate = async () => ({
        id: 'diff-123',
        hasChanges: true,
        added: [],
        modified: [],
        removed: []
      });

      mockAdapter.sendDiff = async () => {
        throw new Error('Send failed');
      };

      const result = await engine.sync();
      assert.strictEqual(result.success, false);
      assert.ok(result.errors.length > 0);
    });
  });

  describe('성능 모니터링', () => {
    beforeEach(async () => {
      await engine.initialize(mockContext);
    });

    it('성능 메트릭스를 수집해야 한다', async () => {
      await engine.sync();
      
      const metrics = engine.getPerformanceMetrics();
      assert.ok(metrics);
      assert.ok(typeof metrics.totalSyncs === 'number');
      assert.ok(typeof metrics.averageSyncTime === 'number');
    });

    it('타이밍 정보를 기록해야 한다', async () => {
      const result = await engine.sync();
      
      assert.ok(result.timing);
      assert.ok(typeof result.timing.extraction === 'number');
      assert.ok(typeof result.timing.calculation === 'number');
      assert.ok(typeof result.timing.total === 'number');
    });
  });

  describe('상태 관리', () => {
    beforeEach(async () => {
      await engine.initialize(mockContext);
    });

    it('상태를 업데이트해야 한다', async () => {
      let updatedState = null;
      
      mockStateManager.updateState = async (state) => {
        updatedState = state;
      };

      await engine.sync();
      assert.ok(updatedState);
    });

    it('상태 히스토리를 조회할 수 있어야 한다', () => {
      mockStateManager.getStateHistory = () => [
        { timestamp: Date.now() - 1000, version: '1.0.0' },
        { timestamp: Date.now(), version: '1.0.1' }
      ];

      const history = engine.getStateHistory();
      assert.strictEqual(history.length, 2);
    });
  });

  describe('리소스 정리', () => {
    it('정상적으로 정리되어야 한다', async () => {
      await engine.initialize(mockContext);
      engine.startAutoSync();
      
      await engine.destroy();
      
      assert.strictEqual(engine.isInitialized, false);
      assert.strictEqual(engine.isAutoSyncRunning, false);
    });

    it('초기화되지 않은 상태에서 destroy 호출 시 문제없어야 한다', async () => {
      await assert.doesNotReject(() => engine.destroy());
    });
  });

  describe('통합 시나리오', () => {
    beforeEach(async () => {
      await engine.initialize(mockContext);
    });

    it('전체 동기화 플로우가 작동해야 한다', async () => {
      // 시나리오: 요소 추가 → 상태 추출 → diff 계산 → 전송
      let extractedState = null;
      let calculatedDiff = null;
      let sentDiff = null;

      mockExtractor.extract = async () => {
        extractedState = {
          timestamp: Date.now(),
          elements: { 'task-1': { id: 'task-1', type: 'bpmn:Task' } },
          version: '1.0.1'
        };
        return extractedState;
      };

      mockCalculator.calculate = async (oldState, newState) => {
        calculatedDiff = {
          id: 'diff-123',
          hasChanges: true,
          added: [{ id: 'task-1', type: 'bpmn:Task' }],
          modified: [],
          removed: []
        };
        return calculatedDiff;
      };

      mockAdapter.sendDiff = async (diff) => {
        sentDiff = diff;
      };

      const result = await engine.sync();

      assert.strictEqual(result.success, true);
      assert.ok(extractedState);
      assert.ok(calculatedDiff);
      assert.ok(sentDiff);
      assert.deepStrictEqual(sentDiff, calculatedDiff);
    });
  });
});