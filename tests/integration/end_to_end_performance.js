import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * End-to-End 성능 테스트
 * 실제 클라이언트-서버 환경에서의 이벤트 중복 방지 효과 측정
 */
describe('End-to-End 성능 테스트', () => {
  test('이벤트 중복 방지 시스템 벤치마크', async () => {
    console.log('\n=== 이벤트 중복 방지 시스템 벤치마크 ===');
    
    // 테스트 시나리오 정의
    const scenarios = [
      {
        name: '소규모 협업 (2-3명)',
        users: 3,
        eventsPerUser: 100,
        duplicateRate: 0.2
      },
      {
        name: '중간 규모 협업 (5-10명)', 
        users: 8,
        eventsPerUser: 200,
        duplicateRate: 0.3
      },
      {
        name: '대규모 협업 (15명+)',
        users: 15,
        eventsPerUser: 150,
        duplicateRate: 0.4
      }
    ];

    for (const scenario of scenarios) {
      console.log(`\n--- ${scenario.name} ---`);
      
      const results = await simulateCollaborationScenario(scenario);
      
      console.log(`사용자 수: ${scenario.users}`);
      console.log(`총 이벤트: ${results.totalEvents}`);
      console.log(`중복 필터링: ${results.duplicatesFiltered}`);
      console.log(`실제 처리: ${results.eventsProcessed}`);
      console.log(`처리 시간: ${results.processingTime}ms`);
      console.log(`처리량: ${Math.round(results.totalEvents / results.processingTime * 1000)} 이벤트/초`);
      console.log(`효율성: ${(results.duplicatesFiltered / results.totalEvents * 100).toFixed(1)}% 중복 제거`);
      
      // 성능 목표 검증
      assert(results.processingTime < 2000, `처리 시간 초과: ${results.processingTime}ms`);
      assert(results.duplicatesFiltered > 0, '중복 필터링이 작동하지 않습니다');
      assert(results.eventsProcessed > 0, '이벤트가 처리되지 않았습니다');
    }
  });

  test('메모리 효율성 테스트', async () => {
    console.log('\n=== 메모리 효율성 테스트 ===');
    
    const initialMemory = process.memoryUsage();
    
    // 대량 이벤트 시뮬레이션
    const largeScenario = {
      users: 20,
      eventsPerUser: 500,
      duplicateRate: 0.5
    };
    
    const results = await simulateCollaborationScenario(largeScenario);
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024; // MB
    
    console.log(`초기 메모리: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`최종 메모리: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`메모리 증가: ${memoryIncrease.toFixed(2)} MB`);
    console.log(`총 이벤트: ${results.totalEvents}`);
    console.log(`이벤트당 메모리: ${(memoryIncrease * 1024 / results.totalEvents).toFixed(2)} KB`);
    
    // 메모리 효율성 검증
    assert(memoryIncrease < 50, `메모리 사용량이 너무 큽니다: ${memoryIncrease.toFixed(2)} MB`);
    assert(memoryIncrease / results.totalEvents * 1024 < 1, '이벤트당 메모리 사용량이 너무 큽니다');
  });

  test('네트워크 효율성 시뮬레이션', async () => {
    console.log('\n=== 네트워크 효율성 시뮬레이션 ===');
    
    // 네트워크 지연 시뮬레이션을 포함한 시나리오
    const networkScenarios = [
      { name: '빠른 네트워크 (10ms)', latency: 10 },
      { name: '일반 네트워크 (50ms)', latency: 50 },
      { name: '느린 네트워크 (200ms)', latency: 200 }
    ];

    for (const networkScenario of networkScenarios) {
      console.log(`\n--- ${networkScenario.name} ---`);
      
      const scenario = {
        users: 5,
        eventsPerUser: 100,
        duplicateRate: 0.3,
        networkLatency: networkScenario.latency
      };
      
      const results = await simulateNetworkScenario(scenario);
      
      console.log(`네트워크 지연: ${networkScenario.latency}ms`);
      console.log(`총 처리 시간: ${results.totalTime}ms`);
      console.log(`네트워크 오버헤드: ${results.networkOverhead}ms`);
      console.log(`실제 처리 시간: ${results.processingTime}ms`);
      console.log(`효율성 비율: ${(results.processingTime / results.totalTime * 100).toFixed(1)}%`);
      
      // 네트워크 효율성 검증
      assert(results.processingTime < results.totalTime, '처리 시간이 전체 시간을 초과합니다');
    }
  });
});

/**
 * 협업 시나리오 시뮬레이션
 */
async function simulateCollaborationScenario(scenario) {
  const UnifiedEventManager = (await import('../../src/utils/UnifiedEventManager.js')).default;
  
  // 클라이언트별 이벤트 매니저 생성
  const clientManagers = [];
  for (let i = 0; i < scenario.users; i++) {
    clientManagers.push(new UnifiedEventManager({
      windowMs: 1000,
      queueSize: 20,
      batchDelay: 50,
      enableBatching: true,
      enableConsolidation: true
    }));
  }
  
  // 서버 이벤트 매니저
  const serverManager = new UnifiedEventManager({
    windowMs: 1000,
    queueSize: 50,
    batchDelay: 100,
    enableBatching: true,
    enableConsolidation: true
  });

  let totalProcessed = 0;
  let serverProcessed = 0;

  // 이벤트 핸들러 설정
  clientManagers.forEach((manager, index) => {
    manager.on('client.test', () => totalProcessed++);
  });
  
  serverManager.on('server.test', () => serverProcessed++);

  const startTime = Date.now();
  const totalEvents = scenario.users * scenario.eventsPerUser;

  // 동시 이벤트 발생 시뮬레이션
  const promises = clientManagers.map(async (manager, userIndex) => {
    for (let i = 0; i < scenario.eventsPerUser; i++) {
      const eventData = {
        elementId: `element_${i % 20}`, // 20개 요소 순환
        action: 'update',
        userId: userIndex,
        position: {
          x: Math.floor(i / 5) * 10,
          y: Math.floor(i / 7) * 10
        }
      };

      // 클라이언트 이벤트
      manager.emit('client.test', eventData);
      
      // 서버 브로드캐스트 시뮬레이션
      serverManager.emit('server.test', {
        ...eventData,
        sourceUserId: userIndex
      });

      // 의도적 중복 생성
      if (Math.random() < scenario.duplicateRate) {
        manager.emit('client.test', eventData);
        serverManager.emit('server.test', {
          ...eventData,
          sourceUserId: userIndex
        });
      }

      // 이벤트 간 미세한 지연
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
  });

  await Promise.all(promises);
  
  // 모든 배치 처리 완료 대기
  await new Promise(resolve => setTimeout(resolve, 200));
  clientManagers.forEach(manager => manager.flushBatch());
  serverManager.flushBatch();
  await new Promise(resolve => setTimeout(resolve, 100));

  const endTime = Date.now();

  // 통계 수집
  const clientStats = clientManagers.map(manager => manager.getStats());
  const serverStats = serverManager.getStats();

  const totalClientEvents = clientStats.reduce((sum, stats) => sum + stats.totalEmitted, 0);
  const totalClientDuplicates = clientStats.reduce((sum, stats) => sum + stats.duplicatesFiltered, 0);
  
  return {
    totalEvents: totalClientEvents + serverStats.totalEmitted,
    duplicatesFiltered: totalClientDuplicates + serverStats.duplicatesFiltered,
    eventsProcessed: totalProcessed + serverProcessed,
    processingTime: endTime - startTime,
    clientStats,
    serverStats
  };
}

/**
 * 네트워크 시나리오 시뮬레이션
 */
async function simulateNetworkScenario(scenario) {
  const startTime = Date.now();
  
  // 네트워크 지연 시뮬레이션
  const networkOperations = [];
  const totalOperations = scenario.users * scenario.eventsPerUser;
  
  for (let i = 0; i < totalOperations; i++) {
    networkOperations.push(
      new Promise(resolve => 
        setTimeout(resolve, scenario.networkLatency)
      )
    );
  }

  const processingStart = Date.now();
  
  // 실제 처리 시뮬레이션
  const results = await simulateCollaborationScenario({
    users: scenario.users,
    eventsPerUser: scenario.eventsPerUser,
    duplicateRate: scenario.duplicateRate
  });
  
  const processingEnd = Date.now();
  
  // 네트워크 작업 완료 대기
  await Promise.all(networkOperations);
  
  const endTime = Date.now();

  return {
    totalTime: endTime - startTime,
    processingTime: processingEnd - processingStart,
    networkOverhead: (endTime - startTime) - (processingEnd - processingStart),
    ...results
  };
}