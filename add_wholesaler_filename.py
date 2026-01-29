# -*- coding: utf-8 -*-
"""
도매인, 파일명이 포함된 테스트 데이터 생성
"""

import sys
import json

# UTF-8 출력 설정
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# 기존 데이터 읽기
with open('extracted_products.json', 'r', encoding='utf-8') as f:
    products = json.load(f)

# 도매인과 파일명 추가
for product in products:
    product['wholesaler'] = 'OH-오즈'
    product['file_name'] = '20260115-OH-닝보출항.xls'

# 저장
with open('extracted_products.json', 'w', encoding='utf-8') as f:
    json.dump(products, f, ensure_ascii=False, indent=2)

print("✅ 도매인과 파일명이 추가되었습니다!")
print(f"   도매인: OH-오즈")
print(f"   파일명: 20260115-OH-닝보출항.xls")
print(f"   총 {len(products)}개 제품")
