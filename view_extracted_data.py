# -*- coding: utf-8 -*-
"""
추출된 데이터를 보기 좋게 표시하는 스크립트
"""

import sys
import json

# UTF-8 출력 설정
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def display_products():
    """추출된 제품 데이터를 표 형식으로 출력"""

    # JSON 파일 읽기
    with open('extracted_products.json', 'r', encoding='utf-8') as f:
        products = json.load(f)

    print("=" * 100)
    print("📊 패킹리스트 분석 결과")
    print("=" * 100)
    print(f"\n총 제품 수: {len(products)}개\n")

    # 전체 수량 계산
    total_qty = sum(sum(p['quantities'].values()) for p in products)
    print(f"총 수량: {total_qty:,}개\n")

    print("-" * 100)
    print(f"{'No':^4} | {'제품명':^20} | {'칼라':^10} | {'사이즈별 수량'}")
    print("-" * 100)

    for idx, product in enumerate(products, 1):
        product_name = product['product_name']
        color = product['color']
        quantities = product['quantities']

        # 사이즈별 수량을 문자열로 변환
        qty_str = ', '.join([f"{size}:{qty}" for size, qty in quantities.items()])
        item_total = sum(quantities.values())

        print(f"{idx:^4} | {product_name:^20} | {color:^10} | {qty_str}")
        print(f"     |  {'':^20} | {'':^10} | 소계: {item_total}개")
        print("-" * 100)

    print("\n")
    print("=" * 100)
    print("📋 제품별 요약")
    print("=" * 100)

    # 제품별로 그룹화
    product_summary = {}
    for p in products:
        key = p['product_name']
        if key not in product_summary:
            product_summary[key] = {'colors': {}, 'total': 0}

        product_summary[key]['colors'][p['color']] = sum(p['quantities'].values())
        product_summary[key]['total'] += sum(p['quantities'].values())

    for product_name, data in product_summary.items():
        print(f"\n🔹 {product_name}")
        for color, qty in data['colors'].items():
            print(f"   - {color}: {qty:,}개")
        print(f"   ✓ 소계: {data['total']:,}개")

    print("\n" + "=" * 100)

if __name__ == '__main__':
    display_products()
