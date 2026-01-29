# -*- coding: utf-8 -*-
"""
JSON 데이터를 CSV(엑셀) 형식으로 변환
"""

import sys
import json
import csv

# UTF-8 출력 설정
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def json_to_csv():
    """JSON을 CSV로 변환 (엑셀에서 열 수 있는 형식)"""

    # JSON 파일 읽기
    with open('extracted_products.json', 'r', encoding='utf-8') as f:
        products = json.load(f)

    # CSV 파일로 저장
    output_file = 'extracted_products.csv'

    with open(output_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)

        # 헤더 (도매인, 파일명 추가)
        writer.writerow(['번호', '도매인', '파일명', '시트', '제품명', '칼라', '사이즈', '수량'])

        # 데이터
        row_num = 1
        for product in products:
            wholesaler = product.get('wholesaler', '-')
            file_name = product.get('fileName', '-')
            sheet = product['sheet']
            product_name = product['product_name']
            color = product['color']

            # 각 사이즈별로 행 추가
            for size, quantity in product['quantities'].items():
                writer.writerow([
                    row_num,
                    wholesaler,
                    file_name,
                    sheet,
                    product_name,
                    color,
                    size,
                    quantity
                ])
                row_num += 1

    print("=" * 80)
    print("📊 CSV 변환 완료")
    print("=" * 80)
    print(f"\n파일: {output_file}")
    print(f"인코딩: UTF-8 with BOM (엑셀 호환)")
    print(f"총 행 수: {row_num - 1}개")
    print()
    print("✅ 엑셀에서 바로 열 수 있습니다!")
    print()

if __name__ == '__main__':
    json_to_csv()
