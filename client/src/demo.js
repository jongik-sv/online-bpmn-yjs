/**
 * Online BPMN Collaboration Demo - Silent Update Architecture
 * 새로운 Silent Update 아키텍처를 사용한 완전한 협업 시스템
 */
import { BpmnCollaborationDemoV3 } from './BpmnCollaborationDemoV3.js';
import { BpmnCollaborationDemoV2 } from './BpmnCollaborationDemoV2.js';

// 새로운 V3 시스템 사용 (Silent Update Architecture)
const BpmnCollaborationDemo = BpmnCollaborationDemoV3;

// 전역 변수로 데모 인스턴스 생성
let demo = null;

/**
 * 애플리케이션 시작
 */
async function startApp() {
  try {
    // console.log('🚀 BPMN Collaboration Demo 시작...');
    
    // Y.js 라이브러리 로드 확인
    // console.log('📚 라이브러리 로드 상태 확인:');
    // console.log('- window.Y:', window.Y);
    // console.log('- window.WebsocketProvider:', window.WebsocketProvider);
    // console.log('- window.BpmnJS:', window.BpmnJS);
    
    if (!window.Y || !window.Y.Doc) {
      throw new Error('Y.js 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 해주세요.');
    }
    
    // 데모 인스턴스 생성 (V3 - Silent Update Architecture)
    // console.log('📦 BpmnCollaborationDemoV3 인스턴스 생성 중...');
    demo = new BpmnCollaborationDemoV3();
    // console.log('✅ demo V3 인스턴스 생성됨 (Silent Update Architecture):', demo);
    
    // 전역 객체에 등록 (디버깅용)
    window.demo = demo;
    // console.log('🌍 window.demo에 등록됨');
    
    // 테스트 함수들 전역 노출
    window.testMove = () => {
      if (demo && demo.testElementMove) {
        return demo.testElementMove();
      } else {
        console.error('BPMN 모델러가 초기화되지 않았습니다.');
        return false;
      }
    };

    window.testSilentUpdate = () => {
      if (demo && demo.testSilentUpdate) {
        return demo.testSilentUpdate();
      } else {
        console.error('Silent Update 서비스가 초기화되지 않았습니다.');
        return false;
      }
    };

    window.getSyncStatus = () => {
      if (demo && demo.getSyncStatus) {
        return demo.getSyncStatus();
      } else {
        console.error('동기화 매니저가 초기화되지 않았습니다.');
        return null;
      }
    };

    window.getConnectionStatus = () => {
      if (demo && demo.getConnectionStatus) {
        return demo.getConnectionStatus();
      } else {
        console.error('협업 시스템이 초기화되지 않았습니다.');
        return null;
      }
    };
    
    window.testServer = async () => {
      try {
        console.log('🧪 서버 테스트 시작...');
        const response = await fetch('http://localhost:3001/health');
        const data = await response.json();
        // console.log('✅ 서버 응답:', data);
        return data;
      } catch (error) {
        console.error('❌ 서버 테스트 실패:', error);
        return false;
      }
    };
    
    window.debugDemo = () => {
      console.log('🔍 Demo V3 디버그 정보:');
      if (demo && demo.getDebugInfo) {
        const debugInfo = demo.getDebugInfo();
        console.table(debugInfo);
        return debugInfo;
      } else {
        console.log('- demo:', !!demo);
        console.log('- isConnected:', demo?.isConnected);
        console.log('- currentDocumentId:', demo?.currentDocumentId);
        return demo;
      }
    };

    window.reloadDiagram = async () => {
      if (demo && demo.loadInitialDiagram) {
        console.log('🔄 다이어그램 다시 로드 중...');
        await demo.loadInitialDiagram();
        console.log('✅ 다이어그램 다시 로드 완료');
      } else {
        console.error('Demo가 초기화되지 않았습니다.');
      }
    };

    window.validateSync = () => {
      if (demo && demo.syncManager) {
        console.log('🔍 동기화 상태 검증 중...');
        const inconsistencies = demo.syncManager.validateSync();
        console.log('검증 결과:', inconsistencies);
        return inconsistencies;
      } else {
        console.error('Sync Manager가 초기화되지 않았습니다.');
        return null;
      }
    };
    
    // console.log('✅ 애플리케이션 초기화 완료');
    // console.log('💡 사용 가능한 테스트 함수들:');
    console.log('  - testMove() : 요소 이동 테스트');
    console.log('  - testSilentUpdate() : Silent Update 테스트');
    console.log('  - testServer() : 서버 연결 테스트');
    console.log('  - debugDemo() : 전체 상태 확인');
    console.log('  - getSyncStatus() : 동기화 상태 확인');
    console.log('  - getConnectionStatus() : 연결 상태 확인');
    console.log('  - reloadDiagram() : 다이어그램 다시 로드');
    console.log('  - validateSync() : 동기화 검증');
    
    // UI 이벤트 리스너 설정
    setupUIEventListeners();
    
    // 기본 사용자 이름 설정
    setupDefaultUserName();
    
  } catch (error) {
    console.error('❌ 애플리케이션 시작 실패:', error);
    showError('애플리케이션 시작에 실패했습니다: ' + error.message);
  }
}

/**
 * 기본 사용자 이름 설정
 */
function setupDefaultUserName() {
  const userNameInput = document.getElementById('user-name');
  if (userNameInput && !userNameInput.value.trim()) {
    // 랜덤 사용자 이름 생성
    const randomNames = [
      '김개발', '박협업', '이모델러', '정다이어그램', '최프로세스',
      '한업무', '조설계', '윤분석', '장시스템', '임기획'
    ];
    const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    
    userNameInput.value = `${randomName}${randomNumber}`;
    userNameInput.placeholder = '사용자 이름을 입력하세요';
  }
}

/**
 * UI 이벤트 리스너 설정
 */
function setupUIEventListeners() {
  // 서버 연결 버튼
  const connectButton = document.getElementById('connect-btn');
  if (connectButton) {
    connectButton.addEventListener('click', handleConnectClick);
    // console.log('🔌 서버 연결 버튼 이벤트 리스너 등록됨');
  } else {
    console.error('❌ connect-btn 요소를 찾을 수 없음');
  }

  // 문서 변경 버튼
  const changeDocumentButton = document.getElementById('change-document-btn');
  if (changeDocumentButton) {
    changeDocumentButton.addEventListener('click', handleChangeDocumentClick);
  }

  // 연결 해제 버튼
  const disconnectButton = document.getElementById('disconnect-btn');
  if (disconnectButton) {
    disconnectButton.addEventListener('click', handleDisconnectClick);
  }

  // 다이어그램 내보내기 버튼
  const exportButton = document.getElementById('export-btn');
  if (exportButton) {
    exportButton.addEventListener('click', handleExportClick);
  }

  // console.log('✅ 모든 UI 이벤트 리스너 설정 완료');
}

/**
 * 서버 연결 클릭 처리
 */
async function handleConnectClick() {
  // console.log('🔌 서버 연결 버튼이 클릭되었습니다!');
  // console.log('📝 demo 인스턴스 확인:', demo);
  try {
    if (!demo) {
      console.error('❌ demo 인스턴스가 null입니다');
      throw new Error('데모 인스턴스가 초기화되지 않았습니다.');
    }
    console.log('✅ demo 인스턴스 확인됨:', demo);

    const button = document.getElementById('connect-btn');
    if (button) {
      button.disabled = true;
      button.textContent = '연결 중...';
    }

    await demo.connectToServer();
    
    // 서버 연결 시 자동으로 문서에 참가
    const documentId = document.getElementById('document-id')?.value.trim() || 'demo-doc';
    await demo.joinDocument(documentId);
    
    if (button) {
      button.textContent = '연결됨';
      button.style.backgroundColor = '#28a745';
      button.disabled = true;
    }

    // 문서 변경 버튼 활성화
    const changeDocumentButton = document.getElementById('change-document-btn');
    if (changeDocumentButton) {
      changeDocumentButton.disabled = false;
    }

    // UI 상태 업데이트
    updateConnectionStatus(true);
    updateDocumentInfo(documentId);
    updateClientInfo(demo.options.userId, demo.options.userName);

    showSuccess(`서버에 연결되고 문서 "${documentId}"에 참가했습니다.`);

  } catch (error) {
    console.error('서버 연결 실패:', error);
    showError('서버 연결에 실패했습니다: ' + error.message);
    
    const button = document.getElementById('connect-btn');
    if (button) {
      button.disabled = false;
      button.textContent = '서버 연결';
      button.style.backgroundColor = '';
    }
  }
}

/**
 * 문서 변경 클릭 처리
 */
async function handleChangeDocumentClick() {
  try {
    if (!demo) {
      throw new Error('데모 인스턴스가 초기화되지 않았습니다.');
    }

    if (!demo.isConnected) {
      throw new Error('서버에 먼저 연결해주세요.');
    }

    const documentIdInput = document.getElementById('document-id');
    const documentId = documentIdInput ? documentIdInput.value.trim() : 'demo-doc';
    
    if (!documentId) {
      throw new Error('문서 ID를 입력해주세요.');
    }

    if (demo.documentId === documentId) {
      showError('이미 같은 문서에 연결되어 있습니다.');
      return;
    }

    const button = document.getElementById('change-document-btn');
    if (button) {
      button.disabled = true;
      button.textContent = '변경 중...';
    }

    // 기존 문서 연결 해제
    if (demo.documentId) {
      await demo.leaveDocument();
    }

    // 새 문서에 참가
    await demo.joinDocument(documentId);
    
    if (button) {
      button.textContent = '문서 변경';
      button.disabled = false;
    }

    showSuccess(`문서를 "${documentId}"로 변경했습니다.`);

  } catch (error) {
    console.error('문서 변경 실패:', error);
    showError('문서 변경에 실패했습니다: ' + error.message);
    
    const button = document.getElementById('change-document-btn');
    if (button) {
      button.disabled = false;
      button.textContent = '문서 변경';
    }
  }
}

/**
 * 연결 해제 클릭 처리
 */
function handleDisconnectClick() {
  try {
    if (!demo) {
      throw new Error('데모 인스턴스가 초기화되지 않았습니다.');
    }

    demo.disconnect();
    
    // UI 버튼 상태 초기화
    resetButtonStates();
    
    // UI 상태 초기화
    updateConnectionStatus(false);
    updateDocumentInfo('');
    updateClientInfo('', '');
    
    // 사용자 목록 초기화
    const usersList = document.getElementById('users-list');
    if (usersList) {
      usersList.innerHTML = '<div class="loading"><div class="spinner"></div>협업 연결을 기다리는 중...</div>';
    }
    
    showSuccess('연결이 해제되었습니다.');

  } catch (error) {
    console.error('연결 해제 실패:', error);
    showError('연결 해제에 실패했습니다: ' + error.message);
  }
}

/**
 * 다이어그램 내보내기 클릭 처리
 */
async function handleExportClick() {
  try {
    if (!demo || !demo.modeler) {
      throw new Error('BPMN 모델러가 초기화되지 않았습니다.');
    }

    const xml = await demo.exportDiagramAsXML();
    
    // XML을 새 창에서 표시
    const newWindow = window.open();
    newWindow.document.write(`
      <html>
        <head><title>BPMN XML Export</title></head>
        <body>
          <h3>BPMN XML</h3>
          <pre style="background: #f5f5f5; padding: 10px; overflow: auto;">${escapeHtml(xml)}</pre>
        </body>
      </html>
    `);

    showSuccess('다이어그램이 성공적으로 내보내졌습니다.');

  } catch (error) {
    console.error('다이어그램 내보내기 실패:', error);
    showError('다이어그램 내보내기에 실패했습니다: ' + error.message);
  }
}

/**
 * 버튼 상태 초기화
 */
function resetButtonStates() {
  const buttons = [
    { id: 'connect-btn', text: '서버 연결', disabled: false },
    { id: 'join-document-btn', text: '문서 참가', disabled: true },
  ];

  buttons.forEach(({ id, text, disabled }) => {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = disabled;
      button.textContent = text;
      button.style.backgroundColor = '';
    }
  });
}

/**
 * 성공 메시지 표시
 */
function showSuccess(message) {
  console.log('✅', message);
  // 실제 UI 토스트나 알림 구현 가능
}

/**
 * 오류 메시지 표시
 */
function showError(message) {
  console.error('❌', message);
  // 실제 UI 토스트나 알림 구현 가능
  alert(message); // 임시 알림
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 연결 상태 UI 업데이트
 */
function updateConnectionStatus(isConnected) {
  const statusDot = document.getElementById('connection-status');
  const statusText = document.getElementById('connection-text');
  
  if (statusDot && statusText) {
    if (isConnected) {
      statusDot.classList.add('connected');
      statusText.textContent = '연결됨';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = '연결 안됨';
    }
  }
}

/**
 * 문서 정보 UI 업데이트
 */
function updateDocumentInfo(documentId) {
  const documentNameElement = document.getElementById('document-name');
  if (documentNameElement) {
    documentNameElement.textContent = documentId || '-';
  }
}

/**
 * 클라이언트 정보 UI 업데이트
 */
function updateClientInfo(userId, userName) {
  const clientIdElement = document.getElementById('client-id');
  if (clientIdElement) {
    clientIdElement.textContent = userName ? `${userName} (${userId?.slice(-8)})` : '-';
  }
}

/**
 * 페이지 언로드 시 정리
 */
window.addEventListener('beforeunload', () => {
  if (demo) {
    demo.destroy();
  }
});

/**
 * DOM 로드 완료 시 앱 시작
 */
function initializeApp() {
  // 라이브러리 로드 완료까지 대기
  const maxWaitTime = 5000; // 5초
  const checkInterval = 100; // 100ms
  let waited = 0;
  
  const checkLibraries = () => {
    // console.log('📚 라이브러리 로드 확인:', {
    //   'window.Y': !!window.Y,
    //   'window.WebsocketProvider': !!window.WebsocketProvider,
    //   'window.BpmnJS': !!window.BpmnJS
    // });
    
    if (window.Y && window.WebsocketProvider && window.BpmnJS) {
      startApp();
    } else if (waited < maxWaitTime) {
      waited += checkInterval;
      setTimeout(checkLibraries, checkInterval);
    } else {
      console.error('라이브러리 로드 타임아웃. 페이지를 새로고침 해주세요.');
      showError('라이브러리 로드에 실패했습니다. 페이지를 새로고침 해주세요.');
    }
  };
  
  checkLibraries();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// 모듈 export (다른 파일에서 사용할 수 있도록)
export { demo, BpmnCollaborationDemoV3, BpmnCollaborationDemoV2, BpmnCollaborationDemo };