/**
 * 컴포넌트 팩토리
 * 동적 컴포넌트 생성 및 관리를 위한 팩토리 패턴 구현
 */

export class ComponentFactory {
  constructor() {
    // 등록된 컴포넌트들
    this.components = new Map();
    
    // 인스턴스 캐시
    this.instances = new Map();
    
    // 설정
    this.config = {
      enableCaching: true,
      enableSingletons: true,
      autoRegisterDefaults: true
    };

    // 초기 컴포넌트들 등록
    if (this.config.autoRegisterDefaults) {
      this._registerDefaultComponents();
    }
  }

  /**
   * 컴포넌트 등록
   * @param {string} name - 컴포넌트 이름
   * @param {Function} constructor - 컴포넌트 생성자
   * @param {Object} options - 등록 옵션
   * @returns {ComponentFactory} 체이닝을 위한 자기 참조
   */
  register(name, constructor, options = {}) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Component name must be a non-empty string');
    }

    if (typeof constructor !== 'function') {
      throw new Error('Component constructor must be a function');
    }

    const componentInfo = {
      name,
      constructor,
      singleton: options.singleton ?? false,
      dependencies: options.dependencies || [],
      lazy: options.lazy ?? false,
      category: options.category || 'default',
      description: options.description || '',
      version: options.version || '1.0.0',
      created: Date.now()
    };

    this.components.set(name, componentInfo);
    
    return this;
  }

  /**
   * 컴포넌트 생성
   * @param {string} name - 컴포넌트 이름
   * @param {Object} config - 생성 설정
   * @param {Array} args - 생성자 인수
   * @returns {Object} 생성된 컴포넌트 인스턴스
   */
  create(name, config = {}, ...args) {
    const componentInfo = this.components.get(name);
    
    if (!componentInfo) {
      throw new Error(`Component '${name}' not registered`);
    }

    // 싱글톤 체크
    if (componentInfo.singleton && this.instances.has(name)) {
      return this.instances.get(name);
    }

    // 의존성 해결
    const dependencies = this._resolveDependencies(componentInfo.dependencies, config);

    try {
      // 인스턴스 생성
      const instance = new componentInfo.constructor(config, dependencies, ...args);
      
      // 메타데이터 추가
      this._addMetadata(instance, componentInfo, config);
      
      // 라이프사이클 훅
      this._callLifecycleHook(instance, 'onCreate', config);
      
      // 캐싱
      if (this.config.enableCaching && componentInfo.singleton) {
        this.instances.set(name, instance);
      }

      return instance;

    } catch (error) {
      throw new Error(`Failed to create component '${name}': ${error.message}`);
    }
  }

  /**
   * 컴포넌트 존재 여부 확인
   * @param {string} name - 컴포넌트 이름
   * @returns {boolean} 존재 여부
   */
  has(name) {
    return this.components.has(name);
  }

  /**
   * 컴포넌트 등록 해제
   * @param {string} name - 컴포넌트 이름
   * @returns {boolean} 성공 여부
   */
  unregister(name) {
    const success = this.components.delete(name);
    
    // 캐시된 인스턴스도 제거
    if (this.instances.has(name)) {
      const instance = this.instances.get(name);
      this._callLifecycleHook(instance, 'onDestroy');
      this.instances.delete(name);
    }
    
    return success;
  }

  /**
   * 등록된 컴포넌트 목록 조회
   * @param {string} category - 카테고리 필터 (선택적)
   * @returns {Array} 컴포넌트 정보 배열
   */
  list(category = null) {
    const components = Array.from(this.components.values());
    
    if (category) {
      return components.filter(comp => comp.category === category);
    }
    
    return components.map(comp => ({
      name: comp.name,
      category: comp.category,
      description: comp.description,
      version: comp.version,
      singleton: comp.singleton,
      dependencies: comp.dependencies,
      created: new Date(comp.created).toISOString()
    }));
  }

  /**
   * 카테고리별 컴포넌트 조회
   * @returns {Object} 카테고리별 컴포넌트 맵
   */
  getCategories() {
    const categories = {};
    
    this.components.forEach(comp => {
      if (!categories[comp.category]) {
        categories[comp.category] = [];
      }
      categories[comp.category].push(comp.name);
    });
    
    return categories;
  }

  /**
   * 배치 컴포넌트 생성
   * @param {Array} componentSpecs - 컴포넌트 명세 배열
   * @returns {Map} 생성된 인스턴스 맵
   */
  createBatch(componentSpecs) {
    const instances = new Map();
    const errors = [];

    // 의존성 순서로 정렬
    const sortedSpecs = this._sortByDependencies(componentSpecs);

    for (const spec of sortedSpecs) {
      try {
        const instance = this.create(spec.name, spec.config, ...(spec.args || []));
        instances.set(spec.name, instance);
      } catch (error) {
        errors.push({
          component: spec.name,
          error: error.message
        });
      }
    }

    if (errors.length > 0) {
      console.warn('Batch creation errors:', errors);
    }

    return instances;
  }

  /**
   * 컴포넌트 복제
   * @param {string} name - 원본 컴포넌트 이름
   * @param {string} newName - 새 컴포넌트 이름
   * @param {Object} overrides - 재정의할 옵션
   * @returns {ComponentFactory} 체이닝을 위한 자기 참조
   */
  clone(name, newName, overrides = {}) {
    const original = this.components.get(name);
    
    if (!original) {
      throw new Error(`Component '${name}' not found for cloning`);
    }

    const clonedInfo = {
      ...original,
      name: newName,
      ...overrides,
      created: Date.now()
    };

    this.components.set(newName, clonedInfo);
    
    return this;
  }

  /**
   * 인스턴스 캐시 지우기
   * @param {string} name - 특정 컴포넌트만 지우기 (선택적)
   */
  clearCache(name = null) {
    if (name) {
      const instance = this.instances.get(name);
      if (instance) {
        this._callLifecycleHook(instance, 'onDestroy');
        this.instances.delete(name);
      }
    } else {
      // 모든 인스턴스에 대해 onDestroy 호출
      this.instances.forEach((instance, instanceName) => {
        this._callLifecycleHook(instance, 'onDestroy');
      });
      this.instances.clear();
    }
  }

  /**
   * 디버그 정보 조회
   * @returns {Object} 디버그 정보
   */
  getDebugInfo() {
    return {
      registeredComponents: this.components.size,
      cachedInstances: this.instances.size,
      categories: Object.keys(this.getCategories()).length,
      config: this.config,
      components: this.list(),
      instances: Array.from(this.instances.keys())
    };
  }

  /**
   * 기본 컴포넌트들 등록
   * @private
   */
  _registerDefaultComponents() {
    // BpmnDiffSync 관련 컴포넌트들 등록
    const defaultComponents = [
      {
        name: 'BpmnStateExtractor',
        path: '../extractors/BpmnStateExtractor.js',
        category: 'extractor',
        description: 'BPMN 상태 추출기'
      },
      {
        name: 'StandardDiffCalculator',
        path: '../calculators/StandardDiffCalculator.js',
        category: 'calculator',
        description: '표준 Diff 계산기'
      },
      {
        name: 'BpmnDiffApplicator',
        path: '../applicators/BpmnDiffApplicator.js',
        category: 'applicator',
        description: 'BPMN Diff 적용기'
      },
      {
        name: 'YjsAdapter',
        path: '../adapters/YjsAdapter.js',
        category: 'adapter',
        description: 'Y.js 동기화 어댑터'
      }
    ];

    // 동적 import는 실제 사용 시점에서 처리
    defaultComponents.forEach(comp => {
      this.register(comp.name, async (config) => {
        const module = await import(comp.path);
        const Constructor = module[comp.name];
        return new Constructor(config);
      }, {
        category: comp.category,
        description: comp.description,
        lazy: true
      });
    });
  }

  /**
   * 의존성 해결
   * @private
   * @param {Array} dependencies - 의존성 목록
   * @param {Object} config - 설정
   * @returns {Object} 해결된 의존성 객체
   */
  _resolveDependencies(dependencies, config) {
    const resolved = {};

    for (const dep of dependencies) {
      if (typeof dep === 'string') {
        // 단순 의존성
        if (this.has(dep)) {
          resolved[dep] = this.create(dep, config[dep] || {});
        } else {
          throw new Error(`Dependency '${dep}' not found`);
        }
      } else if (typeof dep === 'object') {
        // 복합 의존성
        const depName = dep.name;
        const depConfig = dep.config || config[depName] || {};
        const alias = dep.as || depName;
        
        if (this.has(depName)) {
          resolved[alias] = this.create(depName, depConfig);
        } else if (!dep.optional) {
          throw new Error(`Required dependency '${depName}' not found`);
        }
      }
    }

    return resolved;
  }

  /**
   * 의존성 순서로 정렬
   * @private
   * @param {Array} specs - 컴포넌트 명세 배열
   * @returns {Array} 정렬된 명세 배열
   */
  _sortByDependencies(specs) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (spec) => {
      if (visited.has(spec.name)) return;
      if (visiting.has(spec.name)) {
        throw new Error(`Circular dependency detected: ${spec.name}`);
      }

      visiting.add(spec.name);

      // 의존성들을 먼저 방문
      const component = this.components.get(spec.name);
      if (component && component.dependencies) {
        for (const dep of component.dependencies) {
          const depName = typeof dep === 'string' ? dep : dep.name;
          const depSpec = specs.find(s => s.name === depName);
          if (depSpec) {
            visit(depSpec);
          }
        }
      }

      visiting.delete(spec.name);
      visited.add(spec.name);
      sorted.push(spec);
    };

    specs.forEach(visit);
    return sorted;
  }

  /**
   * 메타데이터 추가
   * @private
   * @param {Object} instance - 인스턴스
   * @param {Object} componentInfo - 컴포넌트 정보
   * @param {Object} config - 설정
   */
  _addMetadata(instance, componentInfo, config) {
    if (instance && typeof instance === 'object') {
      // 메타데이터를 non-enumerable 속성으로 추가
      Object.defineProperty(instance, '__componentMeta', {
        value: {
          name: componentInfo.name,
          category: componentInfo.category,
          version: componentInfo.version,
          createdAt: Date.now(),
          config: config
        },
        writable: false,
        enumerable: false,
        configurable: false
      });
    }
  }

  /**
   * 라이프사이클 훅 호출
   * @private
   * @param {Object} instance - 인스턴스
   * @param {string} hook - 훅 이름
   * @param {...any} args - 인수
   */
  _callLifecycleHook(instance, hook, ...args) {
    if (instance && typeof instance[hook] === 'function') {
      try {
        instance[hook](...args);
      } catch (error) {
        console.warn(`Lifecycle hook '${hook}' failed:`, error);
      }
    }
  }

  /**
   * 팩토리 정리
   */
  destroy() {
    this.clearCache();
    this.components.clear();
  }
}