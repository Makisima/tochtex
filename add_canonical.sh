#!/bin/bash
# add_canonical.sh
# Добавление <link rel="canonical"> в основные страницы сайта
# thanks.html получает noindex вместо canonical

PROJECT_DIR="/c/Users/W/Documents/Завод Рязань/Vebsite_zavod_Ryazan_2"
cd "$PROJECT_DIR" || { echo "❌ Не найден путь проекта"; exit 1; }

# === 1. Бэкап ===
BACKUP="canonical_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
echo "=== Создаю бэкап: $BACKUP ==="
tar --exclude='./.git' --exclude='./vendor' --exclude='./node_modules' \
    --exclude='./phone_backup_*.tar.gz' --exclude='./canonical_backup_*.tar.gz' \
    -czf "$BACKUP" . 2>/dev/null
echo "✅ Бэкап: $BACKUP"
echo ""

# === 2. Проверка BOM (правило 8.1) ===
echo "=== Проверка BOM ==="
for f in index.html about.html services.html calculator.html contacts.html \
         privacy.html requisites.html thanks.html; do
    [ -f "$f" ] || continue
    BOM=$(head -c 3 "$f" | od -An -tx1 | tr -d ' \n')
    if [ "$BOM" = "efbbbf" ]; then
        echo "⚠️  BOM в $f — убираю"
        sed -i '1s/^\xEF\xBB\xBF//' "$f"
    fi
done
echo "✅ Проверка BOM завершена"
echo ""

# === 3. Список файлов: path|canonical URL ===
FILES="index.html|https://tochtex.ru/
about.html|https://tochtex.ru/about.html
services.html|https://tochtex.ru/services.html
calculator.html|https://tochtex.ru/calculator.html
contacts.html|https://tochtex.ru/contacts.html
privacy.html|https://tochtex.ru/privacy.html
requisites.html|https://tochtex.ru/requisites.html"

# === 4. Обработка ===
echo "=== Обработка файлов ==="
echo "$FILES" | while IFS='|' read -r file url; do
    [ -z "$file" ] && continue
    [ -z "$url" ] && continue

    if [ ! -f "$file" ]; then
        echo "⚠️  $file — не найден"
        continue
    fi

    # Пропускаем, если canonical уже есть
    if grep -q 'rel="canonical"' "$file"; then
        echo "⏭️  $file — canonical уже есть"
        continue
    fi

    # Проверяем наличие preconnect для вставки
    if ! grep -q '<link rel="preconnect" href="https://fonts.googleapis.com">' "$file"; then
        echo "⚠️  $file — не найден preconnect, пропускаю"
        continue
    fi

    # Вставляем canonical перед preconnect
    sed -i "s|<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">|    <link rel=\"canonical\" href=\"${url}\">\n    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">|" "$file"

    echo "✅ $file → $url"
done

# === 5. thanks.html — noindex вместо canonical ===
echo ""
echo "=== Обработка thanks.html ==="
if [ -f "thanks.html" ]; then
    if grep -q 'name="robots"' "thanks.html"; then
        echo "⏭️  thanks.html — robots meta уже есть"
    elif grep -q '<link rel="preconnect" href="https://fonts.googleapis.com">' "thanks.html"; then
        sed -i 's|<link rel="preconnect" href="https://fonts.googleapis.com">|    <meta name="robots" content="noindex, nofollow">\n    <link rel="preconnect" href="https://fonts.googleapis.com">|' "thanks.html"
        echo "✅ thanks.html → добавлен noindex, nofollow"
    else
        echo "⚠️  thanks.html — не найден preconnect, добавляю вручную не получится"
    fi
else
    echo "⚠️  thanks.html не найден"
fi

# === 6. Проверка ===
echo ""
echo "=== Проверка результата ==="
printf "%-20s %-12s %-12s\n" "Файл" "canonical" "robots"
for f in index.html about.html services.html calculator.html contacts.html \
         privacy.html requisites.html thanks.html \
         blog/index.html \
         blog/tehnologii/kak-rasschitat-stoimost-lazernoy-rezki.html \
         blog/tehnologii/elektroerozionnaya-obrabotka-metalla.html; do
    [ -f "$f" ] || continue
    CANON=$(grep -c 'rel="canonical"' "$f" 2>/dev/null || true); [ -z "$CANON" ] && CANON=0
    ROBOTS=$(grep -c 'name="robots"' "$f" 2>/dev/null || true); [ -z "$ROBOTS" ] && ROBOTS=0
    printf "%-20s %-12s %-12s\n" "$f" "$CANON" "$ROBOTS"
done

echo ""
echo "=== Готово! Дальнейшие шаги ==="
echo "1. git diff --stat           (проверить изменения)"
echo "2. git add . && git commit -m 'Canonical для основных страниц + noindex для thanks'"
echo "3. git push origin main"
echo "4. Деплой через SCP"
echo "5. Очистка кэша nginx"
echo "6. Переобход в Вебмастере: /, /blog/, статья № 1"
