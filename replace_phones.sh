#!/bin/bash
# replace_phones.sh
# Замена +7 (903) 002-18-83 → +7 (939) 440-40-01 во всех файлах проекта
# Запуск: bash replace_phones.sh

set -e

PROJECT_DIR="/c/Users/W/Documents/Завод Рязань/Vebsite_zavod_Ryazan_2"
cd "$PROJECT_DIR"

OLD_TEL="tel:+79030021883"
NEW_TEL="tel:+79394404001"
OLD_TEXT="+7 (903) 002-18-83"
NEW_TEXT="+7 (939) 440-40-01"
OLD_NUM="+79030021883"
NEW_NUM="+79394404001"

# === 0. Проверка BOM (правило 8.1) ===
echo "=== Проверка BOM ==="
BOM_FOUND=0
for f in index.html about.html contacts.html services.html calculator.html \
         privacy.html requisites.html thanks.html \
         blog/index.html \
         blog/tehnologii/elektroerozionnaya-obrabotka-metalla.html \
         blog/tehnologii/kak-rasschitat-stoimost-lazernoy-rezki.html \
         send.php js/calculator.js js/main.js; do
    if [ -f "$f" ]; then
        BOM=$(head -c 3 "$f" | od -An -tx1 | tr -d ' \n')
        if [ "$BOM" = "efbbbf" ]; then
            echo "⚠️ BOM в $f — убираю"
            sed -i '1s/^\xEF\xBB\xBF//' "$f"
            BOM_FOUND=1
        fi
    fi
done
[ "$BOM_FOUND" = "0" ] && echo "✅ BOM не найден"
echo ""

# === 1. Бэкап ===
BACKUP="phone_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
echo "=== Создаю бэкап: $BACKUP ==="
tar --exclude='./.git' --exclude='./vendor' --exclude='./node_modules' \
    --exclude='./phone_backup_*.tar.gz' \
    -czf "$BACKUP" .
echo "✅ Бэкап: $BACKUP"
echo ""

# === 2. Список файлов ===
FILES=$(find . -type f \( -name "*.html" -o -name "*.php" -o -name "*.js" \) \
    -not -path "./.git/*" \
    -not -path "./vendor/*" \
    -not -path "./node_modules/*" \
    -not -path "./phone_backup_*")

echo "=== Файлы для замены ==="
echo "$FILES" | sed 's|^\./||'
echo ""

# === 3. Замены ===
echo "=== Выполняю замены ==="
for f in $FILES; do
    sed -i "s|${OLD_TEL}|${NEW_TEL}|g" "$f"
    sed -i "s|${OLD_TEXT}|${NEW_TEXT}|g" "$f"
    sed -i "s|${OLD_NUM}|${NEW_NUM}|g" "$f"
done
echo "✅ Замены выполнены"
echo ""

# === 4. Проверка остатков ===
echo "=== Проверка остатков старого номера ==="
REMAIN=$(grep -rn "903.*002.*18.*83\|79030021883" . \
    --include="*.html" --include="*.php" --include="*.js" \
    2>/dev/null | grep -v phone_backup || true)

if [ -z "$REMAIN" ]; then
    echo "✅ Старый номер полностью заменён"
else
    echo "⚠️ Найдены остатки:"
    echo "$REMAIN"
fi
echo ""

# === 5. Показать новые вхождения ===
echo "=== Новые вхождения (первые 80) ==="
grep -rn "79394404001\|+7 (939) 440-40-01" . \
    --include="*.html" --include="*.php" --include="*.js" \
    2>/dev/null | grep -v phone_backup | sed 's|^\./||' | head -80

echo ""
echo "=== Готово! Дальнейшие шаги ==="
echo "1. Отредактировать contacts.html — добавить 3 телефона (см. инструкцию)"
echo "2. Увеличить ?v=7 → ?v=8 во всех HTML (т.к. менялся calculator.js)"
echo "3. Проверить синтаксис send.php: php8.2 -l send.php (на сервере)"
echo "4. Очистить кэш nginx: ssh mmatve1x@tochtex.ru \"rm -rf ~/.nginx/cache/*\""
echo "5. Проверить сайт в инкогнито"
