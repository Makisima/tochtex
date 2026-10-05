# -*- coding: utf-8 -*-
"""
Заменяет onclick на карточках services.html:
- было:  onclick="location.href='index.html#prices'"
- стало: onclick="location.href='index.html?tab=<slug>#prices'"

Slug определяется по <h3> внутри карточки.

Запуск: python tools/fix_services_card_links.py
"""

import os
import re


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# Соответствие: заголовок карточки → slug в prices.json
TITLE_TO_SLUG = {
    'Лазерная резка металла':              'лазерная',
    'Координатная пробивка':               'пробивка',
    'Гибка металла':                       'гибка',
    'Сварочные работы':                    'сварка',
    'Токарные работы':                     'токарка',
    'Фрезерные работы':                    'фрезерка',
    'Шлифовальные работы':                 'шлифовка',
    'Электроэрозионная обработка':         'электроэрозионная',
    'Обработка на станках с ЧПУ':          'чпу',
    'Порошковая окраска':                  'покраска',
    'Гальванические покрытия':             'гальваника',
    'SMT-монтаж печатных плат':            'сборка_кондиционеров',
    'Сборка жгутов и электромонтаж':       'сборка_жгутов',
    'Изготовление пресс-форм':             'прессформы',
    'Изготовление штампов':                'прессформы',  # отдельной вкладки нет — ведём на пресс-формы
    'Литьё пластмасс':                     'литьё_пластмасс',
}


def read_file(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write_file(path, content):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)


def process(content):
    """
    Идём по карточкам и заменяем onclick.
    Карточка: <div class="service-card-full" onclick="...">...<h3>ЗАГОЛОВОК</h3>...
    """
    results = []

    # Шаблон: находим карточку service-card-full и следующий за ней <h3>...</h3>
    # Учитываем, что между onclick и <h3> может быть до 500 символов (icon, отступы)
    pattern = re.compile(
        r'<div\s+class="service-card-full"\s+onclick="'
        r'(location\.href=\'index\.html)(#prices)(\')'
        r'([^>]*>.*?<h3>)([^<]+)(</h3>)',
        re.DOTALL
    )

    def replacer(match):
        prefix = match.group(1)   # location.href='index.html
        hash_part = match.group(2)  # #prices
        closing = match.group(3)  # '
        middle = match.group(4)   # '"...> ... <h3>
        title = match.group(5).strip()
        after_title = match.group(6)  # </h3>

        slug = TITLE_TO_SLUG.get(title)

        if not slug:
            results.append('ПРОПУЩЕНО (нет slug): {0}'.format(title))
            return match.group(0)

        new_onclick = (
            '<div class="service-card-full" onclick="'
            + prefix
            + '?tab=' + slug
            + hash_part
            + closing
        )
        results.append('OK: {0} -> ?tab={1}'.format(title, slug))
        return new_onclick + middle + title + after_title

    new_content = pattern.sub(replacer, content)
    return new_content, results


def main():
    print('Корень проекта: {0}'.format(ROOT))
    print('')

    path = os.path.join(ROOT, 'services.html')
    if not os.path.exists(path):
        print('Файл не найден: {0}'.format(path))
        return

    content = read_file(path)

    # Проверим, не применена ли уже замена
    if 'index.html?tab=' in content:
        print('Правка уже применена (в файле есть ?tab=).')
        print('Ничего не меняем.')
        return

    new_content, results = process(content)

    print('=== Результаты ===')
    for r in results:
        print('  ' + r)
    print('')

    if new_content != content:
        write_file(path, new_content)
        print('Записано: {0}'.format(path))
        print('Всего замен: {0}'.format(len([r for r in results if r.startswith('OK')])))
    else:
        print('Изменений нет.')


if __name__ == '__main__':
    main()