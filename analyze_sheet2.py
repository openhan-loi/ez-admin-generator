# -*- coding: utf-8 -*-
"""
두 번째 시트 상세 분석 (다른 구조)
"""

import sys
import pandas as pd

# UTF-8 출력 설정
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

file_path = r'C:\Users\day\Documents\n8n\Upload Generator\list\20260120- 닝보 FCL.xls'

# 두 번째 시트 읽기
excel_file = pd.ExcelFile(file_path)
sheet_name = excel_file.sheet_names[1]  # 두 번째 시트

print("=" * 100)
print(f"🔍 두 번째 시트 상세 분석: {sheet_name}")
print("=" * 100)

df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

print(f"\n시트 크기: {df.shape[0]} 행 x {df.shape[1]} 열\n")

# 처음 50행을 모두 출력
print("📋 전체 데이터 (처음 50행):\n")
for idx in range(min(50, len(df))):
    row_data = df.iloc[idx].tolist()
    print(f"행 {idx+1:3d}: {row_data}")

print("\n\n" + "=" * 100)
print("분석 완료")
