import { rewriteElementPaths, scopeCss, loadScriptsSequentially } from './utils.js';

export class Window {
  static idCounter = 0;
  static MIN_WIDTH = 300;
  static MIN_HEIGHT = 200;
  static RESIZE_BORDER_WIDTH = 10;

  constructor(url, title, windowManager) {
    this.id = `dynamic-window-${++Window.idCounter}`;
    this.url = url;
    this.title = title;
    this.manager = windowManager;

    this.state = 'opening';
    this.element = null;
    this.preMaximizeRect = null;

    this._createDOM();
    this._setupEventListeners();
    this.loadContent();
  }

  _createDOM() {
    const windowEl = document.createElement('div');
    windowEl.id = this.id;
    windowEl.className = 'macos-window is-opening';
    
    if (this.manager.isDarkMode) {
      windowEl.classList.add('theme-dark');
    }

    const offset = (this.manager.windowCount % 10) * 30;
    windowEl.style.top = `${this.manager.mainContentArea.scrollTop + offset}px`;
    windowEl.style.left = `${offset}px`;

    windowEl.innerHTML = `
      <div class="macos-window-header">
        <div class="macos-window-controls">
          <span class="control-btn control-close"></span>
          <span class="control-btn control-minimize"></span>
          <span class="control-btn control-maximize"></span>
        </div>
        <div class="macos-window-title">${this.title}</div>
        <div class="header-actions"></div>
      </div>
      <div class="macos-window-body">
      </div>`;
    
    this.element = windowEl;
    this.manager.mainContentArea.appendChild(this.element);
    this.bringToFront();
  }

  _setupEventListeners() {
    const header = this.element.querySelector('.macos-window-header');
    this.element.querySelector('.control-close').onclick = (e) => { e.stopPropagation(); this.close(); };
    this.element.querySelector('.control-maximize').onclick = (e) => { e.stopPropagation(); this.toggleMaximize(); };
    let action = '', startX, startY, startWidth, startHeight, startLeft, startTop, resizeDirection = '';
    const getResizeDirection = (e) => {
        if (this.state === 'maximized') return '';
        const rect = this.element.getBoundingClientRect();
        const onTop = e.clientY >= rect.top && e.clientY <= rect.top + Window.RESIZE_BORDER_WIDTH;
        const onBottom = e.clientY <= rect.bottom && e.clientY >= rect.bottom - Window.RESIZE_BORDER_WIDTH;
        const onLeft = e.clientX >= rect.left && e.clientX <= rect.left + Window.RESIZE_BORDER_WIDTH;
        const onRight = e.clientX <= rect.right && e.clientX >= rect.right - Window.RESIZE_BORDER_WIDTH;
        let dir = '';
        if (onTop) dir += 'n';
        if (onBottom) dir += 's';
        if (onLeft) dir += 'w';
        if (onRight) dir += 'e';
        return dir;
    };
    this.element.addEventListener('mousemove', (e) => {
        if (action) return;
        const dir = getResizeDirection(e);
        let cursor = 'default';
        if (dir === 'n' || dir === 's') cursor = 'ns-resize';
        else if (dir === 'e' || dir === 'w') cursor = 'ew-resize';
        else if (dir === 'nw' || dir === 'se') cursor = 'nwse-resize';
        else if (dir === 'ne' || dir === 'sw') cursor = 'nesw-resize';
        this.element.style.cursor = cursor;
    });
    const stopInteraction = () => {
        action = '';
        header.style.cursor = 'move';
        this.element.style.transition = '';
        document.removeEventListener('mousemove', performInteraction);
        document.removeEventListener('mouseup', stopInteraction);
    };
    const performInteraction = (e) => {
        if (action === 'dragging') {
            this.element.style.left = `${startLeft + e.clientX - startX}px`;
            this.element.style.top = `${startTop + e.clientY - startY}px`;
        } else if (action === 'resizing') {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            let newWidth = startWidth, newHeight = startHeight, newLeft = startLeft, newTop = startTop;
            if (resizeDirection.includes('e')) newWidth = startWidth + deltaX;
            if (resizeDirection.includes('w')) { newWidth = startWidth - deltaX; newLeft = startLeft + deltaX; }
            if (resizeDirection.includes('s')) newHeight = startHeight + deltaY;
            if (resizeDirection.includes('n')) { newHeight = startHeight - deltaY; newTop = startTop + deltaY; }
            if (newWidth >= Window.MIN_WIDTH) { this.element.style.width = `${newWidth}px`; this.element.style.left = `${newLeft}px`; }
            if (newHeight >= Window.MIN_HEIGHT) { this.element.style.height = `${newHeight}px`; this.element.style.top = `${newTop}px`; }
        }
    };
    this.element.addEventListener('mousedown', (e) => {
        if (e.target.closest('.macos-window-body') || e.target.closest('.control-btn')) return;
        e.preventDefault();
        this.bringToFront();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = this.element.offsetLeft;
        startTop = this.element.offsetTop;
        startWidth = this.element.offsetWidth;
        startHeight = this.element.offsetHeight;
        resizeDirection = getResizeDirection(e);
        if (resizeDirection && this.state !== 'maximized') {
            action = 'resizing';
        } else if (e.target.closest('.macos-window-header')) {
            action = 'dragging';
            header.style.cursor = 'grabbing';
        }
        if (action) {
            this.element.style.transition = 'none';
            document.addEventListener('mousemove', performInteraction);
            document.addEventListener('mouseup', stopInteraction, { once: true });
        }
    });
  }

    async loadContent(newUrl) {
        if (newUrl) this.url = newUrl;
        
        let windowBody = this.element.querySelector('.macos-window-body');
        const headerActions = this.element.querySelector('.header-actions');
        
        if (this.state !== 'opening') {
            windowBody.style.transition = 'opacity 0.2s ease-out';
            windowBody.style.opacity = 0;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        const newWindowBody = document.createElement('div');
        newWindowBody.className = 'macos-window-body';
        newWindowBody.style.overflowY = 'auto';
        newWindowBody.style.margin = '0 5px 5px 5px';
        newWindowBody.style.borderRadius = '8px';

        windowBody.parentNode.replaceChild(newWindowBody, windowBody);
        windowBody = newWindowBody;

        headerActions.innerHTML = '';
        document.querySelectorAll(`[data-dynamic-style-for="${this.id}"]`).forEach(s => s.remove());
        
        try {
            const isComparisonPage = this.url.includes('/apple-device/') || this.url.includes('/apple-silicon/');
            
            if (isComparisonPage) {
                windowBody.classList.add('comparison-container');
            } else {
                windowBody.classList.remove('comparison-container');
            }

            if (isComparisonPage) {
                const styleId = 'comparison-ui-style';
                if (!document.getElementById(styleId)) {
                    const link = document.createElement('link');
                    link.id = styleId;
                    link.rel = 'stylesheet';
                    link.href = './public-static/css/comparison-table-ui.css';
                    document.head.appendChild(link);
                }
                const resetButton = document.createElement('a');
                resetButton.href = '#';
                resetButton.className = 'header-btn reset-btn';
                resetButton.textContent = '重置';
                const filterButton = document.createElement('a');
                filterButton.href = '#';
                filterButton.className = 'header-btn filter-btn';
                filterButton.textContent = '比较';
                headerActions.appendChild(resetButton);
                headerActions.appendChild(filterButton);
                const jsonUrl = this.url + 'data.json';
                const gridContainer = await renderComparisonTable(jsonUrl, windowBody, this.url);
                if (gridContainer) {
                    const updateFilterState = () => {
                        const selectedCount = gridContainer.querySelectorAll('.product-column.selected').length;
                        filterButton.classList.toggle('active', selectedCount > 0);
                        if (selectedCount === 0) gridContainer.classList.remove('is-filtering');
                    };
                    gridContainer.addEventListener('click', (e) => {
                        const product = e.target.closest('.product-column');
                        if (!product || e.target.closest('a')) return;
                        e.preventDefault();
                        product.classList.toggle('selected');
                        updateFilterState();
                    });
                    filterButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (filterButton.classList.contains('active')) {
                            gridContainer.classList.add('is-filtering');
                        }
                    });
                    resetButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        gridContainer.classList.remove('is-filtering');
                        gridContainer.querySelectorAll('.product-column').forEach(p => p.classList.remove('selected'));
                        updateFilterState();
                    });
                    updateFilterState();
                    syncRowHeights(gridContainer);
                }
            } else {
                const response = await fetch(this.url);
                if (!response.ok) throw new Error(`网络请求失败: ${response.status}`);
                const htmlText = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                doc.head.querySelectorAll('link[rel="stylesheet"]').forEach(linkNode => {
                    const absoluteUrl = new URL(linkNode.getAttribute('href'), response.url).href;
                    if (!document.getElementById(`dynamic-style-${absoluteUrl}`)) {
                        const newLink = document.createElement('link');
                        newLink.id = `dynamic-style-${absoluteUrl}`;
                        newLink.rel = 'stylesheet';
                        newLink.href = absoluteUrl;
                        newLink.dataset.dynamicStyleFor = this.id;
                        document.head.appendChild(newLink);
                    }
                });
                doc.head.querySelectorAll('style').forEach(styleNode => {
                    const newStyle = document.createElement('style');
                    newStyle.textContent = scopeCss(styleNode.textContent, `#${this.id}`);
                    newStyle.dataset.dynamicStyleFor = this.id;
                    document.head.appendChild(newStyle);
                });
                const content = doc.body.firstElementChild;
                windowBody.innerHTML = '';
                if (content) {
                    rewriteElementPaths(content, response.url);
                    windowBody.appendChild(content);
                } else {
                    windowBody.innerHTML = `<div style="padding: 20px;">无法加载内容或页面为空。</div>`;
                }
                loadScriptsSequentially(Array.from(doc.querySelectorAll('script')), response.url, windowBody);
            }
        } catch (error) {
            console.error('加载窗口内容时出错:', error);
            windowBody.innerHTML = `<div style="color:red; text-align:center; padding: 50px;">内容加载失败。<br>${error.message}</div>`;
        } finally {
            this.state = this.element.classList.contains('is-maximized') ? 'maximized' : 'open';
            
            requestAnimationFrame(() => {
                this.element.classList.remove('is-opening');
            });

            windowBody.style.opacity = 0;
            setTimeout(() => {
                windowBody.style.transition = 'opacity 0.2s ease-in';
                windowBody.style.opacity = 1;
            }, 50);
        }
      }

  updateTitle(newTitle) { this.title = newTitle; this.element.querySelector('.macos-window-title').textContent = newTitle; }
  bringToFront() { this.element.style.zIndex = this.manager.getNextZIndex(); }
  close() { if (this.state === 'closing') return; this.state = 'closing'; this.element.classList.add('is-closing'); this.element.addEventListener('animationend', () => { this.manager.destroyWindow(this.url); }, { once: true }); }
  toggleMaximize() {
    const isMaximized = this.element.classList.contains('is-maximized');
    if (isMaximized) {
      this.element.classList.remove('is-maximized');
      if (this.preMaximizeRect) { Object.assign(this.element.style, this.preMaximizeRect); }
      this.state = 'open';
    } else {
      this.manager.maximizeWindow(this);
      this.preMaximizeRect = { top: this.element.style.top, left: this.element.style.left, width: `${this.element.offsetWidth}px`, height: `${this.element.offsetHeight}px` };
      this.element.classList.add('is-maximized');
      this.state = 'maximized';
    }
    this.manager.updateScrollLock();
  }
}
