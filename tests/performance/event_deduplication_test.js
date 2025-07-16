import { test, describe } from 'node:test';
import assert from 'node:assert';
import UnifiedEventManager from '../../src/utils/UnifiedEventManager.js';

describe('이벤트 중복 방지 성능 테스트', () => {
  test('대량 이벤트 처리 성능 테스트', async () => {
    const manager = new UnifiedEventManager({
      windowMs: 1000,
      queueSize: 100,
      batchDelay: 10,
      enableBatching: true,
      enableConsolidation: true
    });

    let processedCount = 0;
    manager.on('test.performance', () => {
      processedCount++;
    });

    const startTime = Date.now();
    const eventCount = 10000;

    // 10,000개 이벤트 발생 (의도적 중복 포함)
    for (let i = 0; i < eventCount; i++) {
      const eventData = {
        elementId: `element_${i % 50}`, // 50개 요소로 중복 생성
        action: 'update',
        position: {
          x: Math.floor(i / 10) * 5, // 반올림으로 중복 생성
          y: Math.floor(i / 15) * 5
        }
      };
      
      manager.emit('test.performance', eventData);
      
      // 즉시 같은 이벤트 재발생 (중복 테스트)
      if (i % 10 === 0) {
        manager.emit('test.performance', eventData);
      }
    }

    // 모든 배치 처리 완료 대기
    await new Promise(resolve => setTimeout(resolve, 100));
    manager.flushBatch();
    await new Promise(resolve => setTimeout(resolve, 50));

    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    const stats = manager.getStats();
    
    console.log('\n=== 성능 테스트 결과 ===');
    console.log(`처리 시간: ${processingTime}ms`);
    console.log(`전체 이벤트: ${stats.totalEmitted}`);
    console.log(`실제 처리: ${processedCount}`);
    console.log(`중복 필터링: ${stats.duplicatesFiltered}`);
    console.log(`중복률: ${stats.deduplicator.duplicateRate}`);
    console.log(`배치 처리: ${stats.batchesProcessed}`);
    console.log(`통합된 이벤트: ${stats.eventsConsolidated}`);
    console.log(`처리량: ${Math.round(eventCount / processingTime * 1000)} 이벤트/초`);
    
    // 성능 목표 검증
    assert(processingTime < 1000, `처리 시간이 너무 깁니다: ${processingTime}ms`);
    assert(stats.duplicatesFiltered > 0, '중복 필터링이 작동하지 않습니다');
    assert(processedCount < eventCount, '이벤트 통합이 작동하지 않습니다');
    assert(processedCount > 0, '이벤트가 처리되지 않았습니다');
  });

  test('메모리 사용량 테스트', () => {
    const manager = new UnifiedEventManager({
      windowMs: 1000,
      queueSize: 20
    });

    // 큐 크기 제한 테스트
    for (let i = 0; i < 100; i++) {
      manager.emit('test.memory', {
        elementId: `element_${i}`,
        action: 'update',
        data: new Array(1000).fill(0) // 큰 데이터
      });
    }

    const stats = manager.getStats();
    
    console.log('\n=== 메모리 사용량 테스트 ===');
    console.log(`큐 길이: ${stats.deduplicator.queueLength}`);
    console.log(`배치 큐: ${stats.pendingBatchEvents}`);
    
    // 메모리 제한 검증
    assert(stats.deduplicator.queueLength <= 20, '큐 크기 제한이 작동하지 않습니다');
    assert(stats.pendingBatchEvents >= 0, '배치 큐가 음수입니다');
  });

  test('동시성 테스트', async () => {
    const manager = new UnifiedEventManager({
      windowMs: 500,
      queueSize: 50,
      batchDelay: 20
    });

    let processedCount = 0;
    manager.on('test.concurrent', () => {
      processedCount++;
    });

    // 동시에 여러 이벤트 스트림 생성
    const promises = [];
    for (let stream = 0; stream < 5; stream++) {
      promises.push(
        new Promise((resolve) => {
          for (let i = 0; i < 100; i++) {
            setTimeout(() => {
              manager.emit('test.concurrent', {
                elementId: `stream_${stream}_element_${i}`,
                action: 'update',
                streamId: stream
              });
              if (i === 99) resolve();
            }, i);
          }
        })
      );
    }

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 100));
    manager.flushBatch();

    const stats = manager.getStats();
    
    console.log('\n=== 동시성 테스트 결과 ===');
    console.log(`전체 이벤트: ${stats.totalEmitted}`);
    console.log(`실제 처리: ${processedCount}`);
    console.log(`중복률: ${stats.deduplicator.duplicateRate}`);
    
    assert(stats.totalEmitted === 500, '이벤트 개수가 맞지 않습니다');
    assert(processedCount > 0, '이벤트가 처리되지 않았습니다');
  });

  test('시간 윈도우 정확성 테스트', async () => {
    const manager = new UnifiedEventManager({
      windowMs: 100, // 짧은 윈도우
      queueSize: 10,
      enableBatching: false // 즉시 처리
    });

    let processedCount = 0;
    manager.on('test.window', () => {
      processedCount++;
    });

    const eventData = { elementId: 'test', action: 'update' };

    // 첫 번째 이벤트
    manager.emit('test.window', eventData);
    assert.strictEqual(processedCount, 1, '첫 번째 이벤트가 처리되지 않음');

    // 즉시 두 번째 이벤트 (중복이어야 함)
    manager.emit('test.window', eventData);
    assert.strictEqual(processedCount, 1, '중복 이벤트가 필터링되지 않음');

    // 윈도우 시간 대기
    await new Promise(resolve => setTimeout(resolve, 150));

    // 윈도우 만료 후 이벤트
    manager.emit('test.window', eventData);
    assert.strictEqual(processedCount, 2, '윈도우 만료 후 이벤트가 처리되지 않음');

    console.log('\n=== 시간 윈도우 테스트 통과 ===');
  });
});