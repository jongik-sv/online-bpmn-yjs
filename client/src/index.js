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

// 데모 클래스 import
import { BpmnCollaborationDemo } from './demo';

// 전역 함수들
let demo;

function initDemo() {
  console.log('Y.js 라이브러리가 성공적으로 로드되었습니다.');
  
  // 데모 앱 초기화
  demo = new BpmnCollaborationDemo();
  window.demo = demo; // 디버깅용
}

// 전역 함수들 노출
window.initDemo = initDemo;
window.connectToServer = () => demo?.connectToServer();
window.resetZoom = () => demo?.resetZoom();
window.exportDiagram = () => demo?.exportDiagram();
window.showStatistics = () => demo?.showStatistics();

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', initDemo);

console.log('BPMN 협업 데모 클라이언트 시작됨');