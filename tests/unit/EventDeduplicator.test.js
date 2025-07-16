import { test, describe } from 'node:test';
import assert from 'node:assert';
import EventDeduplicator from '../../src/utils/EventDeduplicator.js';

describe('EventDeduplicator', () => {
  test('기본값으로 생성되어야 함', () => {
    const dedup = new EventDeduplicator();
    assert.strictEqual(dedup.windowMs, 1000);
    assert.strictEqual(dedup.queueSize, 20);
    assert.deepStrictEqual(dedup.eventQueue, []);
  });

  test('커스텀 값으로 생성되어야 함', () => {
    const dedup = new EventDeduplicator(500, 10);
    assert.strictEqual(dedup.windowMs, 500);
    assert.strictEqual(dedup.queueSize, 10);
  });

  test('첫 번째 이벤트는 중복이 아님', () => {
    const dedup = new EventDeduplicator();
    const eventData = { elementId: 'element1', action: 'update' };
    
    const isDupe = dedup.isDuplicate('element.changed', eventData);
    
    assert.strictEqual(isDupe, false);
    assert.strictEqual(dedup.getStats().totalEvents, 1);
    assert.strictEqual(dedup.getStats().duplicateEvents, 0);
  });

  test('같은 이벤트는 중복으로 감지', () => {
    const dedup = new EventDeduplicator();
    const eventData = { elementId: 'element1', action: 'update' };
    
    dedup.isDuplicate('element.changed', eventData); // 첫 번째
    const isDupe = dedup.isDuplicate('element.changed', eventData); // 두 번째
    
    assert.strictEqual(isDupe, true);
    assert.strictEqual(dedup.getStats().totalEvents, 2);
    assert.strictEqual(dedup.getStats().duplicateEvents, 1);
  });

  test('다른 요소의 같은 액션은 중복이 아님', () => {
    const dedup = new EventDeduplicator();
    const eventData1 = { elementId: 'element1', action: 'update' };
    const eventData2 = { elementId: 'element2', action: 'update' };
    
    const isDupe1 = dedup.isDuplicate('element.changed', eventData1);
    const isDupe2 = dedup.isDuplicate('element.changed', eventData2);
    
    assert.strictEqual(isDupe1, false);
    assert.strictEqual(isDupe2, false);
  });

  test('이벤트 해시 생성 일관성', () => {
    const dedup = new EventDeduplicator();
    const eventData = { elementId: 'element1', action: 'update' };
    
    const hash1 = dedup.generateEventHash('element.changed', eventData);
    const hash2 = dedup.generateEventHash('element.changed', eventData);
    
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(typeof hash1, 'string');
  });

  test('다른 이벤트 타입은 중복이 아님', () => {
    const dedup = new EventDeduplicator();
    const eventData = { elementId: 'element1', action: 'update' };
    
    const isDupe1 = dedup.isDuplicate('element.changed', eventData);
    const isDupe2 = dedup.isDuplicate('element.moved', eventData);
    
    assert.strictEqual(isDupe1, false);
    assert.strictEqual(isDupe2, false);
  });

  test('큐 크기 제한이 작동해야 함', () => {
    const dedup = new EventDeduplicator(1000, 3); // 크기 3 큐
    
    // 5개 이벤트 추가 (큐 크기 초과)
    for (let i = 0; i < 5; i++) {
      dedup.isDuplicate('element.changed', { 
        elementId: `element${i}`, 
        action: 'update' 
      });
    }
    
    assert.strictEqual(dedup.eventQueue.length, 3); // 최대 3개만 유지
  });

  test('통계 정보가 정확해야 함', () => {
    const dedup = new EventDeduplicator();
    const eventData = { elementId: 'element1', action: 'update' };
    
    dedup.isDuplicate('element.changed', eventData); // 첫 번째
    dedup.isDuplicate('element.changed', eventData); // 중복
    dedup.isDuplicate('element.changed', { elementId: 'element2', action: 'update' }); // 새로운
    
    const stats = dedup.getStats();
    assert.strictEqual(stats.totalEvents, 3);
    assert.strictEqual(stats.duplicateEvents, 1);
    assert.strictEqual(stats.queueLength, 2);
    assert.strictEqual(stats.duplicateRate, '33.33%');
  });

  test('큐 초기화가 작동해야 함', () => {
    const dedup = new EventDeduplicator();
    const eventData = { elementId: 'element1', action: 'update' };
    dedup.isDuplicate('element.changed', eventData);
    
    dedup.clear();
    
    const stats = dedup.getStats();
    assert.strictEqual(stats.totalEvents, 0);
    assert.strictEqual(stats.duplicateEvents, 0);
    assert.strictEqual(stats.queueLength, 0);
    assert.strictEqual(dedup.eventQueue.length, 0);
  });
});