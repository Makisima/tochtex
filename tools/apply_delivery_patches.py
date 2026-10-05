# -*- coding: utf-8 -*-
"""
Применяет правки в трёх файлах:
1. calculator.html — примечание в блоке доставки
2. js/calculator.js — примечание в __getDeliverySummary
3. privacy.html — пункты 4.3 и 4.4 про ПЭК + обновление даты

Запуск: python tools/apply_delivery_patches.py
"""

import os


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_file(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write_file(path, content):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)


def detect_newline(content):
    return '\r\n' if '\r\n' in content else '\n'


def apply_patch_1(content):
    """calculator.html — примечание в блоке доставки."""
    old = 'Забор груза с производства включён в стоимость. Расчёт ориентировочный.'
    new = (
        'Забор груза с производства включён в стоимость. Расчёт ориентировочный, '
        'для средней зоны города. Точная стоимость доставки до адреса — '
        'после уточнения адреса и условий разгрузки у менеджера.'
    )

    if new in content:
        return content, 'уже применено'
    count = content.count(old)
    if count == 0:
        return content, 'НЕ НАЙДЕНА старая строка'
    if count > 1:
        return content, 'НАЙДЕНО {0} совпадений, не меняю'.format(count)
    return content.replace(old, new), 'заменено'


def apply_patch_2(content):
    """js/calculator.js — примечание в __getDeliverySummary."""
    old = "lines.push('Доставка итого: ' + fmtMoney(lastResult.cost_total));"
    marker = "после уточнения адреса и условий разгрузки"

    if marker in content:
        return content, 'уже применено'

    count = content.count(old)
    if count == 0:
        return content, 'НЕ НАЙДЕНА старая строка'
    if count > 1:
        return content, 'НАЙДЕНО {0} совпадений, не меняю'.format(count)

    newline = detect_newline(content)
    indent = ' ' * 12
    new = (
        old + newline
        + indent + "lines.push('(Расчёт ориентировочный, для средней зоны города. "
        + "Точная стоимость — после уточнения адреса и условий разгрузки.)');"
    )
    return content.replace(old, new), 'заменено'


def apply_patch_3(content):
    """privacy.html — пункты 4.3 и 4.4 + обновление даты."""
    results = []

    # --- 4.3, 4.4 ---
    old_p42 = '<p>4.2. Оператор не передаёт персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ.</p>'
    marker = 'обезличенные данные о грузе'

    if marker in content:
        results.append('4.3/4.4 — уже применено')
    else:
        count = content.count(old_p42)
        if count == 0:
            results.append('4.2 — НЕ НАЙДЕН (правка 4.3/4.4 не применена)')
        elif count > 1:
            results.append('4.2 — НАЙДЕНО {0} совпадений, не меняю'.format(count))
        else:
            newline = detect_newline(content)
            indent = ' ' * 12
            add = (
                newline
                + indent + '<p>4.3. Для расчёта ориентировочной стоимости доставки '
                + 'обезличенные данные о грузе (город доставки, габариты, вес, '
                + 'количество мест) могут передаваться в API транспортной компании '
                + 'ПЭК (Первая Экспедиционная Компания). Персональные данные '
                + 'Пользователя (имя, телефон, email) при этом не передаются.</p>'
                + newline
                + indent + '<p>4.4. IP-адрес посетителя временно логируется для '
                + 'защиты от автоматических запросов (rate limiting) и не передаётся '
                + 'третьим лицам.</p>'
            )
            content = content.replace(old_p42, old_p42 + add)
            results.append('4.3/4.4 — добавлены')

    # --- Дата ---
    old_date = 'Дата последнего обновления: 15 сентября 2026 г.'
    new_date = 'Дата последнего обновления: 4 октября 2026 г.'
    if new_date in content:
        results.append('дата — уже обновлена')
    elif old_date in content:
        content = content.replace(old_date, new_date)
        results.append('дата — обновлена')
    else:
        results.append('дата — НЕ НАЙДЕНА')

    return content, '; '.join(results)


def process(path, patch_fn, label):
    print('--- {0} ---'.format(label))
    if not os.path.exists(path):
        print('  ФАЙЛ НЕ НАЙДЕН: {0}'.format(path))
        return
    content = read_file(path)
    new_content, status = patch_fn(content)
    print('  {0}'.format(status))
    if new_content != content:
        write_file(path, new_content)
        print('  Записано: {0}'.format(path))


def main():
    print('Корень проекта: {0}'.format(ROOT))
    print('')

    process(
        os.path.join(ROOT, 'calculator.html'),
        apply_patch_1,
        'calculator.html'
    )
    process(
        os.path.join(ROOT, 'js', 'calculator.js'),
        apply_patch_2,
        'js/calculator.js'
    )
    process(
        os.path.join(ROOT, 'privacy.html'),
        apply_patch_3,
        'privacy.html'
    )

    print('')
    print('Готово.')


if __name__ == '__main__':
    main()