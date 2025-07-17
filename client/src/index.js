/**
 * BPMN 실시간 협업 데모 - 메인 엔트리 포인트
 */

// 스타일 import
import './style.css';

// 라이브러리 import
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import BpmnJS from 'bpmn-js/lib/Modeler';

// 전역 변수로 노출 (기존 코드 호환성)
window.Y = Y;
window.WebsocketProvider = WebsocketProvider;
window.BpmnJS = BpmnJS;

console.log('라이브러리 로딩 상태:');
console.log('- Y:', typeof Y);
console.log('- WebsocketProvider:', typeof WebsocketProvider);
console.log('- BpmnJS:', typeof BpmnJS);

// demo.js를 import하여 자동 초기화
import './demo.js';

// 전역 함수들 노출 (호환성용)
window.connectToServer = () => window.demo?.connectToServer();
window.resetZoom = () => window.demo?.resetZoom();
window.exportDiagram = () => window.demo?.exportDiagram();
window.showStatistics = () => window.demo?.showStatistics();

console.log('BPMN 협업 데모 클라이언트 시작됨');