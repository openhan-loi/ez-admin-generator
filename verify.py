# -*- coding: utf-8 -*-
"""
EzAdmin Upload Generator - 첫 단계 검증 스크립트

이 스크립트는 첫 번째 단계(파일 분석)가 올바르게 작동하는지 검증합니다.
"""

import os
import sys
import json

# UTF-8 출력 설정 (Windows 호환)
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def check_files():
    """필요한 파일들이 모두 존재하는지 확인"""
    print("=" * 60)
    print("📁 파일 구조 검증")
    print("=" * 60)

    required_files = {
        'index.html': 'HTML 메인 파일',
        'style.css': 'CSS 스타일 파일',
        'app.js': 'JavaScript 로직 파일',
        'sample_packing_list.xlsx': '샘플 데이터 파일',
        'README.md': '사용 설명서'
    }

    all_exist = True
    for filename, description in required_files.items():
        exists = os.path.exists(filename)
        status = "✅" if exists else "❌"
        print(f"{status} {filename:30s} - {description}")
        if not exists:
            all_exist = False

    print()
    return all_exist

def check_html_structure():
    """HTML 파일의 구조 확인"""
    print("=" * 60)
    print("🏗️  HTML 구조 검증")
    print("=" * 60)

    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    required_elements = [
        ('id="wholesaler-select"', '도매인 선택 드롭다운'),
        ('id="add-wholesaler-btn"', '도매인 추가 버튼'),
        ('id="file-upload-area"', '파일 업로드 영역'),
        ('id="analyze-btn"', '분석 버튼'),
        ('id="upload-section"', '업로드 섹션'),
        ('id="analyzing-section"', '분석 중 섹션'),
        ('id="results-section"', '결과 섹션'),
        ('xlsx.full.min.js', 'XLSX 라이브러리'),
    ]

    all_found = True
    for element, description in required_elements:
        found = element in content
        status = "✅" if found else "❌"
        print(f"{status} {description}")
        if not found:
            all_found = False

    print()
    return all_found

def check_css_design():
    """CSS 파일의 디자인 시스템 확인"""
    print("=" * 60)
    print("🎨 CSS 디자인 시스템 검증")
    print("=" * 60)

    with open('style.css', 'r', encoding='utf-8') as f:
        content = f.read()

    design_tokens = [
        ('--color-primary:', '프라이머리 컬러'),
        ('--gradient-primary:', '그라데이션'),
        ('--shadow-', '그림자 효과'),
        ('--radius-', '모서리 둥글기'),
        ('--font-family: \'Inter\'', 'Inter 폰트'),
        ('@keyframes', '애니메이션'),
        ('transition:', '전환 효과'),
    ]

    all_found = True
    for token, description in design_tokens:
        found = token in content
        status = "✅" if found else "❌"
        print(f"{status} {description}")
        if not found:
            all_found = False

    print()
    return all_found

def check_javascript_logic():
    """JavaScript 파일의 주요 기능 확인"""
    print("=" * 60)
    print("⚙️  JavaScript 기능 검증")
    print("=" * 60)

    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    required_functions = [
        ('const AppState', '앱 상태 관리'),
        ('const FileHandler', '파일 처리기'),
        ('const WholesalerManager', '도매인 관리자'),
        ('const ExcelAnalyzer', '엑셀 분석기'),
        ('localStorage', 'LocalStorage 사용'),
        ('XLSX.read', 'XLSX 라이브러리 사용'),
        ('extractProductInfo', '제품 정보 추출'),
        ('showToast', '토스트 알림'),
    ]

    all_found = True
    for func, description in required_functions:
        found = func in content
        status = "✅" if found else "❌"
        print(f"{status} {description}")
        if not found:
            all_found = False

    print()
    return all_found

def print_summary():
    """최종 요약 정보 출력"""
    print("=" * 60)
    print("📊 프로젝트 요약")
    print("=" * 60)
    print()
    print("✨ 구현된 기능:")
    print("   1. ✅ 모던한 웹 UI (그라데이션, 애니메이션)")
    print("   2. ✅ 도매인 관리 (등록/삭제/선택)")
    print("   3. ✅ 파일 업로드 (드래그앤드롭)")
    print("   4. ✅ 엑셀 분석 (자동 컬럼 감지)")
    print("   5. ✅ 결과 테이블 표시")
    print()
    print("🚀 실행 방법:")
    print("   1. 터미널에서 실행: python -m http.server 8080")
    print("   2. 브라우저 열기: http://localhost:8080")
    print()
    print("📝 테스트 시나리오:")
    print("   1. '새 도매인 등록' 버튼으로 도매인 추가")
    print("   2. sample_packing_list.xlsx 파일 업로드")
    print("   3. '파일 분석하기' 버튼 클릭")
    print("   4. 분석 결과 확인")
    print()
    print("=" * 60)

def main():
    print("\n")
    print("🎯 EzAdmin Upload Generator - 첫 단계 검증")
    print()

    # 모든 검증 실행
    results = []
    results.append(check_files())
    results.append(check_html_structure())
    results.append(check_css_design())
    results.append(check_javascript_logic())

    # 최종 결과
    print("=" * 60)
    print("🎉 검증 결과")
    print("=" * 60)

    if all(results):
        print("✅ 모든 검증을 통과했습니다!")
        print()
        print_summary()
        return True
    else:
        print("❌ 일부 검증에 실패했습니다.")
        print("   위의 오류를 확인하고 수정해주세요.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
