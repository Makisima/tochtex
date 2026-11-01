(function() {
    // 1. Применяем тему к тегу <html>
    const savedTheme = localStorage.getItem('site_theme') || 'theme-hightech';
    if (savedTheme !== 'default') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // 2. Мгновенно скрываем ИИ, если он отключен (чтобы виджет не мигал)
    if (localStorage.getItem('ai_enabled') === 'false') {
        document.documentElement.setAttribute('data-ai-disabled', 'true');
    }
})();