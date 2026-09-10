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
    var L = window.LUCIDE || {};
    var META = window.LUCIDE_META || {};
    var ICONS = {};
    Object.keys(META.chapter || {}).forEach(function (id) {
        var name = META.chapter[id];
        if (L[name]) ICONS[id] = L[name];
    });
    var CHEV = '<svg class="help-nav-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

    /* 功能表格里补上软件同款按钮图标（按首列文字匹配） */
    var ROW_ICONS = {
        '粗体': 'bold', '斜体': 'italic', '删除线': 'strikethrough', '行内代码': 'code',
        '标题': 'heading-1', '列表': 'list', '引用': 'quote', '链接': 'link', '图片': 'image',
        '代码块': 'code-2', '分割线': 'minus', '公式': 'sigma', '图表': 'workflow', '表格': 'table',
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
        if (!h2 || !ICONS[sec.id]) return;
        var icon = document.createElement('span');
        icon.className = 'help-h2-icon';
        icon.innerHTML = ICONS[sec.id];
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
            item.innerHTML = '<span class="help-nav-icon">' + (ICONS[sec.id] || '') + '</span>' +
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
