# -*- coding: utf-8 -*-
"""
실제 패킹리스트 파일에서 데이터 추출

이미지 분석 결과:
- 오른쪽 표 구조: 제품사진 | 품명 | 칼라 | 합계 | 120 | 130 | 140 | ... | L | FREE
- 열 11: 품명
- 열 12: 칼라
- 열 14~27: 사이즈별 수량 (120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, L, FREE)
"""

import sys
import pandas as pd
import json

# UTF-8 출력 설정 (Windows 호환)
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def extract_packing_list(file_path):
    """패킹리스트에서 품명, 칼라, 사이즈별 수량 추출"""
    print("=" * 80)
    print("📦 패킹리스트 데이터 추출")
    print("=" * 80)
    print(f"\n파일: {file_path}\n")

    excel_file = pd.ExcelFile(file_path)
    all_products = []

    # 두 번째 시트부터 처리 (첫 번째는 통관용)
    for sheet_idx, sheet_name in enumerate(excel_file.sheet_names[1:], start=2):
        print(f"\n{'=' * 80}")
        print(f"🔍 시트 {sheet_idx}: {sheet_name}")
        print(f"{'=' * 80}\n")

        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

        # 오른쪽 표의 품명, 칼라, 사이즈 컬럼 찾기
        product_col = 11  # 품명 열
        color_col = 12    # 칼라 열

        # 사이즈 행 찾기 (2행: 120, 130, 140, ... L, FREE)
        size_row = 1
        sizes = []
        size_cols = []

        for col_idx in range(14, min(28, len(df.columns))):
            try:
                cell_value = df.iloc[size_row, col_idx]
                if pd.notna(cell_value):
                    size_str = str(cell_value).strip()
                    # 숫자 사이즈 또는 L, FREE 등
                    try:
                        size_num = int(float(size_str))
                        if 100 <= size_num <= 250:
                            sizes.append(str(size_num))
                            size_cols.append(col_idx)
                            print(f"  ✓ 사이즈 발견: 열 {col_idx + 1} = {size_num}")
                    except ValueError:
                        if size_str in ['L', 'FREE', 'XL', 'M', 'S']:
                            sizes.append(size_str)
                            size_cols.append(col_idx)
                            print(f"  ✓ 사이즈 발견: 열 {col_idx + 1} = {size_str}")
            except:
                pass

        print(f"\n  총 {len(sizes)}개 사이즈: {sizes}\n")

        # 데이터 행 추출 (3행부터)
        extracted_count = 0
        for row_idx in range(2, len(df)):
            # 품명 추출
            product_name = None
            color = None

            try:
                prod_val = df.iloc[row_idx, product_col]
                if pd.notna(prod_val):
                    product_name = str(prod_val).strip()

                color_val = df.iloc[row_idx, color_col]
                if pd.notna(color_val):
                    color = str(color_val).strip()
            except:
                continue

            # 제품명이 유효한지 확인 (NaN, 빈 문자열 제외)
            if not product_name or product_name in ['nan', 'NaN', '']:
                continue

            # 사이즈별 수량 추출
            quantities = {}
            for size, col_idx in zip(sizes, size_cols):
                try:
                    qty_val = df.iloc[row_idx, col_idx]
                    if pd.notna(qty_val) and qty_val != '':
                        try:
                            qty = float(qty_val)
                            # 0보다 큰 수량만 추가
                            if qty > 0:
                                quantities[size] = int(qty)
                        except (ValueError, TypeError):
                            pass
                except IndexError:
                    pass

            # 수량이 있는 제품만 추가
            if quantities:
                product_data = {
                    'sheet': sheet_name,
                    'product_name': product_name,
                    'color': color if color else '-',
                    'quantities': quantities
                }
                all_products.append(product_data)
                extracted_count += 1

                # 처음 5개만 출력
                if extracted_count <= 5:
                    print(f"  ✓ {product_name} ({color if color else '-'})")
                    for size, qty in quantities.items():
                        print(f"      {size}: {qty}개")

        print(f"\n  추출 완료: {extracted_count}개 제품\n")

    # 전체 결과 출력
    print("\n" + "=" * 80)
    print("📊 전체 추출 결과")
    print("=" * 80)
    print(f"\n총 제품 수: {len(all_products)}개\n")

    # 샘플 5개 출력
    print("샘플 데이터:\n")
    for i, prod in enumerate(all_products[:5], 1):
        total_qty = sum(prod['quantities'].values())
        print(f"{i}. {prod['product_name']} - {prod['color']}")
        print(f"   사이즈: {', '.join(prod['quantities'].keys())}")
        print(f"   총 수량: {total_qty}개\n")

    # JSON으로 저장
    output_file = 'extracted_products.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)

    print(f"💾 데이터가 '{output_file}'에 저장되었습니다.")

    return all_products

if __name__ == '__main__':
    file_path = r'C:\Users\day\Documents\n8n\Upload Generator\list\20260115-OH-닝보출항.xls'
    products = extract_packing_list(file_path)
    print(f"\n✅ 추출 완료: 총 {len(products)}개 제품")
