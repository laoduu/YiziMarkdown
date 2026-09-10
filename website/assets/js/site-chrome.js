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

        var download = '<a href="https://github.com/laoduu/YiziMarkdown/releases" target="_blank" class="btn-nav">' +
            '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 13h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
            '下载</a>';

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
