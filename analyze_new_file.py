# -*- coding: utf-8 -*-
"""
새로운 패킹리스트 파일 구조 분석
파일: 20260120- 닝보 FCL.xls
"""

import sys
import pandas as pd

# UTF-8 출력 설정
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def analyze_new_file(file_path):
    """새 파일의 모든 시트 구조 분석"""
    print("=" * 100)
    print("📊 새로운 패킹리스트 파일 분석")
    print("=" * 100)
    print(f"\n파일: {file_path}\n")

    excel_file = pd.ExcelFile(file_path)

    print(f"📑 총 시트 개수: {len(excel_file.sheet_names)}\n")
    print(f"시트 목록: {excel_file.sheet_names}\n")

    for idx, sheet_name in enumerate(excel_file.sheet_names):
        print("\n" + "=" * 100)
        print(f"🔍 시트 {idx + 1}: {sheet_name}")
        print("=" * 100)

        if idx == 0:
            print("⏩ 첫 번째 시트는 통관용이므로 건너뜁니다.\n")
            continue

        df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

        print(f"\n📏 시트 크기: {df.shape[0]} 행 x {df.shape[1]} 열\n")

        # 처음 30행 출력
        print("🔍 데이터 미리보기 (처음 30행):\n")
        print(df.head(30).to_string())

        # 키워드 찾기
        print("\n\n📌 주요 키워드 위치:\n")
        keywords = ['품명', '칼라', '색상', '사이즈', 'SIZE', '수량', 'QTY', '120', '130', '140', 'FREE', 'L']

        for keyword in keywords:
            found_positions = []
            for row_idx in range(min(20, len(df))):
                for col_idx in range(len(df.columns)):
                    cell_value = str(df.iloc[row_idx, col_idx])
                    if keyword in cell_value:
                        found_positions.append(f"행{row_idx+1},열{col_idx+1}")

            if found_positions:
                print(f"  '{keyword}': {', '.join(found_positions[:5])}")

        print(f"\n{'=' * 100}\n")

if __name__ == '__main__':
    file_path = r'C:\Users\day\Documents\n8n\Upload Generator\list\20260120- 닝보 FCL.xls'
    analyze_new_file(file_path)

    print("\n✅ 분석 완료!")
