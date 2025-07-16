import { test, describe } from 'node:test';
import assert from 'node:assert';
import UnifiedEventManager from '../../src/utils/UnifiedEventManager.js';

describe('UnifiedEventManager', () => {
  test('기본값으로 생성되어야 함', () => {
    const manager = new UnifiedEventManager();
    
    assert.strictEqual(manager.batchDelay, 50);
    assert.strictEqual(manager.enableBatching, true);
    assert.strictEqual(manager.enableConsolidation, true);
    assert.deepStrictEqual(manager.batchedEvents, []);
  });

  test('커스텀 옵션으로 생성되어야 함', () => {
    const options = {
      windowMs: 500,
      queueSize: 10,
      batchDelay: 100,
      enableBatching: false,
      enableConsolidation: false
    };
    
    const manager = new UnifiedEventManager(options);
    
    assert.strictEqual(manager.batchDelay, 100);
    assert.strictEqual(manager.enableBatching, false);
    assert.strictEqual(manager.enableConsolidation, false);
  });

  test('이벤트 핸들러 등록 및 제거', () => {
    const manager = new UnifiedEventManager();
    const handler1 = () => {};
    const handler2 = () => {};
    
    // 핸들러 등록
    manager.on('test-event', handler1);
    manager.on('test-event', handler2);
    
    assert.strictEqual(manager.eventHandlers.get('test-event').length, 2);
    
    // 핸들러 제거
    manager.off('test-event', handler1);
    assert.strictEqual(manager.eventHandlers.get('test-event').length, 1);
    
    manager.off('test-event', handler2);
    assert.strictEqual(manager.eventHandlers.has('test-event'), false);
  });

  test('중복 이벤트 필터링', () => {
    const manager = new UnifiedEventManager({ enableBatching: false });
    const eventData = { elementId: 'element1', action: 'update' };
    
    let callCount = 0;
    manager.on('test-event', () => callCount++);
    
    // 첫 번째 이벤트
    const result1 = manager.emit('test-event', eventData);
    assert.strictEqual(result1, true);
    assert.strictEqual(callCount, 1);
    
    // 중복 이벤트
    const result2 = manager.emit('test-event', eventData);
    assert.strictEqual(result2, false);
    assert.strictEqual(callCount, 1); // 호출되지 않음
    
    const stats = manager.getStats();
    assert.strictEqual(stats.totalEmitted, 2);
    assert.strictEqual(stats.duplicatesFiltered, 1);
  });

  test('배치 처리 비활성화 시 즉시 처리', () => {
    const manager = new UnifiedEventManager({ enableBatching: false });
    
    let receivedData = null;
    manager.on('test-event', (data) => {
      receivedData = data;
    });
    
    const eventData = { elementId: 'element1', action: 'update' };
    manager.emit('test-event', eventData);
    
    // 즉시 처리되어야 함
    assert.deepStrictEqual(receivedData, eventData);
  });

  test('배치 처리 및 수동 플러시', () => {
    const manager = new UnifiedEventManager({ batchDelay: 1000 }); // 긴 지연
    
    const receivedEvents = [];
    manager.on('test-event', (data) => {
      receivedEvents.push(data);
    });
    
    // 여러 이벤트 발생
    manager.emit('test-event', { elementId: 'element1', action: 'update' });
    manager.emit('test-event', { elementId: 'element2', action: 'update' });
    
    // 아직 처리되지 않았어야 함
    assert.strictEqual(receivedEvents.length, 0);
    assert.strictEqual(manager.batchedEvents.length, 2);
    
    // 수동 플러시
    manager.flushBatch();
    
    // 이제 처리되었어야 함
    assert.strictEqual(receivedEvents.length, 2);
    assert.strictEqual(manager.batchedEvents.length, 0);
  });

  test('이벤트 통합 기능', () => {
    const manager = new UnifiedEventManager({ 
      batchDelay: 1000,
      enableConsolidation: true 
    });
    
    const receivedEvents = [];
    manager.on('element.move', (data) => {
      receivedEvents.push(data);
    });
    
    // 같은 요소의 연속적인 이동 이벤트
    manager.emit('element.move', { elementId: 'element1', position: { x: 100, y: 100 } });
    manager.emit('element.move', { elementId: 'element1', position: { x: 110, y: 110 } });
    manager.emit('element.move', { elementId: 'element1', position: { x: 120, y: 120 } });
    
    assert.strictEqual(manager.batchedEvents.length, 3);
    
    manager.flushBatch();
    
    // 통합되어 마지막 위치만 처리되어야 함
    assert.strictEqual(receivedEvents.length, 1);
    assert.deepStrictEqual(receivedEvents[0].position, { x: 120, y: 120 });
  });

  test('다른 요소의 이벤트는 통합되지 않음', () => {
    const manager = new UnifiedEventManager({ 
      batchDelay: 1000,
      enableConsolidation: true 
    });
    
    const receivedEvents = [];
    manager.on('element.move', (data) => {
      receivedEvents.push(data);
    });
    
    // 다른 요소들의 이동 이벤트
    manager.emit('element.move', { elementId: 'element1', position: { x: 100, y: 100 } });
    manager.emit('element.move', { elementId: 'element2', position: { x: 200, y: 200 } });
    
    manager.flushBatch();
    
    // 각각 따로 처리되어야 함
    assert.strictEqual(receivedEvents.length, 2);
  });

  test('통합 키 생성 로직', () => {
    const manager = new UnifiedEventManager();
    
    // 위치 이동 이벤트
    const moveEvent = {
      eventType: 'element.move',
      eventData: { elementId: 'element1' }
    };
    const moveKey = manager.generateConsolidationKey(moveEvent);
    assert.strictEqual(moveKey, 'element.move_element1_position');
    
    // 크기 변경 이벤트
    const resizeEvent = {
      eventType: 'element.resize',
      eventData: { elementId: 'element1' }
    };
    const resizeKey = manager.generateConsolidationKey(resizeEvent);
    assert.strictEqual(resizeKey, 'element.resize_element1_size');
    
    // 일반 이벤트
    const updateEvent = {
      eventType: 'element.changed',
      eventData: { elementId: 'element1' }
    };
    const updateKey = manager.generateConsolidationKey(updateEvent);
    assert.strictEqual(updateKey, 'element.changed_element1');
  });

  test('이벤트 핸들러 오류 처리', () => {
    const manager = new UnifiedEventManager({ enableBatching: false });
    
    let errorOccurred = false;
    const originalConsoleError = console.error;
    console.error = () => { errorOccurred = true; };
    
    // 오류를 던지는 핸들러 등록
    manager.on('test-event', () => {
      throw new Error('Test error');
    });
    
    // 정상 핸들러도 등록
    let normalHandlerCalled = false;
    manager.on('test-event', () => {
      normalHandlerCalled = true;
    });
    
    manager.emit('test-event', { elementId: 'element1' });
    
    // 오류가 발생했지만 다른 핸들러는 실행되어야 함
    assert.strictEqual(errorOccurred, true);
    assert.strictEqual(normalHandlerCalled, true);
    
    console.error = originalConsoleError;
  });

  test('설정 업데이트', () => {
    const manager = new UnifiedEventManager();
    
    manager.updateConfig({
      batchDelay: 200,
      enableBatching: false,
      enableConsolidation: false
    });
    
    assert.strictEqual(manager.batchDelay, 200);
    assert.strictEqual(manager.enableBatching, false);
    assert.strictEqual(manager.enableConsolidation, false);
  });

  test('통계 정보 수집', () => {
    const manager = new UnifiedEventManager({ enableBatching: false });
    
    manager.on('test-event', () => {});
    
    const eventData1 = { elementId: 'element1', action: 'update' };
    const eventData2 = { elementId: 'element2', action: 'update' };
    
    manager.emit('test-event', eventData1);
    manager.emit('test-event', eventData1); // 중복
    manager.emit('test-event', eventData2);
    
    const stats = manager.getStats();
    
    assert.strictEqual(stats.totalEmitted, 3);
    assert.strictEqual(stats.duplicatesFiltered, 1);
    assert.strictEqual(stats.registeredEventTypes.length, 1);
    assert.strictEqual(stats.totalHandlers, 1);
  });

  test('상태 초기화', () => {
    const manager = new UnifiedEventManager();
    
    manager.on('test-event', () => {});
    manager.emit('test-event', { elementId: 'element1' });
    
    manager.clear();
    
    const stats = manager.getStats();
    assert.strictEqual(stats.totalEmitted, 0);
    assert.strictEqual(stats.duplicatesFiltered, 0);
    assert.strictEqual(manager.batchedEvents.length, 0);
    
    // 핸들러는 유지되어야 함
    assert.strictEqual(manager.eventHandlers.size, 1);
    
    // 핸들러까지 제거
    manager.clearHandlers();
    assert.strictEqual(manager.eventHandlers.size, 0);
  });
});