/**
 * 帮助中心交互：章节图标、左侧二级手风琴目录、滚动自动展开、纯前端搜索、移动端抽屉。
 */
(function () {
    var sections = Array.prototype.slice.call(document.querySelectorAll('.help-section'));
    var navBox = document.getElementById('helpNav');
    var sidebar = document.getElementById('helpSidebar');
    var fab = document.getElementById('helpFab');
    var searchInput = document.getElementById('helpSearch');
    var resultsBox = document.getElementById('helpResults');

    /* ---------- 图标：直接取自 lucide-react，与桌面端界面同一套 ---------- */
    // icons.js 是自动生成文件（勿手改）；这里补充语法表 / 提示块表额外需要的 Lucide 图标，
    // 路径同样来自 lucide-react 0.408.0。
    function iconSvg(paths) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }
    var EXTRA_ICONS = {
        'check-square': iconSvg('<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
        'highlighter': iconSvg('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'),
        'list-ordered': iconSvg('<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'),
        'superscript': iconSvg('<path d="m4 19 8-8"/><path d="m12 19-8-8"/><path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06"/>'),
        'subscript': iconSvg('<path d="m4 5 8 8"/><path d="m12 5-8 8"/><path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"/>'),
        'info': iconSvg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
        'lightbulb': iconSvg('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
        'message-square': iconSvg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
        'triangle-alert': iconSvg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
        'octagon-alert': iconSvg('<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>'),
        'message-square-warning': iconSvg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v2"/><path d="M12 13h.01"/>')
    };
    var L = Object.assign({}, window.LUCIDE || {}, EXTRA_ICONS);
    var META = window.LUCIDE_META || {};
    var ICONS = {};
    Object.keys(META.chapter || {}).forEach(function (id) {
        var name = META.chapter[id];
        if (L[name]) ICONS[id] = L[name];
    });
    // 生成页（主题规范 / 演示语法 / 技能规范）在 section 上写 data-icon
    function iconFor(sec) {
        var name = sec.getAttribute('data-icon');
        if (name && L[name]) return L[name];
        return ICONS[sec.id] || '';
    }
    var CHEV = '<svg class="help-nav-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

    /* 功能表格里补上软件同款按钮图标（按首列文字匹配） */
    var ROW_ICONS = {
        '粗体': 'bold', '斜体': 'italic', '删除线': 'strikethrough', '行内代码': 'code',
        '标题': 'heading-1', '列表': 'list', '无序列表': 'list', '有序列表': 'list-ordered',
        '任务列表': 'check-square', '引用': 'quote', '链接': 'link', '图片': 'image',
        '代码块': 'code-2', '分割线': 'minus', '上标': 'superscript', '下标': 'subscript',
        '高亮': 'highlighter', '公式': 'sigma', '图表': 'workflow', '表格': 'table',
        // 提示块类型表：首列文字是 `[!TYPE]`
        '[!NOTE]': 'info', '[!TIP]': 'lightbulb', '[!IMPORTANT]': 'message-square',
        '[!WARNING]': 'triangle-alert', '[!CAUTION]': 'octagon-alert',
        // 后 5 项对应 src/components/TabBar.tsx 的视图按钮
        '源码': 'code', '实时模式': 'sparkles', '并排模式': 'columns-2',
        '预览模式': 'eye', '演示模式': 'presentation'
    };
    function addRowIcons() {
        document.querySelectorAll('.help-content table tr').forEach(function (tr) {
            var cell = tr.querySelector('td');
            if (!cell || cell.querySelector('svg')) return;
            var name = ROW_ICONS[cell.textContent.trim()];
            if (!name || !L[name]) return;
            var span = document.createElement('span');
            span.className = 'tb-icon';
            span.innerHTML = L[name];
            cell.insertBefore(span, cell.firstChild);
        });
    }

    function headingText(el) {
        var clone = el.cloneNode(true);
        var junk = clone.querySelectorAll('.anchor, .help-h2-icon');
        for (var i = 0; i < junk.length; i++) junk[i].remove();
        return clone.textContent.trim();
    }

    function topOf(el) {
        return el.getBoundingClientRect().top + window.scrollY;
    }

    /* ---------- 正文大标题加图标 ---------- */
    sections.forEach(function (sec) {
        var h2 = sec.querySelector('h2');
        var iconHtml = iconFor(sec);
        if (!h2 || !iconHtml) return;
        var icon = document.createElement('span');
        icon.className = 'help-h2-icon';
        icon.innerHTML = iconHtml;
        h2.insertBefore(icon, h2.firstChild);
    });
    addRowIcons();

    /* ---------- 左侧二级目录（手风琴） ---------- */
    var groups = [];
    var subLinks = [];

    if (navBox) {
        sections.forEach(function (sec) {
            var group = document.createElement('div');
            group.className = 'help-nav-group';

            var item = document.createElement('a');
            item.className = 'help-nav-item';
            item.href = '#' + sec.id;
            item.innerHTML = '<span class="help-nav-icon">' + iconFor(sec) + '</span>' +
                '<span class="help-nav-label"></span>' + CHEV;
            item.querySelector('.help-nav-label').textContent = headingText(sec.querySelector('h2'));
            group.appendChild(item);

            var subs = document.createElement('div');
            subs.className = 'help-nav-subs';
            var mine = [];
            sec.querySelectorAll('.help-sub').forEach(function (sub) {
                var h = sub.querySelector('h3');
                if (!h) return;
                var a = document.createElement('a');
                a.href = '#' + sub.id;
                a.textContent = headingText(h);
                subs.appendChild(a);
                mine.push(a);
                subLinks.push({ link: a, id: sub.id });
            });
            group.appendChild(subs);
            navBox.appendChild(group);

            var g = { el: group, id: sec.id, box: subs, links: mine };
            item.addEventListener('click', function () { openGroup(g); });
            groups.push(g);
        });
    }

    var openId = null;
    function openGroup(target) {
        if (openId === target.id) return;
        openId = target.id;
        groups.forEach(function (g) {
            var on = g === target;
            g.el.classList.toggle('open', on);
            g.box.style.maxHeight = on ? g.box.scrollHeight + 'px' : '0px';
        });
    }
    function refreshHeight() {
        groups.forEach(function (g) {
            if (g.el.classList.contains('open')) g.box.style.maxHeight = g.box.scrollHeight + 'px';
        });
    }

    /* ---------- 搜索索引 ---------- */
    var index = [];
    sections.forEach(function (sec) {
        var chapter = headingText(sec.querySelector('h2'));
        index.push({ id: sec.id, title: chapter, chapter: chapter, kw: sec.dataset.kw || '' });
        sec.querySelectorAll('.help-sub').forEach(function (sub) {
            var h = sub.querySelector('h3');
            if (!h) return;
            index.push({ id: sub.id, title: headingText(h), chapter: chapter, kw: sub.dataset.kw || '' });
        });
    });

    function search(query) {
        var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) return [];
        return index.filter(function (item) {
            var hay = (item.title + ' ' + item.chapter + ' ' + item.kw).toLowerCase();
            return terms.every(function (t) { return hay.indexOf(t) !== -1; });
        }).slice(0, 12);
    }

    function closeResults() {
        if (resultsBox) resultsBox.classList.remove('show');
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var q = searchInput.value.trim();
            if (!q) return closeResults();
            var list = search(q);
            if (!resultsBox) return;
            if (!list.length) {
                resultsBox.innerHTML = '<div class="help-result-empty">没有匹配的内容，换个关键词试试</div>';
            } else {
                resultsBox.innerHTML = list.map(function (item) {
                    return '<a class="help-result" href="#' + item.id + '">' +
                        '<div class="help-result-title">' + item.title + '</div>' +
                        '<div class="help-result-path">' + item.chapter + '</div></a>';
                }).join('');
            }
            resultsBox.classList.add('show');
        });
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { searchInput.value = ''; closeResults(); searchInput.blur(); }
            if (e.key === 'Enter') {
                var first = resultsBox && resultsBox.querySelector('.help-result');
                if (first) { first.click(); closeResults(); }
            }
        });
        if (resultsBox) {
            resultsBox.addEventListener('click', function (e) {
                if (e.target.closest('.help-result')) { closeResults(); searchInput.value = ''; }
            });
        }
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.help-search')) closeResults();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === '/' && document.activeElement !== searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    /* ---------- 滚动联动：当前章节自动展开，当前小节高亮 ---------- */
    function onScroll() {
        var y = window.scrollY + 140;
        var activeSec = sections[0];
        sections.forEach(function (s) { if (topOf(s) <= y) activeSec = s; });

        if (activeSec) {
            groups.forEach(function (g) { g.el.classList.toggle('active', g.id === activeSec.id); });
            var target = groups.filter(function (g) { return g.id === activeSec.id; })[0];
            if (target) openGroup(target);
        }

        var activeSub = null;
        subLinks.forEach(function (item) {
            var el = document.getElementById(item.id);
            if (el && topOf(el) <= y) activeSub = item.id;
        });
        subLinks.forEach(function (item) {
            item.link.classList.toggle('active', item.id === activeSub);
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { refreshHeight(); onScroll(); });
    onScroll();

    /* ---------- 移动端目录抽屉 ---------- */
    if (fab && sidebar) {
        fab.addEventListener('click', function () { sidebar.classList.toggle('open'); });
        sidebar.addEventListener('click', function (e) {
            // 点一级目录只展开，点二级条目才收起抽屉
            if (e.target.closest('.help-nav-subs a')) sidebar.classList.remove('open');
        });
        document.addEventListener('click', function (e) {
            if (!sidebar.classList.contains('open')) return;
            if (e.target.closest('.help-sidebar') || e.target.closest('.help-fab')) return;
            sidebar.classList.remove('open');
        });
    }
})();
