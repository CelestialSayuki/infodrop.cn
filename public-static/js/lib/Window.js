import { webpMachine } from '../macui.js';
import { rewriteElementPaths, scopeCss, loadScriptsSequentially } from './utils.js';

export class Window {

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

    const offset = (this.manager.windowCount % 10) * 30;
    windowEl.style.top = `${this.manager.mainContentArea.scrollTop + offset}px`;
    windowEl.style.left = `${offset}px`;

    windowEl.innerHTML = `
      <div class="macos-window-header">
        <div class="macos-window-controls">
          <span class="control-btn control-close">
            <svg class="icon" viewBox="0 0 12 12"><path d="M3 3 L9 9 M9 3 L3 9" stroke-width="1.5" /></svg>
          </span>
          <span class="control-btn control-minimize">
            <svg class="icon" viewBox="0 0 12 12"><path d="M3 6 L9 6" stroke-width="1.5" /></svg>
          </span>
          <span class="control-btn control-maximize">
            <svg class="icon icon-maximize" viewBox="0 0 14 14"><<path d="M 9.86 6.08 C 9.68 6.01 9.46 6.05 9.32 6.19 L 6.2 9.31 C 6.06 9.45 6.01 9.67 6.09 9.86 C 6.17 10.04 6.35 10.16 6.55 10.16 L 9.67 10.16 C 9.95 10.16 10.17 9.94 10.17 9.66 L 10.17 6.55 C 10.17 6.34 10.05 6.16 9.86 6.08 Z M 7.81 4.68 C 7.95 4.54 8 4.32 7.92 4.14 C 7.84 3.95 7.66 3.83 7.46 3.83 L 4.34 3.83 C 4.06 3.83 3.84 4.05 3.84 4.33 L 3.84 7.45 C 3.84 7.65 3.96 7.83 4.15 7.91 C 4.33 7.99 4.55 7.94 4.69 7.8 L 7.81 4.68 Z"/></svg>
          </span>
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

        const getEventCoords = (e) => {
            if (e.touches && e.touches.length) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        };

        const getResizeDirection = (e) => {
            if (this.state === 'maximized') return '';
            const coords = getEventCoords(e);
            const rect = this.element.getBoundingClientRect();
            const onTop = coords.y >= rect.top && coords.y <= rect.top + Window.RESIZE_BORDER_WIDTH;
            const onBottom = coords.y <= rect.bottom && coords.y >= rect.bottom - Window.RESIZE_BORDER_WIDTH;
            const onLeft = coords.x >= rect.left && coords.x <= rect.left + Window.RESIZE_BORDER_WIDTH;
            const onRight = coords.x <= rect.right && coords.x >= rect.right - Window.RESIZE_BORDER_WIDTH;
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

        const performInteraction = (e) => {
            if (e.type === 'touchmove') {
                e.preventDefault();
            }
            const coords = getEventCoords(e);
            if (action === 'dragging') {
                this.element.style.left = `${startLeft + coords.x - startX}px`;
                this.element.style.top = `${startTop + coords.y - startY}px`;
            } else if (action === 'resizing') {
                const deltaX = coords.x - startX;
                const deltaY = coords.y - startY;
                let newWidth = startWidth, newHeight = startHeight, newLeft = startLeft, newTop = startTop;
                if (resizeDirection.includes('e')) newWidth = startWidth + deltaX;
                if (resizeDirection.includes('w')) { newWidth = startWidth - deltaX; newLeft = startLeft + deltaX; }
                if (resizeDirection.includes('s')) newHeight = startHeight + deltaY;
                if (resizeDirection.includes('n')) { newHeight = startHeight - deltaY; newTop = startTop + deltaY; }
                if (newWidth >= Window.MIN_WIDTH) { this.element.style.width = `${newWidth}px`; this.element.style.left = `${newLeft}px`; }
                if (newHeight >= Window.MIN_HEIGHT) { this.element.style.height = `${newHeight}px`; this.element.style.top = `${newTop}px`; }
            }
        };

        const stopInteraction = () => {
            action = '';
            header.style.cursor = 'move';
            this.element.style.transition = '';
            document.removeEventListener('mousemove', performInteraction);
            document.removeEventListener('mouseup', stopInteraction);
            document.removeEventListener('touchmove', performInteraction);
            document.removeEventListener('touchend', stopInteraction);
        };

        const startInteraction = (e) => {
            if (e.target.closest('.macos-window-body') || e.target.closest('.control-btn')) return;

            this.bringToFront();
            const coords = getEventCoords(e);
            startX = coords.x;
            startY = coords.y;
            startLeft = this.element.offsetLeft;
            startTop = this.element.offsetTop;
            startWidth = this.element.offsetWidth;
            startHeight = this.element.offsetHeight;

            if (e.type === 'mousedown') {
                e.preventDefault();
                resizeDirection = getResizeDirection(e);
                if (resizeDirection && this.state !== 'maximized') {
                    action = 'resizing';
                } else if (e.target.closest('.macos-window-header')) {
                    action = 'dragging';
                    header.style.cursor = 'grabbing';
                }
            } else if (e.type === 'touchstart' && e.target.closest('.macos-window-header')) {
                action = 'dragging';
            }

            if (action) {
                this.element.style.transition = 'none';
                document.addEventListener('mousemove', performInteraction);
                document.addEventListener('mouseup', stopInteraction, { once: true });
                document.addEventListener('touchmove', performInteraction, { passive: false });
                document.addEventListener('touchend', stopInteraction, { once: true });
            }
        };

        this.element.addEventListener('mousedown', startInteraction);
        this.element.addEventListener('touchstart', startInteraction);
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
                const syncUiToState = (shouldResetScroll) => {
                    const selectedColumns = gridContainer.querySelectorAll('.product-column.selected');
                    filterButton.classList.toggle('active', selectedColumns.length > 0);
                    
                    const targetElement = gridContainer.querySelector('.products-grid-container');

                    if (targetElement) {
                        if (gridContainer.classList.contains('is-filtering')) {
                            const clone = gridContainer.cloneNode(true);
                            Object.assign(clone.style, {
                                position: 'absolute',
                                left: '-9999px',
                                top: '-9999px',
                                visibility: 'hidden',
                                width: 'fit-content'
                            });
                            document.body.appendChild(clone);
                            
                            const unselectedInClone = clone.querySelectorAll('.product-column:not(.selected)');
                            unselectedInClone.forEach(col => col.style.display = 'none');
                            
                            const newWidth = clone.scrollWidth;
                            
                            document.body.removeChild(clone);

                            targetElement.style.width = `${newWidth}px`;
                        } else {
                            targetElement.style.width = '';
                        }
                    }
                    
                    if (shouldResetScroll) {
                        windowBody.scrollTo({ left: 0, behavior: 'smooth' });
                    }
                };

                gridContainer.addEventListener('click', (e) => {
                    const product = e.target.closest('.product-column');
                    if (!product || e.target.closest('a')) return;
                    e.preventDefault();
                    product.classList.toggle('selected');
                    
                    let shouldResetScroll = false;
                    if (gridContainer.classList.contains('is-filtering')) {
                        shouldResetScroll = true;
                        if (gridContainer.querySelectorAll('.product-column.selected').length === 0) {
                            gridContainer.classList.remove('is-filtering');
                        }
                    }
                    syncUiToState(shouldResetScroll);
                });

                filterButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (filterButton.classList.contains('active')) {
                        gridContainer.classList.add('is-filtering');
                        syncUiToState(true);
                    }
                });

                resetButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    gridContainer.querySelectorAll('.product-column.selected').forEach(col => {
                        col.classList.remove('selected');
                    });
                    gridContainer.classList.remove('is-filtering');
                    syncUiToState(true);
                });

                syncUiToState(false);
                syncRowHeights(gridContainer);
            }
        } else {
            const response = await fetch(this.url);
            if (!response.ok) throw new Error(`网络请求失败: ${response.status}`);
            
            let htmlText = await response.text();
            const modifiedHtmlText = htmlText.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (match, openTag, scriptContent, closeTag) => {
                const newScriptContent = scriptContent.replace(
                    /document\.querySelector\((['"])(\.main-content)\1\)/g,
                    `document.querySelector('#${this.id} .main-content')`
                );
                return openTag + newScriptContent + closeTag;
            });

            const parser = new DOMParser();
            const doc = parser.parseFromString(modifiedHtmlText, 'text/html');
            
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
        webpMachine.polyfillDocument();
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
  
  toggleMaximize(force = false) {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile && !force) {
      return;
    }
    const isMaximized = this.element.classList.contains('is-maximized');
    const maximizeBtn = this.element.querySelector('.control-maximize');
    
    const maximizeIcon = `<svg class="icon icon-maximize" viewBox="0 0 14 14"><path d="M 9.86 6.08 C 9.68 6.01 9.46 6.05 9.32 6.19 L 6.2 9.31 C 6.06 9.45 6.01 9.67 6.09 9.86 C 6.17 10.04 6.35 10.16 6.55 10.16 L 9.67 10.16 C 9.95 10.16 10.17 9.94 10.17 9.66 L 10.17 6.55 C 10.17 6.34 10.05 6.16 9.86 6.08 Z M 7.81 4.68 C 7.95 4.54 8 4.32 7.92 4.14 C 7.84 3.95 7.66 3.83 7.46 3.83 L 4.34 3.83 C 4.06 3.83 3.84 4.05 3.84 4.33 L 3.84 7.45 C 3.84 7.65 3.96 7.83 4.15 7.91 C 4.33 7.99 4.55 7.94 4.69 7.8 L 7.81 4.68 Z"/></svg>`;
    const restoreIcon = `<svg class="icon icon-restore" viewBox="0 0 14 14"><path d="M 6.61 2.83 C 6.43 2.76 6.21 2.8 6.07 2.94 L 2.95 6.06 C 2.81 6.2 2.76 6.42 2.84 6.61 C 2.92 6.79 3.1 6.91 3.3 6.91 L 6.42 6.91 C 6.7 6.91 6.92 6.69 6.92 6.41 L 6.92 3.3 C 6.92 3.09 6.8 2.91 6.61 2.83 Z M 11.06 7.93 C 11.2 7.79 11.25 7.57 11.17 7.39 C 11.09 7.2 10.91 7.08 10.71 7.08 L 7.59 7.08 C 7.31 7.08 7.09 7.3 7.09 7.58 L 7.09 10.7 C 7.09 10.9 7.21 11.08 7.4 11.16 C 7.58 11.24 7.8 11.19 7.94 11.05 L 11.06 7.93 Z"/></svg>`;
    
    if (isMaximized) {
      this.element.classList.remove('is-maximized');
      if (this.preMaximizeRect) { Object.assign(this.element.style, this.preMaximizeRect); }
      this.state = 'open';
      maximizeBtn.innerHTML = maximizeIcon;
    } else {
      this.manager.maximizeWindow(this);
      this.preMaximizeRect = { top: this.element.style.top, left: this.element.style.left, width: `${this.element.offsetWidth}px`, height: `${this.element.offsetHeight}px` };
      this.element.classList.add('is-maximized');
      this.state = 'maximized';
      maximizeBtn.innerHTML = restoreIcon;
    }
    
    this.manager.updateScrollLock();
  }
}

Window.idCounter = 0;
Window.MIN_WIDTH = 300;
Window.MIN_HEIGHT = 200;
Window.RESIZE_BORDER_WIDTH = 10;
