# 백업 정보

## 백업 일시
2026-01-30 04:14:25

## 백업 버전
v1 - 도매인, 파일명 추가 버전

## 주요 기능

### ✅ 완료된 기능
1. **패킹리스트 분석**
   - 첫 번째 시트 제외 (통관용)
   - 오른쪽 표 기준 (열 11: 품명, 열 12: 칼라)
   - 사이즈별 수량 추출 (120~220, L, FREE)
   - 수량 0 또는 빈 값 제외

2. **도매인 관리**
   - 도매인 등록/선택
   - localStorage 저장 (영구 보존)
   - 여러 도매인 지원

3. **파일 정보 저장**
   - **도매인**: 웹에서 선택한 도매인 자동 저장
   - **파일명**: 업로드한 파일명 자동 저장
   - 여러 파일/도매인 동시 분석 지원

4. **데이터 출력**
   - 웹 UI 테이블 (도매인, 파일명 포함)
   - 엑셀 다운로드 (CSV, UTF-8 BOM)
   - Python 검색 스크립트
   - Python CSV 변환

### 📊 데이터 구조
```json
{
  "wholesaler": "선택한도매인",
  "fileName": "업로드파일명.xls",
  "sheet": "시트명",
  "productName": "제품명",
  "color": "칼라",
  "quantities": {
    "140": 120,
    "150": 240,
    ...
  }
}
```

### 📁 백업 파일 목록
- index.html (웹 UI)
- style.css (스타일)
- app.js (메인 로직)
- README.md (문서)
- search_product.py (제품 검색)
- convert_to_csv.py (CSV 변환)
- view_extracted_data.py (표 형식 출력)
- extract_real_packing.py (패킹리스트 분석)
- add_wholesaler_filename.py (도매인/파일명 추가)
- extracted_products.json (샘플 데이터)
- extracted_products.csv (샘플 CSV)

## 다음 단계 (TODO)
- 2단계: 이지어드민 제품 리스트와 매핑
- 3단계: 수동 매핑 UI
- 4단계: 업로드 파일 생성
