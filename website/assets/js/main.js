// Nav scroll 已移至 site-chrome.js（导航为全站共用组件）

    // ===== Theme Stack =====
    const themes = [
        { id: 'academic-blue', name: '学术蓝', tag: '经典', color: '#002FA7',
          desc: '沉稳蓝色主调，适配学术论文、技术文档等正式场景',
          img: 'screenshots/academic-blue.png' },
        { id: 'vibrant-orange', name: '活力橙', tag: '活力', color: '#F37021',
          desc: '热情橙色点缀，适合营销文案、产品宣传等创意场景',
          img: 'screenshots/vibrant-orange.png' },
        { id: 'tech', name: '科技感', tag: '极客', color: '#4FC3F7',
          desc: '深邃暗色背景，适配代码文档、技术博客等极客场景',
          img: 'screenshots/tech.png' },
        { id: 'minimal', name: '极简风', tag: '纯净', color: '#64748b',
          desc: '大面积留白设计，回归写作本质，适合长文阅读',
          img: 'screenshots/minimal.png' },
        { id: 'magazine', name: '杂志感', tag: '优雅', color: '#8B7355',
          desc: '温暖米色调，精致排版，适合文学创作、散文随笔',
          img: 'screenshots/magazine.png' },
        { id: 'cyberpunk', name: '赛博朋克', tag: '未来', color: '#0077b6',
          desc: '冷白底霓虹青粉，未来科技感，暗色霓虹发光',
          img: 'screenshots/cyberpunk.png' },
        { id: 'nature', name: '自然风', tag: '清新', color: '#4CAF50',
          desc: '柔和绿色调，森林宁静氛围，适合生活记录、旅行笔记',
          img: 'screenshots/nature.png' },
        { id: 'liquidglass', name: '液态玻璃', tag: '玻璃', color: '#3b82f6',
          desc: '冰蓝通透玻璃质感，毛玻璃+折射光线，清爽通透',
          img: 'screenshots/liquidglass.png' },
        { id: 'matrix', name: '黑客帝国', tag: '终端', color: '#008a2e',
          desc: '白底绿字终端风，暗色绿色发光，极客专属风格',
          img: 'screenshots/matrix.png' },
        { id: 'lychee', name: '荔枝红', tag: '热情', color: '#E63946',
          desc: '温暖鲜明红色调，热情洋溢，适合生活随笔、情感日记',
          img: 'screenshots/lychee.png' },
        { id: 'violet', name: '紫罗兰', tag: '雅致', color: '#7209B7',
          desc: '雅致紫色调，小众高级，适合诗歌、散文等文艺创作',
          img: 'screenshots/violet.png' },
        { id: 'sunset', name: '落日熔金', tag: '温暖', color: '#b45309',
          desc: '暖白底琥珀色，暗色金红落日光芒，温暖治愈',
          img: 'screenshots/sunset.png' },
        { id: 'facebook', name: 'Facebook', tag: '社交', color: '#1877F2',
          desc: '经典蓝白社交风，简洁干净，适合日常笔记、内容草稿',
          img: 'screenshots/facebook.png' },
        { id: 'mint', name: '薄荷冰沙', tag: '清凉', color: '#10b981',
          desc: '清透薄荷绿，清凉舒适，长时间写作不视觉疲劳',
          img: 'screenshots/mint.png' },
        { id: 'typewriter', name: '复古打字机', tag: '复古', color: '#8b6914',
          desc: '老纸底深褐墨色，暗色暖金字，复古打字机质感',
          img: 'screenshots/typewriter.png' },
    ];

    const stack = document.getElementById('themeStack');
    const selector = document.getElementById('themeSelector');
    let activeIdx = 0;

    // Build cards & buttons
    themes.forEach((t, i) => {
        // Card
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.dataset.index = i;
        card.innerHTML = `<img src="${t.img}" alt="${t.name}" loading="lazy">`;
        card.onclick = () => setActive(i);
        stack.appendChild(card);

        // Button
        const btn = document.createElement('button');
        btn.className = 'theme-btn' + (i === 0 ? ' active' : '');
        btn.dataset.index = i;
        btn.innerHTML = `<span class="theme-btn-dot" style="background:${t.color}"></span><span class="theme-btn-label">${t.name}</span>`;
        btn.onclick = () => setActive(i);
        selector.appendChild(btn);
    });

    function setActive(idx) {
        if (idx === activeIdx) return;
        activeIdx = idx;
        const cards = stack.querySelectorAll('.theme-card');
        const btns = selector.querySelectorAll('.theme-btn');

        cards.forEach((c, i) => {
            c.classList.remove('pos-top', 'pos-middle', 'pos-bottom');
            if (i === idx) c.classList.add('pos-top');
            else if (i === (idx + 1) % themes.length) c.classList.add('pos-middle');
            else c.classList.add('pos-bottom');
        });

        btns.forEach((b, i) => b.classList.toggle('active', i === idx));

        // Update info with fade
        const info = document.getElementById('themeName');
        const tag = document.getElementById('themeTag');
        const desc = document.getElementById('themeDesc');
        [info, tag, desc].forEach(el => el.style.opacity = '0');
        setTimeout(() => {
            info.textContent = themes[idx].name;
            info.style.color = themes[idx].color; // 主题名称使用主题色
            tag.textContent = themes[idx].tag;
            tag.style.background = `rgba(${parseInt(themes[idx].color.slice(1,3), 16)}, ${parseInt(themes[idx].color.slice(3,5), 16)}, ${parseInt(themes[idx].color.slice(5,7), 16)}, 0.07)`;
            tag.style.color = themes[idx].color; // 标签也使用主题色
            desc.textContent = themes[idx].desc;
            [info, tag, desc].forEach(el => el.style.opacity = '1');
        }, 200);
    }

    // Initialize positions
    function initStack() {
        const cards = stack.querySelectorAll('.theme-card');
        cards.forEach((c, i) => {
            c.classList.remove('pos-top', 'pos-middle', 'pos-bottom');
            if (i === 0) c.classList.add('pos-top');
            else if (i === 1) c.classList.add('pos-middle');
            else c.classList.add('pos-bottom');
        });
        // 初始设置主题色和标签样式
        document.getElementById('themeName').style.color = themes[0].color;
        const initialTag = document.getElementById('themeTag');
        initialTag.style.background = `rgba(${parseInt(themes[0].color.slice(1,3), 16)}, ${parseInt(themes[0].color.slice(3,5), 16)}, ${parseInt(themes[0].color.slice(5,7), 16)}, 0.07)`;
        initialTag.style.color = themes[0].color;
    }
    initStack();

    // Auto-rotate
    let autoTimer = setInterval(() => setActive((activeIdx + 1) % themes.length), 4000);
    stack.addEventListener('mouseenter', () => clearInterval(autoTimer));
    stack.addEventListener('mouseleave', () => {
        autoTimer = setInterval(() => setActive((activeIdx + 1) % themes.length), 4000);
    });
    selector.addEventListener('mouseenter', () => clearInterval(autoTimer));
    selector.addEventListener('mouseleave', () => {
        autoTimer = setInterval(() => setActive((activeIdx + 1) % themes.length), 4000);
    });

    // ===== Changelog Tabs =====
    const changelogTabs = document.querySelectorAll('.changelog-tab');
    const changelogPanels = document.querySelectorAll('.changelog-panel');
    
    changelogTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const version = tab.dataset.version;
            // 切换tab状态
            changelogTabs.forEach(t => t.classList.toggle('active', t === tab));
            // 切换panel
            changelogPanels.forEach(panel => {
                panel.classList.toggle('active', panel.dataset.version === version);
            });
        });
    });

    // Scroll-reveal
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.style.opacity = '1';
                e.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.15 });
    document.querySelectorAll('.feature-card, .shortcut-item, .changelog-panel, .spotlight-text, .spotlight-visual').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });