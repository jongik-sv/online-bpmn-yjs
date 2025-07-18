/**
 * Silent Update Service 기본 테스트
 * 
 * 이 파일은 SilentUpdateService의 기본 동작을 테스트하기 위한 예제입니다.
 * 브라우저 콘솔에서 실행하여 Silent Update가 제대로 동작하는지 확인할 수 있습니다.
 */

// 테스트용 함수들
window.testSilentUpdate = {
  
  /**
   * SilentUpdateService 초기화 테스트
   */
  initTest: function(modeler) {
    console.log('=== Silent Update Service 초기화 테스트 ===');
    
    try {
      const silentUpdater = new window.SilentUpdateService(modeler);
      console.log('✅ SilentUpdateService 초기화 성공');
      return silentUpdater;
    } catch (error) {
      console.error('❌ SilentUpdateService 초기화 실패:', error);
      return null;
    }
  },

  /**
   * BusinessObject 업데이트 테스트
   */
  testBusinessObjectUpdate: function(modeler, silentUpdater) {
    console.log('=== BusinessObject 업데이트 테스트 ===');
    
    const elementRegistry = modeler.get('elementRegistry');
    const elements = elementRegistry.getAll();
    
    // 첫 번째 Task 찾기
    const task = elements.find(el => el.businessObject.$type === 'bpmn:Task');
    
    if (!task) {
      console.warn('⚠️ 테스트할 Task가 없습니다. BPMN 다이어그램에 Task를 추가해주세요.');
      return false;
    }

    const originalName = task.businessObject.name || '';
    const testName = 'Silent Update Test - ' + Date.now();
    
    console.log('대상 요소:', task.id);
    console.log('원본 이름:', originalName);
    console.log('테스트 이름:', testName);
    
    // 이벤트 리스너 설정 (이벤트가 발생하면 안됨)
    let eventFired = false;
    const eventListener = () => { eventFired = true; };
    modeler.on('element.changed', eventListener);
    
    try {
      // Silent Update 실행
      const result = silentUpdater.updateBusinessObject(task.id, { name: testName });
      
      // 잠시 대기 후 이벤트 발생 확인
      setTimeout(() => {
        if (eventFired) {
          console.error('❌ 이벤트가 발생했습니다! Silent Update가 제대로 동작하지 않습니다.');
        } else {
          console.log('✅ 이벤트 발생 없이 업데이트 완료');
        }
        
        // 실제 업데이트 확인
        const updatedElement = elementRegistry.get(task.id);
        if (updatedElement.businessObject.name === testName) {
          console.log('✅ BusinessObject 업데이트 성공');
        } else {
          console.error('❌ BusinessObject 업데이트 실패');
        }
        
        // 이벤트 리스너 제거
        modeler.off('element.changed', eventListener);
        
        // 원본 이름으로 복구
        silentUpdater.updateBusinessObject(task.id, { name: originalName });
      }, 100);
      
      return true;
    } catch (error) {
      console.error('❌ BusinessObject 업데이트 중 오류:', error);
      modeler.off('element.changed', eventListener);
      return false;
    }
  },

  /**
   * Visual Properties 업데이트 테스트
   */
  testVisualUpdate: function(modeler, silentUpdater) {
    console.log('=== Visual Properties 업데이트 테스트 ===');
    
    const elementRegistry = modeler.get('elementRegistry');
    const elements = elementRegistry.getAll();
    
    // 첫 번째 Shape 찾기
    const shape = elements.find(el => el.type === 'bpmn:Task' || el.type === 'bpmn:StartEvent');
    
    if (!shape) {
      console.warn('⚠️ 테스트할 Shape가 없습니다.');
      return false;
    }

    const originalX = shape.x;
    const originalY = shape.y;
    const testX = originalX + 50;
    const testY = originalY + 50;
    
    console.log('대상 요소:', shape.id);
    console.log('원본 위치:', originalX, originalY);
    console.log('테스트 위치:', testX, testY);
    
    // 이벤트 리스너 설정
    let eventFired = false;
    const eventListener = () => { eventFired = true; };
    modeler.on('element.changed', eventListener);
    
    try {
      // Silent Update 실행
      const result = silentUpdater.updateVisualProperties(shape.id, { x: testX, y: testY });
      
      setTimeout(() => {
        if (eventFired) {
          console.error('❌ 이벤트가 발생했습니다!');
        } else {
          console.log('✅ 이벤트 발생 없이 위치 업데이트 완료');
        }
        
        // 실제 업데이트 확인
        const updatedElement = elementRegistry.get(shape.id);
        if (updatedElement.x === testX && updatedElement.y === testY) {
          console.log('✅ Visual Properties 업데이트 성공');
        } else {
          console.error('❌ Visual Properties 업데이트 실패');
        }
        
        modeler.off('element.changed', eventListener);
        
        // 원본 위치로 복구
        silentUpdater.updateVisualProperties(shape.id, { x: originalX, y: originalY });
      }, 100);
      
      return true;
    } catch (error) {
      console.error('❌ Visual Properties 업데이트 중 오류:', error);
      modeler.off('element.changed', eventListener);
      return false;
    }
  },

  /**
   * 배치 업데이트 테스트
   */
  testBatchUpdate: function(modeler, silentUpdater) {
    console.log('=== 배치 업데이트 테스트 ===');
    
    const elementRegistry = modeler.get('elementRegistry');
    const elements = elementRegistry.getAll().filter(el => 
      el.type === 'bpmn:Task' || el.type === 'bpmn:StartEvent'
    ).slice(0, 3); // 최대 3개 요소만 테스트
    
    if (elements.length === 0) {
      console.warn('⚠️ 테스트할 요소가 없습니다.');
      return false;
    }

    console.log('배치 업데이트 대상:', elements.map(el => el.id));
    
    // 배치 업데이트 데이터 준비
    const updates = elements.map((el, index) => ({
      type: 'visual',
      elementId: el.id,
      properties: {
        x: el.x + 10,
        y: el.y + 10
      }
    }));
    
    // 이벤트 카운터
    let eventCount = 0;
    const eventListener = () => { eventCount++; };
    modeler.on('element.changed', eventListener);
    
    try {
      // 배치 업데이트 실행
      silentUpdater.batchUpdate(updates);
      
      setTimeout(() => {
        console.log('발생한 이벤트 수:', eventCount);
        
        if (eventCount === 0) {
          console.log('✅ 배치 업데이트 시 이벤트 발생 없음');
        } else {
          console.error('❌ 배치 업데이트 시 이벤트 발생:', eventCount);
        }
        
        modeler.off('element.changed', eventListener);
        
        // 원본 위치로 복구
        const restoreUpdates = elements.map(el => ({
          type: 'visual',
          elementId: el.id,
          properties: {
            x: el.x - 10,
            y: el.y - 10
          }
        }));
        silentUpdater.batchUpdate(restoreUpdates);
      }, 200);
      
      return true;
    } catch (error) {
      console.error('❌ 배치 업데이트 중 오류:', error);
      modeler.off('element.changed', eventListener);
      return false;
    }
  },

  /**
   * 전체 테스트 실행
   */
  runAllTests: function(modeler) {
    console.log('🚀 Silent Update Service 전체 테스트 시작');
    
    const silentUpdater = this.initTest(modeler);
    if (!silentUpdater) return;
    
    // 각 테스트를 순차적으로 실행
    setTimeout(() => this.testBusinessObjectUpdate(modeler, silentUpdater), 500);
    setTimeout(() => this.testVisualUpdate(modeler, silentUpdater), 1500);
    setTimeout(() => this.testBatchUpdate(modeler, silentUpdater), 2500);
    
    setTimeout(() => {
      console.log('🏁 모든 테스트 완료');
      silentUpdater.destroy();
    }, 4000);
  }
};

// 사용법 안내
console.log(`
Silent Update Service 테스트 사용법:

1. BPMN 모델러가 초기화된 후 실행:
   testSilentUpdate.runAllTests(modeler);

2. 개별 테스트 실행:
   const silentUpdater = testSilentUpdate.initTest(modeler);
   testSilentUpdate.testBusinessObjectUpdate(modeler, silentUpdater);
`);

export default window.testSilentUpdate;