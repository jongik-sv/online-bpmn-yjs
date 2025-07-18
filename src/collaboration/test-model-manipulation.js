/**
 * 직접 모델 조작 서비스 테스트
 * 
 * DirectModelManipulator와 ModelTreeManipulator의 기능을 테스트합니다.
 */

// 테스트용 함수들
window.testModelManipulation = {
  
  /**
   * DirectModelManipulator 초기화 테스트
   */
  initDirectManipulatorTest: function(modeler) {
    console.log('=== DirectModelManipulator 초기화 테스트 ===');
    
    try {
      const directManipulator = new window.DirectModelManipulator(modeler);
      console.log('✅ DirectModelManipulator 초기화 성공');
      return directManipulator;
    } catch (error) {
      console.error('❌ DirectModelManipulator 초기화 실패:', error);
      return null;
    }
  },

  /**
   * ModelTreeManipulator 초기화 테스트
   */
  initTreeManipulatorTest: function(modeler) {
    console.log('=== ModelTreeManipulator 초기화 테스트 ===');
    
    try {
      const treeManipulator = new window.ModelTreeManipulator(modeler);
      console.log('✅ ModelTreeManipulator 초기화 성공');
      return treeManipulator;
    } catch (error) {
      console.error('❌ ModelTreeManipulator 초기화 실패:', error);
      return null;
    }
  },

  /**
   * BusinessObject 직접 생성 테스트
   */
  testBusinessObjectCreation: function(directManipulator) {
    console.log('=== BusinessObject 직접 생성 테스트 ===');
    
    try {
      // Task BusinessObject 생성
      const taskBO = directManipulator.createBusinessObject('bpmn:Task', {
        name: 'Direct Test Task',
        documentation: 'Created by DirectModelManipulator'
      });

      if (taskBO && taskBO.$type === 'bpmn:Task') {
        console.log('✅ Task BusinessObject 생성 성공:', taskBO.id);
        console.log('   - Name:', taskBO.name);
        console.log('   - Type:', taskBO.$type);
      } else {
        console.error('❌ Task BusinessObject 생성 실패');
        return false;
      }

      // StartEvent BusinessObject 생성
      const startEventBO = directManipulator.createBusinessObject('bpmn:StartEvent', {
        name: 'Direct Start Event'
      });

      if (startEventBO && startEventBO.$type === 'bpmn:StartEvent') {
        console.log('✅ StartEvent BusinessObject 생성 성공:', startEventBO.id);
      } else {
        console.error('❌ StartEvent BusinessObject 생성 실패');
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ BusinessObject 생성 테스트 실패:', error);
      return false;
    }
  },

  /**
   * 완전한 요소 생성 테스트
   */
  testCompleteElementCreation: function(modeler, directManipulator) {
    console.log('=== 완전한 요소 생성 테스트 ===');
    
    try {
      // Task 요소 생성
      const taskElement = directManipulator.createCompleteElement(
        'bpmn:Task',
        { 
          name: 'Direct Created Task',
          documentation: 'Created via DirectModelManipulator'
        },
        { x: 400, y: 200, width: 120, height: 90 }
      );

      if (!taskElement) {
        console.error('❌ Task 요소 생성 실패');
        return false;
      }

      console.log('✅ Task 요소 생성 성공:', taskElement.id);
      console.log('   - Position:', taskElement.x, taskElement.y);
      console.log('   - Size:', taskElement.width, taskElement.height);

      // ElementRegistry에서 확인
      const elementRegistry = modeler.get('elementRegistry');
      const registeredElement = elementRegistry.get(taskElement.id);

      if (registeredElement) {
        console.log('✅ 생성된 요소가 ElementRegistry에 등록됨');
      } else {
        console.error('❌ 생성된 요소가 ElementRegistry에 등록되지 않음');
      }

      // StartEvent 요소 생성
      const startEventElement = directManipulator.createCompleteElement(
        'bpmn:StartEvent',
        { name: 'Direct Start' },
        { x: 200, y: 220 }
      );

      if (startEventElement) {
        console.log('✅ StartEvent 요소 생성 성공:', startEventElement.id);
        
        // 생성된 요소들을 나중에 정리하기 위해 저장
        window.testCreatedElements = window.testCreatedElements || [];
        window.testCreatedElements.push(taskElement.id, startEventElement.id);
      } else {
        console.error('❌ StartEvent 요소 생성 실패');
      }

      return true;
    } catch (error) {
      console.error('❌ 완전한 요소 생성 테스트 실패:', error);
      return false;
    }
  },

  /**
   * Connection 생성 테스트
   */
  testConnectionCreation: function(modeler, directManipulator) {
    console.log('=== Connection 생성 테스트 ===');
    
    const elementRegistry = modeler.get('elementRegistry');
    
    try {
      // 기존 요소들 찾기
      const allElements = elementRegistry.getAll();
      const sourceElement = allElements.find(el => el.businessObject.$type === 'bpmn:StartEvent');
      const targetElement = allElements.find(el => el.businessObject.$type === 'bpmn:Task');

      if (!sourceElement || !targetElement) {
        console.warn('⚠️ Connection 테스트를 위한 source/target 요소가 없습니다');
        return false;
      }

      // SequenceFlow 생성
      const connection = directManipulator.createCompleteConnection(
        'bpmn:SequenceFlow',
        sourceElement,
        targetElement,
        { name: 'Direct Connection' }
      );

      if (!connection) {
        console.error('❌ Connection 생성 실패');
        return false;
      }

      console.log('✅ Connection 생성 성공:', connection.id);
      console.log('   - Source:', connection.source.id);
      console.log('   - Target:', connection.target.id);

      // 연결 관계 확인
      if (sourceElement.outgoing && sourceElement.outgoing.includes(connection)) {
        console.log('✅ Source outgoing 관계 설정됨');
      } else {
        console.error('❌ Source outgoing 관계 설정 실패');
      }

      if (targetElement.incoming && targetElement.incoming.includes(connection)) {
        console.log('✅ Target incoming 관계 설정됨');
      } else {
        console.error('❌ Target incoming 관계 설정 실패');
      }

      // 정리용으로 저장
      window.testCreatedElements = window.testCreatedElements || [];
      window.testCreatedElements.push(connection.id);

      return true;
    } catch (error) {
      console.error('❌ Connection 생성 테스트 실패:', error);
      return false;
    }
  },

  /**
   * 부모-자식 관계 설정 테스트
   */
  testParentChildRelation: function(modeler, treeManipulator) {
    console.log('=== 부모-자식 관계 설정 테스트 ===');
    
    const elementRegistry = modeler.get('elementRegistry');
    
    try {
      // 두 요소 찾기
      const allElements = elementRegistry.getAll();
      const elements = allElements.filter(el => 
        el.businessObject.$type === 'bpmn:Task' || 
        el.businessObject.$type === 'bpmn:StartEvent'
      ).slice(0, 2);

      if (elements.length < 2) {
        console.warn('⚠️ 부모-자식 관계 테스트를 위한 요소가 부족합니다');
        return false;
      }

      const parentElement = elements[0];
      const childElement = elements[1];

      console.log('Parent element:', parentElement.id);
      console.log('Child element:', childElement.id);

      // 부모-자식 관계 설정
      const success = treeManipulator.setParentChild(parentElement, childElement);

      if (!success) {
        console.error('❌ 부모-자식 관계 설정 실패');
        return false;
      }

      // 관계 확인
      if (childElement.parent === parentElement) {
        console.log('✅ Diagram 레벨 부모 관계 설정됨');
      } else {
        console.error('❌ Diagram 레벨 부모 관계 설정 실패');
      }

      if (parentElement.children && parentElement.children.includes(childElement)) {
        console.log('✅ Diagram 레벨 자식 관계 설정됨');
      } else {
        console.error('❌ Diagram 레벨 자식 관계 설정 실패');
      }

      // BusinessObject 레벨 관계 확인
      if (childElement.businessObject.$parent === parentElement.businessObject) {
        console.log('✅ BusinessObject 레벨 부모 관계 설정됨');
      } else {
        console.error('❌ BusinessObject 레벨 부모 관계 설정 실패');
      }

      // 관계 제거 테스트
      setTimeout(() => {
        const removeSuccess = treeManipulator.removeParentChild(childElement);
        if (removeSuccess && !childElement.parent) {
          console.log('✅ 부모-자식 관계 제거 성공');
        } else {
          console.error('❌ 부모-자식 관계 제거 실패');
        }
      }, 1000);

      return true;
    } catch (error) {
      console.error('❌ 부모-자식 관계 설정 테스트 실패:', error);
      return false;
    }
  },

  /**
   * 모델 트리 검증 테스트
   */
  testModelTreeValidation: function(treeManipulator) {
    console.log('=== 모델 트리 검증 테스트 ===');
    
    try {
      const validation = treeManipulator.validateModelTree();
      
      console.log('모델 트리 검증 결과:');
      console.log('   - 총 요소 수:', validation.stats.totalElements);
      console.log('   - 고아 요소 수:', validation.stats.orphanElements);
      console.log('   - 잘못된 연결 수:', validation.stats.invalidConnections);
      console.log('   - BusinessObject 불일치 수:', validation.stats.businessObjectMismatches);

      if (validation.issues.length > 0) {
        console.log('발견된 이슈들:');
        validation.issues.forEach(issue => {
          console.log(`   - ${issue.elementId}: ${issue.issue}`);
        });
      } else {
        console.log('✅ 모델 트리에 문제없음');
      }

      return true;
    } catch (error) {
      console.error('❌ 모델 트리 검증 테스트 실패:', error);
      return false;
    }
  },

  /**
   * Registry 상태 검증 테스트
   */
  testRegistryValidation: function(directManipulator) {
    console.log('=== Registry 상태 검증 테스트 ===');
    
    try {
      const validation = directManipulator.validateRegistry();
      
      console.log('Registry 검증 결과:');
      console.log('   - 총 요소 수:', validation.stats.totalElements);
      console.log('   - 그래픽스 있는 요소:', validation.stats.elementsWithGraphics);
      console.log('   - 그래픽스 없는 요소:', validation.stats.elementsWithoutGraphics);

      if (validation.issues.length > 0) {
        console.log('발견된 이슈들:');
        validation.issues.forEach(issue => {
          console.log(`   - ${issue.elementId}: ${issue.issue}`);
        });
      } else {
        console.log('✅ Registry 상태에 문제없음');
      }

      return true;
    } catch (error) {
      console.error('❌ Registry 상태 검증 테스트 실패:', error);
      return false;
    }
  },

  /**
   * 테스트 정리 함수
   */
  cleanupTestElements: function(modeler, directManipulator) {
    console.log('=== 테스트 요소 정리 ===');
    
    if (!window.testCreatedElements) {
      console.log('정리할 테스트 요소가 없습니다');
      return;
    }

    const elementRegistry = modeler.get('elementRegistry');
    let cleaned = 0;

    window.testCreatedElements.forEach(elementId => {
      const element = elementRegistry.get(elementId);
      if (element) {
        directManipulator.removeFromCanvas(element);
        cleaned++;
      }
    });

    console.log(`🧹 ${cleaned}개의 테스트 요소 정리 완료`);
    window.testCreatedElements = [];
  },

  /**
   * 전체 테스트 실행
   */
  runAllTests: function(modeler) {
    console.log('🚀 직접 모델 조작 서비스 전체 테스트 시작');
    
    const directManipulator = this.initDirectManipulatorTest(modeler);
    const treeManipulator = this.initTreeManipulatorTest(modeler);
    
    if (!directManipulator || !treeManipulator) return;
    
    // 각 테스트를 순차적으로 실행
    setTimeout(() => this.testBusinessObjectCreation(directManipulator), 500);
    setTimeout(() => this.testCompleteElementCreation(modeler, directManipulator), 1000);
    setTimeout(() => this.testConnectionCreation(modeler, directManipulator), 1500);
    setTimeout(() => this.testParentChildRelation(modeler, treeManipulator), 2000);
    setTimeout(() => this.testModelTreeValidation(treeManipulator), 2500);
    setTimeout(() => this.testRegistryValidation(directManipulator), 3000);
    
    // 정리
    setTimeout(() => {
      this.cleanupTestElements(modeler, directManipulator);
      console.log('🏁 모든 직접 모델 조작 테스트 완료');
      directManipulator.destroy();
      treeManipulator.destroy();
    }, 4000);
  }
};

// 사용법 안내
console.log(`
직접 모델 조작 서비스 테스트 사용법:

1. BPMN 모델러가 초기화된 후 실행:
   testModelManipulation.runAllTests(modeler);

2. 개별 테스트 실행:
   const directManipulator = testModelManipulation.initDirectManipulatorTest(modeler);
   testModelManipulation.testBusinessObjectCreation(directManipulator);
`);

export default window.testModelManipulation;