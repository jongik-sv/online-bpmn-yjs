import CustomElementFactory from './CustomElementFactory.js';

/**
 * 협업 ID 시스템을 위한 BPMN.js 커스텀 모듈
 * ElementFactory를 오버라이드해서 협업용 결정론적 ID를 생성
 */
export default {
  __depends__: [
    // 기본 모듈들에 의존
  ],
  __init__: [
    // 초기화할 서비스 없음 (ElementFactory는 기본적으로 초기화됨)
  ],
  // ElementFactory 서비스를 커스텀 구현으로 오버라이드
  elementFactory: ['type', CustomElementFactory]
};