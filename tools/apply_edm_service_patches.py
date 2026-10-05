# -*- coding: utf-8 -*-
"""
Применяет две правки для добавления ЭЭО как услуги:

1. calculator.html — опция «Электроэрозионная обработка» в <select name="service">
2. services.html — ссылка на статью в карточке ЭЭО

Запуск: python tools/apply_edm_service_patches.py
"""

import os
import sys


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_file(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write_file(path, content):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)


def detect_newline(content):
    return '\r\n' if '\r\n' in content else '\n'


# ==========================================================
#  ПАТЧ 1. calculator.html — опция в <select>
# ==========================================================
def apply_calculator_patch(content):
    """
    Добавляет опцию ЭЭО в <select> формы заявки.

    Логика: находим фрагмент
        <option value="Токарно-фрезерные">Токарно-фрезерные</option>
        <option value="Пресс-формы">Пресс-формы</option>
    и вставляем между ними опцию ЭЭО.
    """
    marker = 'Электроэрозионная обработка</option>'

    if marker in content:
        return content, 'уже применено'

    old = (
        '<option value="Токарно-фрезерные">Токарно-фрезерные</option>'
    )

    count = content.count(old)
    if count == 0:
        return content, 'НЕ НАЙДЕНА строка с «Токарно-фрезерные» в <select>'
    if count > 1:
        return content, 'НАЙДЕНО {0} совпадений, не меняю'.format(count)

    # Определяем отступ и newline из контекста
    idx = content.find(old)
    line_start = content.rfind('\n', 0, idx) + 1
    indent = content[line_start:idx]  # пробелы перед <option>

    newline = detect_newline(content)

    new_option = (
        '<option value="Электроэрозионная обработка">'
        'Электроэрозионная обработка</option>'
    )

    replacement = old + newline + indent + new_option
    return content.replace(old, replacement, 1), 'заменено'


# ==========================================================
#  ПАТЧ 2. services.html — ссылка на статью в карточке ЭЭО
# ==========================================================
def apply_services_patch(content):
    """
    Добавляет ссылку на статью ЭЭО в карточку на services.html.

    Логика: находим блок карточки ЭЭО и добавляем <a> после <span class="badge">.
    """
    marker = 'elektroerozionnaya-obrabotka-metalla.html'

    if marker in content:
        return content, 'уже применено'

    # Уникальный фрагмент — <h3>Электроэрозионная обработка</h3>
    # Найдём карточку целиком по фрагменту описания
    old = (
        '<span class="badge">индивидуальный расчёт</span>\n'
        '                    </div>\n'
        '                </div>\n'
        '            </div>\n'
        '        </section>\n\n'
        '        <!-- ===== 3. ПОКРЫТИЯ ===== -->'
    )

    # Проверим, что такой фрагмент есть (нормализуем newline)
    newline = detect_newline(content)
    old_norm = old.replace('\n', newline)

    count = content.count(old_norm)
    if count == 0:
        # Альтернативный поиск — по контексту карточки
        # Ищем описание ЭЭО и <span class="badge">
        desc = 'Проволочно-вырезной Sodick AQ300L и прошивной AD3L. Точность до 0.001 мм.'
        idx = content.find(desc)
        if idx == -1:
            return content, 'НЕ НАЙДЕНА карточка ЭЭО (описание не найдено)'

        # Ищем следующий </div> после этого фрагмента
        close_badge = '<span class="badge">индивидуальный расчёт</span>'
        badge_idx = content.find(close_badge, idx)
        if badge_idx == -1:
            return content, 'НЕ НАЙДЕН badge в карточке ЭЭО'

        # Конец badge
        badge_end = badge_idx + len(close_badge)

        # Определяем отступ
        line_start = content.rfind('\n', 0, badge_idx) + 1
        indent = content[line_start:badge_idx]

        link = (
            newline
            + indent
            + '<a href="blog/tehnologii/elektroerozionnaya-obrabotka-metalla.html" '
            + 'onclick="event.stopPropagation();" '
            + 'style="font-size: 13px; color: var(--accent); text-decoration: none; font-weight: 600; margin-top: 4px;">'
            + '📄 Подробнее об ЭЭО →</a>'
        )

        new_content = content[:badge_end] + link + content[badge_end:]
        return new_content, 'заменено (по контексту описания)'

    # Основной путь — замена по контексту
    if count > 1:
        return content, 'НАЙДЕНО {0} совпадений, не меняю'.format(count)

    # Определяем отступ по позиции бейджа
    badge = '<span class="badge">индивидуальный расчёт</span>'
    badge_idx = content.find(badge, content.find('Электроэрозионная обработка'))
    if badge_idx == -1:
        return content, 'НЕ НАЙДЕН badge для ЭЭО'

    badge_end = badge_idx + len(badge)
    line_start = content.rfind('\n', 0, badge_idx) + 1
    indent = content[line_start:badge_idx]

    link = (
        newline
        + indent
        + '<a href="blog/tehnologii/elektroerozionnaya-obrabotka-metalla.html" '
        + 'onclick="event.stopPropagation();" '
        + 'style="font-size: 13px; color: var(--accent); text-decoration: none; font-weight: 600; margin-top: 4px;">'
        + '📄 Подробнее об ЭЭО →</a>'
    )

    new_content = content[:badge_end] + link + content[badge_end:]
    return new_content, 'заменено'


# ==========================================================
#  MAIN
# ==========================================================
def process(path, patch_fn, label):
    print('--- {0} ---'.format(label))

    if not os.path.exists(path):
        print('  ФАЙЛ НЕ НАЙДЕН: {0}'.format(path))
        return False

    content = read_file(path)
    new_content, status = patch_fn(content)
    print('  {0}'.format(status))

    if new_content != content:
        write_file(path, new_content)
        print('  Записано: {0}'.format(path))
    return True


def main():
    print('Корень проекта: {0}'.format(ROOT))
    print('')

    process(
        os.path.join(ROOT, 'calculator.html'),
        apply_calculator_patch,
        'calculator.html — опция ЭЭО в <select>'
    )

    process(
        os.path.join(ROOT, 'services.html'),
        apply_services_patch,
        'services.html — ссылка на статью в карточке ЭЭО'
    )

    print('')
    print('Готово.')


if __name__ == '__main__':
    main()