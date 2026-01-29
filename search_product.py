# -*- coding: utf-8 -*-
"""
제품 검색 스크립트 - 제품명/칼라/사이즈로 수량 조회
"""

import sys
import json

# UTF-8 출력 설정
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def search_product(product_name=None, color=None, size=None):
    """제품 검색 및 수량 조회"""

    # JSON 파일 읽기
    with open('extracted_products.json', 'r', encoding='utf-8') as f:
        products = json.load(f)

    print("=" * 80)
    print("🔍 제품 검색")
    print("=" * 80)

    if product_name:
        print(f"제품명: {product_name}")
    if color:
        print(f"칼라: {color}")
    if size:
        print(f"사이즈: {size}")
    print()

    # 검색
    results = []
    for p in products:
        match = True

        if product_name and product_name.lower() not in p['product_name'].lower():
            match = False

        if color and color.lower() not in p['color'].lower():
            match = False

        if match:
            if size:
                # 특정 사이즈만
                if size in p['quantities']:
                    results.append({
                        'product': p['product_name'],
                        'color': p['color'],
                        'size': size,
                        'quantity': p['quantities'][size]
                    })
            else:
                # 모든 사이즈
                for s, qty in p['quantities'].items():
                    results.append({
                        'product': p['product_name'],
                        'color': p['color'],
                        'size': s,
                        'quantity': qty,
                        'wholesaler': p.get('wholesaler', '-'), # 도매인 추가
                        'file_name': p.get('file_name', '-') # 파일명 추가
                    })

    # 결과 출력
    if results:
        print(f"📊 검색 결과: {len(results)}개\n")
        print("-" * 100)
        print(f"{'도매인':^15} | {'파일명':^25} | {'제품명':^20} | {'칼라':^10} | {'사이즈':^8} | {'수량':^10}")
        print("-" * 100)

        total = 0
        for r in results:
            wholesaler = r.get('wholesaler', '-')
            file_name = r.get('file_name', '-')
            # 파일명이 너무 길면 축약
            if len(file_name) > 23:
                file_name = file_name[:20] + '...'

            print(f"{wholesaler:^15} | {file_name:^25} | {r['product']:^20} | {r['color']:^10} | {r['size']:^8} | {r['quantity']:^10,}개")
            total += r['quantity']

        print("-" * 100)
        print(f"{'':^15} | {'':^25} | {'':^20} | {'':^10} | {'합계':^8} | {total:^10,}개")
        print("-" * 100)
    else:
        print("❌ 검색 결과가 없습니다.")

    print()

def show_all_products():
    """전체 제품 목록 표시"""

    with open('extracted_products.json', 'r', encoding='utf-8') as f:
        products = json.load(f)

    print("=" * 80)
    print("📋 전체 제품 목록")
    print("=" * 80)
    print()

    # 제품명 목록
    product_names = sorted(set(p['product_name'] for p in products))
    print("🔹 제품명:")
    for name in product_names:
        colors = sorted(set(p['color'] for p in products if p['product_name'] == name))
        print(f"   - {name} ({', '.join(colors)})")

    print()

def interactive_search():
    """대화형 검색"""

    print("\n" + "=" * 80)
    print("🔍 제품 수량 조회 시스템")
    print("=" * 80)
    print()

    show_all_products()

    print("\n검색 조건을 입력하세요 (비워두면 전체 검색):")
    print("-" * 80)

    product_name = input("제품명 (예: 루비하트, 바다공주): ").strip()
    color = input("칼라 (예: 핑크, 실버): ").strip()
    size = input("사이즈 (예: 180, 140, FREE): ").strip()

    print()
    search_product(
        product_name=product_name if product_name else None,
        color=color if color else None,
        size=size if size else None
    )

if __name__ == '__main__':
    import sys

    # 명령줄 인자가 있으면 직접 검색
    if len(sys.argv) > 1:
        product = sys.argv[1] if len(sys.argv) > 1 else None
        color = sys.argv[2] if len(sys.argv) > 2 else None
        size = sys.argv[3] if len(sys.argv) > 3 else None

        search_product(product, color, size)
    else:
        # 대화형 모드
        interactive_search()
