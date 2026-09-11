/**
 * 官网公共外壳（导航 + 页脚）
 *
 * 首页 index.html 与帮助中心 help.html 共用同一份导航与页脚，
 * 保证整站体验一致：改一处即可同步两个页面。
 *
 * 用法：页面里放 <div id="site-nav"></div> / <div id="site-footer"></div>，
 * 再在 main.js 之前引入本文件。
 */
(function () {
    var HOME = 'index.html';
    var HELP = 'help.html';

    // 首页锚点区块；help.html 上会自动补 index.html 前缀
    var LINKS = [
        { label: '首页', page: HOME },
        { label: '功能', hash: 'features' },
        { label: '演示模式', hash: 'slideshow' },
        { label: 'AI 助手', hash: 'ai' },
        { label: '主题', hash: 'themes' },
        { label: '快捷键', hash: 'shortcuts' },
        { label: '更新', hash: 'changelog' },
        { label: '常见问题', hash: 'faq' },
        { label: '帮助中心', page: HELP }
    ];

    var href = location.href.split('#')[0];
    var isHelp = /help\.html$/.test(href) || /\/help\/?$/.test(location.pathname);

    function resolve(link) {
        if (link.page) return link.page;
        return isHelp ? HOME + '#' + link.hash : '#' + link.hash;
    }

    function buildNav() {
        var items = LINKS.map(function (link) {
            var url = resolve(link);
            var active = link.page && isHelp;
            return '<a href="' + url + '"' +
                (active ? ' class="active" aria-current="page"' : '') +
                '>' + link.label + '</a>';
        }).join('');

        var download = '<a href="https://github.com/laoduu/YiziMarkdown" target="_blank" class="btn-nav">' +
            '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' +
            'GitHub</a>';

        return '' +
            '<nav class="nav" id="nav">' +
                '<div class="nav-inner">' +
                    '<a href="' + HOME + '" class="nav-brand">' +
                        '<img src="assets/icon.png" alt="YiziMarkdown">' +
                        '<span><span class="yizi">Yizi</span><span class="markdown">Markdown</span></span>' +
                    '</a>' +
                    '<button class="nav-toggle" id="navToggle" aria-label="展开导航菜单" aria-expanded="false">' +
                        '<span></span><span></span><span></span>' +
                    '</button>' +
                    '<div class="nav-links" id="navLinks">' + items + download + '</div>' +
                '</div>' +
            '</nav>';
    }

    function buildFooter() {
        return '' +
            '<footer class="footer">' +
                '<p>&copy; 2026 YiziMarkdown &middot; ' +
                    '<a href="https://github.com/laoduu/YiziMarkdown/blob/main/LICENSE" target="_blank">MIT License</a> &middot; ' +
                    '<a href="' + HELP + '">帮助中心</a> &middot; ' +
                    'Built with Tauri + React + CodeMirror 6' +
                '</p>' +
                '<p style="margin-top: 6px; font-size: 12px; color: #94a3b8;">渝ICP备2023007919号-1</p>' +
            '</footer>';
    }

    var navSlot = document.getElementById('site-nav');
    var footerSlot = document.getElementById('site-footer');
    if (navSlot) navSlot.outerHTML = buildNav();
    if (footerSlot) footerSlot.outerHTML = buildFooter();

    // 导航滚动态
    var nav = document.getElementById('nav');
    if (nav) {
        window.addEventListener('scroll', function () {
            nav.classList.toggle('scrolled', window.scrollY > 10);
        });
    }

    // 移动端菜单（≤900px 折叠）
    var toggle = document.getElementById('navToggle');
    var links = document.getElementById('navLinks');
    if (toggle && links) {
        toggle.addEventListener('click', function () {
            var open = links.classList.toggle('open');
            toggle.classList.toggle('open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        links.addEventListener('click', function (e) {
            if (e.target.closest('a')) {
                links.classList.remove('open');
                toggle.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
})();
