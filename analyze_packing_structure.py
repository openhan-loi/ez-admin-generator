# -*- coding: utf-8 -*-
"""
실제 패킹리스트 파일 구조 분석 스크립트
"""

import sys
import pandas as pd
import json

# UTF-8 출력 설정 (Windows 호환)
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def analyze_excel_structure(file_path):
    """엑셀 파일의 전체 구조를 분석"""
    print("=" * 80)
    print("📊 패킹리스트 파일 구조 분석")
    print("=" * 80)
    print(f"\n파일: {file_path}\n")

    # 엑셀 파일 읽기 (모든 시트)
    excel_file = pd.ExcelFile(file_path)

    print(f"📑 총 시트 개수: {len(excel_file.sheet_names)}\n")

    for idx, sheet_name in enumerate(excel_file.sheet_names):
        print(f"\n{'=' * 80}")
        print(f"시트 {idx + 1}: {sheet_name}")
        print(f"{'=' * 80}")

        if idx == 0:
            print("⏩ 첫 번째 시트는 통관용이므로 건너뜁니다.")
            continue

        # 시트 데이터 읽기 (헤더 없이)
        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

        print(f"\n📏 시트 크기: {df.shape[0]} 행 x {df.shape[1]} 열\n")

        # 데이터 미리보기 (처음 20행)
        print("🔍 데이터 미리보기 (처음 20행):\n")
        print(df.head(20).to_string())

        # 빈 셀이 아닌 셀만 찾기
        print("\n\n📌 주요 패턴 분석:\n")

        # 품명, 칼라, 사이즈 등의 키워드 찾기
        keywords = ['품명', '칼라', '색상', '사이즈', 'SIZE', '수량', 'QTY']
        for keyword in keywords:
            found = False
            for row_idx in range(min(30, len(df))):
                for col_idx in range(len(df.columns)):
                    cell_value = str(df.iloc[row_idx, col_idx])
                    if keyword in cell_value:
                        print(f"  ✓ '{keyword}' 발견: 행 {row_idx + 1}, 열 {col_idx + 1} (값: {cell_value})")
                        found = True
            if not found:
                print(f"  ✗ '{keyword}' 미발견")

        # 숫자가 많이 있는 영역 찾기 (수량 영역 추정)
        print("\n\n📊 숫자 데이터 분포:\n")
        for col_idx in range(len(df.columns)):
            numeric_count = 0
            for row_idx in range(len(df)):
                try:
                    val = df.iloc[row_idx, col_idx]
                    if pd.notna(val) and isinstance(val, (int, float)) and val > 0:
                        numeric_count += 1
                except:
                    pass
            if numeric_count > 0:
                print(f"  열 {col_idx + 1}: {numeric_count}개의 숫자")

        # 첫 2개 시트만 분석
        if idx >= 2:
            print(f"\n⏩ 나머지 시트는 건너뜁니다.")
            break

    print("\n\n" + "=" * 80)
    print("✅ 분석 완료")
    print("=" * 80)

def extract_packing_data(file_path):
    """패킹리스트에서 실제 데이터 추출 - 오른쪽 표 기준"""
    print("\n\n" + "=" * 80)
    print("📦 패킹리스트 데이터 추출 (오른쪽 표 기준)")
    print("=" * 80)

    excel_file = pd.ExcelFile(file_path)
    all_products = []

    # 두 번째 시트부터 처리
    for idx, sheet_name in enumerate(excel_file.sheet_names[1:], start=2):
        print(f"\n🔍 시트 {idx} ({sheet_name}) 처리 중...")

        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

        # 오른쪽 표 영역 파악 (일반적으로 열 11부터)
        # 품명, 칼라 컬럼 찾기
        product_col = None
        color_col = None
        size_start_col = None

        # 첫 몇 행에서 헤더 찾기
        for row_idx in range(min(5, len(df))):
            for col_idx in range(10, min(28, len(df.columns))):
                cell_value = df.iloc[row_idx, col_idx]
                if pd.notna(cell_value):
                    cell_str = str(cell_value).strip()
                    if '품명' in cell_str and product_col is None:
                        product_col = col_idx
                        print(f"  ✓ 품명 컬럼 발견: 열 {col_idx + 1}")
                    elif '칼라' in cell_str or '색상' in cell_str:
                        if color_col is None:
                            color_col = col_idx
                            print(f"  ✓ 칼라 컬럼 발견: 열 {col_idx + 1}")

        # 사이즈 헤더 찾기 (120, 130, 140, ... L, FREE)
        size_columns = {}
        size_header_row = None

        for row_idx in range(min(5, len(df))):
            found_sizes = {}
            for col_idx in range(14, min(28, len(df.columns))):
                cell_value = df.iloc[row_idx, col_idx]
                if pd.notna(cell_value):
                    cell_str = str(cell_value).strip()
                    # 사이즈로 보이는 값 (숫자 또는 사이즈 문자)
                    if cell_str.replace('.', '').replace('0', '').isdigit() and len(cell_str) <= 4:
                        try:
                            size_num = int(float(cell_str))
                            if 100 <= size_num <= 250:  # 일반적인 사이즈 범위
                                found_sizes[col_idx] = str(size_num)
                        except ValueError:
                            pass # Not a valid number
                    elif cell_str in ['L', 'FREE', 'XL', 'XXL', 'S', 'M', 'XS']:
                        found_sizes[col_idx] = cell_str

            if len(found_sizes) > 5:  # 5개 이상의 사이즈가 발견되면 헤더로 간주
                size_columns = found_sizes
                size_header_row = row_idx
                print(f"  ✓ 사이즈 헤더 발견: 행 {row_idx + 1}")
                break

        if not size_columns:
            print(f"  ❌ 사이즈 컬럼을 찾을 수 없습니다.")
            continue

        print(f"\n  발견된 사이즈: {list(size_columns.values())}")

        # 데이터 행 추출 (헤더 다음 행부터)
        if size_header_row is not None:
            data_start_row = size_header_row + 1
        else:
            data_start_row = 2

        product_rows = []

        for row_idx in range(data_start_row, len(df)):
            # 품명 추출 (품명 컬럼이 있으면 그 컬럼에서, 없으면 왼쪽 영역에서)
            product_name = None
            color = None

            if product_col is not None:
                val = df.iloc[row_idx, product_col]
                if pd.notna(val):
                    product_name = str(val).strip()

            if color_col is not None:
                val = df.iloc[row_idx, color_col]
                if pd.notna(val):
                    color = str(val).strip()

            # 제품명이 없으면 스킵
            if not product_name or product_name in ['NaN', 'nan', '']:
                continue

            # 사이즈별 수량 추출
            quantities = {}
            for col_idx, size in size_columns.items():
                try:
                    qty_value = df.iloc[row_idx, col_idx]
                    if pd.notna(qty_value) and qty_value != '' and qty_value != 0:
                        try:
                            # 숫자로 변환
                            qty = float(qty_value)
                            # 0보다 큰 경우만
                            if qty > 0:
                                quantities[size] = int(qty)
                        except (ValueError, TypeError):
                            pass
                except IndexError:
                    pass

            # 수량이 있는 경우만 추가
            if quantities:
                product_rows.append({
                    'sheet': sheet_name,
                    'row': row_idx + 1,
                    'product_name': product_name,
                    'color': color if color else '-',
                    'quantities': quantities
                })

        print(f"  추출된 제품: {len(product_rows)}개")
        all_products.extend(product_rows)

    # 결과 출력
    print("\n\n" + "=" * 80)
    print("📋 추출 결과")
    print("=" * 80)
    print(f"\n총 추출된 제품 라인: {len(all_products)}개\n")

    # 샘플 출력
    for i, product in enumerate(all_products[:10], 1):
        print(f"\n{i}. {product['product_name']}")
        print(f"   칼라: {product['color']}")
        print(f"   사이즈별 수량:")
        for size, qty in product['quantities'].items():
            print(f"     - {size}: {qty}개")

    if len(all_products) > 10:
        print(f"\n... 외 {len(all_products) - 10}개 제품")

    # JSON으로 저장
    output_file = 'packing_list_structure.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)

    print(f"\n\n💾 구조 정보가 '{output_file}'에 저장되었습니다.")

    return all_products

if __name__ == '__main__':
    file_path = r'C:\Users\day\Documents\n8n\Upload Generator\list\20260115-OH-닝보출항.xls'

    # 1단계: 구조 분석
    analyze_excel_structure(file_path)

    # 2단계: 데이터 추출
    products = extract_packing_data(file_path)

    print("\n\n✅ 모든 분석이 완료되었습니다!")
