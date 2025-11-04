import { webpMachine } from '../macui.js';
import { rewriteElementPaths, scopeCss, loadScriptsSequentially } from './utils.js';
import { renderComparisonTable, syncRowHeights } from './table-generator.js';

export class Window {

  constructor(url, title, windowManager) {
    this.id = `dynamic-window-${++Window.idCounter}`;
    this.url = url;
    this.title = title;
    this.manager = windowManager;
    this.state = 'opening';
    this.element = null;
    this.preMaximizeRect = null;
    this.preSnapRect = null;
    this.activeSnapZone = null;
    this.isUnsnapping = false;
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
            <svg class="icon icon-maximize" viewBox="0 0 14 14"><path d="M 9.86 6.08 C 9.68 6.01 9.46 6.05 9.32 6.19 L 6.2 9.31 C 6.06 9.45 6.01 9.67 6.09 9.86 C 6.17 10.04 6.35 10.16 6.55 10.16 L 9.67 10.16 C 9.95 10.16 10.17 9.94 10.17 9.66 L 10.17 6.55 C 10.17 6.34 10.05 6.16 9.86 6.08 Z M 7.81 4.68 C 7.95 4.54 8 4.32 7.92 4.14 C 7.84 3.95 7.66 3.83 7.46 3.83 L 4.34 3.83 C 4.06 3.83 3.84 4.05 3.84 4.33 L 3.84 7.45 C 3.84 7.65 3.96 7.83 4.15 7.91 C 4.33 7.99 4.55 7.94 4.69 7.8 L 7.81 4.68 Z"/></svg>
          </span>
        </div>
        <div class="macos-window-title">${this.title}</div>
        <div class="header-actions"></div>
      </div>
      <div class="macos-window-body">
      </div>`;
    if (document.documentElement.classList.contains('dark-mode')) {
      windowEl.classList.add('dark-mode');
    }
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
          if (this.isUnsnapping) {
              this.isUnsnapping = false;
              this.element.style.transition = 'none';
          }
          if (e.type === 'touchmove') {
            e.preventDefault();
          }
          const coords = getEventCoords(e);
          const container = this.manager.mainContentArea;
          if (action === 'dragging') {
            const windowWidth = this.element.offsetWidth;
            const windowHeight = this.element.offsetHeight;
            let newLeft = startLeft + coords.x - startX;
            let newTop = startTop + coords.y - startY;
            if (this.state !== 'maximized') {
              this._checkForSnap(newLeft, newTop, windowWidth, windowHeight);
            }
            newLeft = Math.max(0, Math.min(newLeft, container.clientWidth - windowWidth));
            newTop = Math.max(0, Math.min(newTop, container.clientHeight - windowHeight));
            this.element.style.left = `${newLeft}px`;
            this.element.style.top = `${newTop}px`;
          } else if (action === 'resizing') {
            if (this.state === 'snapped') {
                this.state = 'open';
                this.element.classList.remove('is-snapped');
                this.preSnapRect = null;
            }
            const deltaX = coords.x - startX;
            const deltaY = coords.y - startY;
            let newWidth = startWidth, newHeight = startHeight, newLeft = startLeft, newTop = startTop;
            if (resizeDirection.includes('e')) {
              newWidth = startWidth + deltaX;
              if (startLeft + newWidth > container.clientWidth) {
                newWidth = container.clientWidth - startLeft;
              }
            }
            if (resizeDirection.includes('w')) {
              newWidth = startWidth - deltaX;
              newLeft = startLeft + deltaX;
              if (newLeft < 0) {
                newWidth += newLeft;
                newLeft = 0;
              }
            }
            if (resizeDirection.includes('s')) {
              newHeight = startHeight + deltaY;
              if (startTop + newHeight > container.clientHeight) {
                newHeight = container.clientHeight - startTop;
              }
            }
            if (resizeDirection.includes('n')) {
              newHeight = startHeight - deltaY;
              newTop = startTop + deltaY;
              if (newTop < 0) {
                newHeight += newTop;
                newTop = 0;
              }
            }
            if (newWidth >= Window.MIN_WIDTH) {
              this.element.style.width = `${newWidth}px`;
              this.element.style.left = `${newLeft}px`;
            }
            if (newHeight >= Window.MIN_HEIGHT) {
              this.element.style.height = `${newHeight}px`;
              this.element.style.top = `${newTop}px`;
            }
          }
        };
        const stopInteraction = () => {
            if (action === 'dragging' && this.activeSnapZone) {
                this._applySnap(this.activeSnapZone);
            }
            this.manager.hideSnapPreview();
            this.activeSnapZone = null;
            action = '';
            header.style.cursor = 'move';
            this.element.style.transition = '';
            document.removeEventListener('mousemove', performInteraction);
            document.removeEventListener('mouseup', stopInteraction);
            document.removeEventListener('touchmove', performInteraction);
            document.removeEventListener('touchend', stopInteraction);
        };
        const startInteraction = (e) => {
            if (e.target.closest('.macos-window-body') || e.target.closest('.control-btn') || this.manager.isMobileLayout) return;
            this.bringToFront();
            const coords = getEventCoords(e);
            const containerRect = this.manager.mainContentArea.getBoundingClientRect();
            startX = coords.x;
            startY = coords.y;
            startLeft = this.element.offsetLeft;
            startTop = this.element.offsetTop;
            startWidth = this.element.offsetWidth;
            startHeight = this.element.offsetHeight;
            let isUnsnappingNow = false;
            if (e.type === 'mousedown') {
                e.preventDefault();
                resizeDirection = getResizeDirection(e);
                if (resizeDirection && this.state !== 'maximized') {
                    action = 'resizing';
                } else if (e.target.closest('.macos-window-header')) {
                    action = 'dragging';
                    header.style.cursor = 'grabbing';
                    if (this.state === 'snapped' && this.preSnapRect) {
                        isUnsnappingNow = true;
                        this.isUnsnapping = true;
                        this.state = 'open';
                        this.element.classList.remove('is-snapped');
                        this.element.style.transition = 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                        const prevWidth = parseInt(this.preSnapRect.width, 10);
                        const prevHeight = parseInt(this.preSnapRect.height, 10);
                        const cursorOffsetX = startX - containerRect.left - startLeft;
                        const cursorOffsetY = startY - containerRect.top - startTop;
                        const cursorRelativeX = cursorOffsetX / startWidth;
                        const newCursorOffsetX = cursorRelativeX * prevWidth;
                        let newLeft = startX - containerRect.left - newCursorOffsetX;
                        let newTop = startY - containerRect.top - cursorOffsetY;
                        const container = this.manager.mainContentArea;
                        const containerWidth = container.clientWidth;
                        const containerHeight = container.clientHeight;
                        if (newLeft + prevWidth > containerWidth) {
                            newLeft = containerWidth - prevWidth;
                        }
                        if (newTop + prevHeight > containerHeight) {
                            newTop = containerHeight - prevHeight;
                        }
                        if (newLeft < 0) newLeft = 0;
                        if (newTop < 0) newTop = 0;
                        startLeft = newLeft;
                        startTop = newTop;
                        Object.assign(this.element.style, {
                            width: `${prevWidth}px`,
                            height: `${prevHeight}px`,
                            left: `${startLeft}px`,
                            top: `${startTop}px`
                        });
                        startWidth = prevWidth;
                        startHeight = prevHeight;
                    }
                }
            } else if (e.type === 'touchstart' && e.target.closest('.macos-window-header')) {
                action = 'dragging';
            }
            if (action) {
                if (!isUnsnappingNow) {
                    this.element.style.transition = 'none';
                }
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
            resetButton.style.display = 'none';
            const filterButton = document.createElement('a');
            filterButton.href = '#';
            filterButton.className = 'header-btn filter-btn';
            filterButton.textContent = '比较';
            const editButton = document.createElement('a');
            editButton.href = '#';
            editButton.className = 'header-btn edit-btn';
            editButton.textContent = '编辑';
            const submitButton = document.createElement('a');
            submitButton.href = '#';
            submitButton.className = 'header-btn submit-btn';
            submitButton.textContent = '提交';
            submitButton.style.display = 'none';
            headerActions.appendChild(resetButton);
            headerActions.appendChild(filterButton);
            headerActions.appendChild(editButton);
            headerActions.appendChild(submitButton);
            const jsonUrl = this.url + 'data.json';
            const gridContainer = await renderComparisonTable(jsonUrl, windowBody, this.url);
            if (gridContainer) {
                this.element.querySelector('.edit-diff-popover')?.remove();
                let isEditing = false;
                const originalValues = new Map();
                const modifiedKeys = new Set();
                let history = [];
                let historyIndex = -1;
                let debounceTimer;
                const diffPopover = document.createElement('div');
                diffPopover.className = 'edit-diff-popover';
                diffPopover.innerHTML = `
                  <div class="popover-section">
                    <strong>原始值:</strong>
                    <div class="popover-content" id="popover-original-value"></div>
                  </div>
                `;
                this.element.appendChild(diffPopover);
                const applyState = (state) => {
                    if (!state || !state.element) return;
                    state.element.innerHTML = state.html;
                    state.element.querySelectorAll('.info-square').forEach(square => {
                        square.setAttribute('contenteditable', true);
                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'delete-square-btn';
                        deleteBtn.innerHTML = '&times;';
                        if (!square.querySelector('.delete-square-btn')) {
                            square.appendChild(deleteBtn);
                        }
                    });
                    state.element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                };
                const saveState = (element) => {
                    const currentState = element.innerHTML;
                    if (history.length > 0 && history[historyIndex]?.html === currentState) {
                        return;
                    }
                    if (historyIndex < history.length - 1) {
                        history = history.slice(0, historyIndex + 1);
                    }
                    history.push({ element: element, html: currentState });
                    historyIndex++;
                };
                const updateUI = (options = {}) => {
                    const { shouldResetScroll = false } = options;
                    const isFiltering = gridContainer.classList.contains('is-filtering');
                    const hasSelection = gridContainer.querySelectorAll('.product-column.selected').length > 0;
                    const showEditControls = isEditing;
                    const showStandardControls = !isEditing;
                    editButton.textContent = showEditControls ? '取消' : '编辑';
                    submitButton.style.display = showEditControls ? 'inline-block' : 'none';
                    filterButton.style.display = showStandardControls && !isFiltering ? 'inline-block' : 'none';
                    resetButton.style.display = showStandardControls && isFiltering ? 'inline-block' : 'none';
                    if (showStandardControls) {
                        editButton.style.display = 'inline-block';
                        filterButton.classList.toggle('active', hasSelection);
                    } else {
                        editButton.style.display = 'inline-block';
                    }
                    const targetElement = gridContainer.querySelector('.products-grid-container');
                    if (targetElement) {
                        if (isFiltering) {
                            const clone = gridContainer.cloneNode(true);
                            Object.assign(clone.style, {
                                position: 'absolute', left: '-9999px', top: '-9999px',
                                visibility: 'hidden', width: 'fit-content'
                            });
                            document.body.appendChild(clone);
                            clone.querySelectorAll('.product-column:not(.selected)').forEach(col => col.style.display = 'none');
                            targetElement.style.width = `${clone.scrollWidth}px`;
                            document.body.removeChild(clone);
                        } else {
                            targetElement.style.width = '';
                        }
                    }
                    if (shouldResetScroll) {
                        windowBody.scrollTo({ left: 0, behavior: 'smooth' });
                    }
                };
                editButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    isEditing = !isEditing;
                    gridContainer.classList.toggle('edit-mode', isEditing);
                    if (isEditing) {
                        history = [];
                        historyIndex = -1;
                        originalValues.clear();
                        modifiedKeys.clear();
                        gridContainer.querySelectorAll('.data-list li').forEach(row => {
                            const productId = row.dataset.productId;
                            const featureId = row.dataset.featureId;
                            if (!productId || !featureId) return;
                            const rowKey = `${productId}---${featureId}`;
                            if (row.classList.contains('multi-div-row')) {
                                const wrapper = row.querySelector('.multi-div-wrapper');
                                if (wrapper) {
                                    originalValues.set(rowKey, wrapper.innerHTML.trim());
                                }
                            } else if (!row.classList.contains('is-complex')) {
                                originalValues.set(rowKey, row.innerHTML.trim());
                            }
                        });
                        gridContainer.querySelectorAll('.multi-div-row').forEach(row => {
                            const btn = document.createElement('button');
                            btn.className = 'add-square-btn';
                            btn.textContent = '+';
                            row.appendChild(btn);
                            row.querySelectorAll('.info-square').forEach(square => {
                                square.setAttribute('contenteditable', true);
                                const deleteBtn = document.createElement('button');
                                deleteBtn.className = 'delete-square-btn';
                                deleteBtn.innerHTML = '&times;';
                                square.appendChild(deleteBtn);
                            });
                        });
                        gridContainer.querySelectorAll('.data-list li:not(.multi-div-row):not(.is-complex)').forEach(row => {
                            row.setAttribute('contenteditable', true);
                        });
                    } else {
                        this.loadContent();
                        return;
                    }
                    updateUI();
                });
                submitButton.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (modifiedKeys.size === 0) {
                        alert('没有检测到任何修改。');
                        return;
                    }
                    if (!confirm(`您确定要提交 ${modifiedKeys.size} 项修改吗？`)) {
                        return;
                    }
                    const changesToSubmit = [];
                    modifiedKeys.forEach(key => {
                        const [productId, featureId] = key.split('---');
                        const cell = gridContainer.querySelector(`li[data-product-id="${productId}"][data-feature-id="${featureId}"]`);
                        if (cell) {
                            const originalValue = originalValues.get(key);
                            let newValue = '';
                            if (cell.classList.contains('multi-div-row')) {
                                const cleanCopy = cell.cloneNode(true);
                                cleanCopy.querySelectorAll('.add-square-btn, .delete-square-btn').forEach(b => b.remove());
                                newValue = cleanCopy.innerHTML.trim();
                            } else {
                                newValue = cell.innerHTML.trim();
                            }
                            changesToSubmit.push({
                                productId: productId,
                                featureId: featureId,
                                originalValue: originalValue,
                                newValue: newValue.replace(/\u200b/g, '')
                            });
                        }
                    });
                    try {
                        const response = await fetch('./upload/submit_changes.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                source: jsonUrl,
                                timestamp: new Date().toISOString(),
                                changes: changesToSubmit
                            }),
                        });
                        if (response.ok) {
                            alert('修改已成功提交，感谢您的贡献！');
                            this.loadContent();
                        } else {
                            throw new Error(`服务器响应: ${response.status}`);
                        }
                    } catch (error) {
                        console.error('提交修改时出错:', error);
                        alert(`提交失败: ${error.message}`);
                    }
                });
                gridContainer.addEventListener('focusin', (e) => {
                    if (!isEditing || !e.target.hasAttribute('contenteditable')) return;
                    const target = e.target;
                    const row = target.closest('li');
                    if (!row || !row.dataset.productId) return;
                    const rowKey = `${row.dataset.productId}---${row.dataset.featureId}`;
                    const originalHTML = originalValues.get(rowKey) || '';
                    diffPopover.querySelector('#popover-original-value').innerHTML = originalHTML;
                    const cellRect = target.getBoundingClientRect();
                    const windowRect = this.element.getBoundingClientRect();
                    diffPopover.style.left = `${cellRect.left - windowRect.left}px`;
                    diffPopover.style.top = `${cellRect.bottom - windowRect.top + 5}px`;
                    diffPopover.style.display = 'block';
                });
                gridContainer.addEventListener('focusout', (e) => {
                    if (!isEditing) return;
                    diffPopover.style.display = 'none';
                });
                gridContainer.addEventListener('keydown', (e) => {
                    const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
                    const isRedo = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'));
                    if (isEditing && (isUndo || isRedo)) {
                        e.preventDefault();
                        if (isUndo) {
                            if (historyIndex === 0) {
                                const state = history[historyIndex];
                                const row = state.element.closest('li');
                                const rowKey = `${row.dataset.productId}---${row.dataset.featureId}`;
                                const originalHTML = originalValues.get(rowKey);
                                applyState({ element: state.element, html: originalHTML });
                                historyIndex--;
                            } else if (historyIndex > 0) {
                                historyIndex--;
                                const stateToApply = history[historyIndex];
                                applyState(stateToApply);
                            }
                        } else if (isRedo) {
                            if (historyIndex < history.length - 1) {
                                historyIndex++;
                                const stateToApply = history[historyIndex];
                                applyState(stateToApply);
                            }
                        }
                        return;
                    }
                    if (!isEditing) return;
                    const target = e.target;
                    if (e.key === 'Enter' && target.getAttribute('contenteditable') === 'true') {
                        e.preventDefault();
                        document.execCommand('insertHTML', false, '<br>\u200b');
                    }
                    if (e.key === 'Backspace' && target.getAttribute('contenteditable') === 'true') {
                        const selection = window.getSelection();
                        if (!selection || !selection.isCollapsed) return;
                        const range = selection.getRangeAt(0);
                        const node = range.startContainer;
                        const offset = range.startOffset;
                        if (node.nodeType === Node.TEXT_NODE && offset === 1 && node.textContent.startsWith('\u200b')) {
                            const prevSibling = node.previousSibling;
                            if (prevSibling && prevSibling.nodeName === 'BR') {
                                e.preventDefault();
                                const textBeforeBr = prevSibling.previousSibling;
                                let cursorNode = textBeforeBr;
                                let cursorOffset = 0;
                                if(cursorNode && cursorNode.nodeType === Node.TEXT_NODE) {
                                    cursorOffset = cursorNode.textContent.length;
                                } else {
                                    cursorNode = node.parentElement;
                                }
                                const remainingText = node.textContent.substring(1);
                                if (textBeforeBr && textBeforeBr.nodeType === Node.TEXT_NODE) {
                                    textBeforeBr.textContent += remainingText;
                                }
                                prevSibling.remove();
                                node.remove();
                                const newRange = document.createRange();
                                newRange.setStart(cursorNode, cursorOffset);
                                newRange.collapse(true);
                                selection.removeAllRanges();
                                selection.addRange(newRange);
                            }
                        }
                    }
                });
                gridContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('add-square-btn')) {
                        e.preventDefault();
                        const wrapper = e.target.closest('.multi-div-row').querySelector('.multi-div-wrapper');
                        if (!wrapper) return;
                        const siblingSquare = wrapper.querySelector('.info-square');
                        const allCurrentSquares = wrapper.querySelectorAll('.info-square');
                        const lastSquare = allCurrentSquares.length > 0 ? allCurrentSquares[allCurrentSquares.length - 1] : null;
                        const lastColorRgb = lastSquare ? lastSquare.style.backgroundColor : '';
                        const newSquare = document.createElement('div');
                        newSquare.className = 'info-square';
                        newSquare.setAttribute('contenteditable', 'true');
                        if (siblingSquare) {
                            newSquare.dataset.productId = siblingSquare.dataset.productId;
                            newSquare.dataset.featureId = siblingSquare.dataset.featureId;
                        }
                        newSquare.innerHTML = '新内容';
                        if (lastColorRgb) {
                            newSquare.style.backgroundColor = lastColorRgb;
                        }
                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'delete-square-btn';
                        deleteBtn.innerHTML = '&times;';
                        newSquare.appendChild(deleteBtn);
                        wrapper.appendChild(newSquare);
                        newSquare.focus();
                        saveState(wrapper);
                        wrapper.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    if (e.target.classList.contains('delete-square-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        const squareToDelete = e.target.closest('.info-square');
                        const wrapper = squareToDelete?.closest('.multi-div-wrapper');
                        if (squareToDelete && wrapper) {
                            squareToDelete.blur();
                            squareToDelete.remove();
                            saveState(wrapper);
                            wrapper.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
                let productPressTarget = null;
                let isTextSelectionDrag = false;
                let pressTimer = null;
                const PRESS_DELAY = 100;
                gridContainer.addEventListener('mousedown', (e) => {
                    if (isEditing) return;
                    const product = e.target.closest('.product-column');
                    if (product && !e.target.closest('a')) {
                        productPressTarget = product;
                        isTextSelectionDrag = false;
                        clearTimeout(pressTimer);
                        pressTimer = setTimeout(() => {
                            if (productPressTarget) {
                                product.classList.add('is-pressing');
                            }
                            pressTimer = null;
                        }, PRESS_DELAY);
                    } else {
                        productPressTarget = null;
                        isTextSelectionDrag = false;
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                });
                gridContainer.addEventListener('mousemove', (e) => {
                    if (productPressTarget) {
                        isTextSelectionDrag = true;
                        if (pressTimer) {
                            clearTimeout(pressTimer);
                            pressTimer = null;
                        }
                        productPressTarget.classList.remove('is-pressing');
                        productPressTarget = null;
                    }
                });
                gridContainer.addEventListener('mouseup', (e) => {
                    const wasPressAndHold = !pressTimer && productPressTarget && productPressTarget.classList.contains('is-pressing');
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                    if (productPressTarget && !isTextSelectionDrag) {
                        const target = productPressTarget;
                        if (!wasPressAndHold) {
                            target.classList.add('is-pressing');
                            setTimeout(() => {
                                target.classList.remove('is-pressing');
                            }, 150);
                        } else {
                            target.classList.remove('is-pressing');
                        }
                    } else if (productPressTarget) {
                        productPressTarget.classList.remove('is-pressing');
                    }
                    productPressTarget = null;
                });
                gridContainer.addEventListener('dblclick', (e) => {
                    if (isEditing) return;
                    const product = e.target.closest('.product-column');
                    if (product && !e.target.closest('a')) {
                        e.preventDefault();
                    }
                });
                gridContainer.addEventListener('click', (e) => {
                    if(isEditing) return;
                    const product = e.target.closest('.product-column');
                    if (!product || e.target.closest('a') ) return;
                    if (isTextSelectionDrag) {
                        isTextSelectionDrag = false;
                        return;
                    }
                    e.preventDefault();
                    product.classList.toggle('selected');
                    updateUI();
                });
                filterButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (filterButton.classList.contains('active')) {
                        gridContainer.classList.add('is-filtering');
                        updateUI({ shouldResetScroll: true });
                    }
                });
                resetButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    gridContainer.querySelectorAll('.product-column.selected').forEach(col => {
                        col.classList.remove('selected');
                    });
                    gridContainer.classList.remove('is-filtering');
                    updateUI({ shouldResetScroll: true });
                });
                gridContainer.addEventListener('input', (e) => {
                    if (!isEditing) return;
                    const target = e.target;
                    const row = target.closest('.data-list li');
                    if (!row) return;
                    let elementToSaveForHistory = null;
                    if (row.classList.contains('multi-div-row')) {
                        elementToSaveForHistory = row.querySelector('.multi-div-wrapper');
                    } else if (!row.classList.contains('is-complex')) {
                        elementToSaveForHistory = row;
                    }
                    if (elementToSaveForHistory) {
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => {
                           saveState(elementToSaveForHistory);
                        }, 300);
                    }
                    const rowKey = `${row.dataset.productId}---${row.dataset.featureId}`;
                    let currentCellValue = '';
                    if (row.classList.contains('multi-div-row')) {
                       const wrapper = row.querySelector('.multi-div-wrapper');
                       if(wrapper){
                           const cleanCopy = wrapper.cloneNode(true);
                           cleanCopy.querySelectorAll('.add-square-btn, .delete-square-btn').forEach(b => b.remove());
                           currentCellValue = cleanCopy.innerHTML.trim();
                       }
                    } else {
                        currentCellValue = row.innerHTML.trim();
                    }
                    if (currentCellValue !== originalValues.get(rowKey)) {
                         modifiedKeys.add(rowKey);
                    } else {
                        modifiedKeys.delete(rowKey);
                    }
                    submitButton.classList.toggle('active', modifiedKeys.size > 0);
                });
                updateUI();
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

  _checkForSnap(winLeft, winTop, winWidth, winHeight) {
      if (this.manager.isMobileLayout) return;
      const container = this.manager.mainContentArea;
      const W = container.clientWidth;
      const H = container.clientHeight;
      const threshold = 15;
      const winRight = winLeft + winWidth;
      const winBottom = winTop + winHeight;
      let zone = null;
      if (winLeft < threshold && winTop < threshold) zone = 'top-left';
      else if (winRight > W - threshold && winTop < threshold) zone = 'top-right';
      else if (winLeft < threshold && winBottom > H - threshold) zone = 'bottom-left';
      else if (winRight > W - threshold && winBottom > H - threshold) zone = 'bottom-right';
      else if (winTop < threshold) zone = 'top';
      else if (winBottom > H - threshold) zone = 'bottom';
      else if (winLeft < threshold) zone = 'left';
      else if (winRight > W - threshold) zone = 'right';
      if (zone !== this.activeSnapZone) {
          this.activeSnapZone = zone;
          if (zone) {
              const rect = this._getSnapRect(zone);
              this.manager.showSnapPreview(rect);
          } else {
              this.manager.hideSnapPreview();
          }
      }
  }

  _getSnapRect(zone) {
      switch (zone) {
          case 'top-left': return { top: '0px', left: '0px', width: '50%', height: '50%' };
          case 'top-right': return { top: '0px', left: '50%', width: '50%', height: '50%' };
          case 'bottom-left': return { top: '50%', left: '0px', width: '50%', height: '50%' };
          case 'bottom-right': return { top: '50%', left: '50%', width: '50%', height: '50%' };
          case 'top': return { top: '0px', left: '0px', width: '100%', height: '50%' };
          case 'bottom': return { top: '50%', left: '0px', width: '100%', height: '50%' };
          case 'left': return { top: '0px', left: '0px', width: '50%', height: '100%' };
          case 'right': return { top: '0px', left: '50%', width: '50%', height: '100%' };
          default: return null;
      }
  }

  _applySnap(zone) {
      if (this.state !== 'snapped') {
           this.preSnapRect = {
              top: this.element.style.top,
              left: this.element.style.left,
              width: `${this.element.offsetWidth}px`,
              height: `${this.element.offsetHeight}px`
          };
      }
      const rect = this._getSnapRect(zone);
      if (rect) {
          this.element.style.transition = 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          Object.assign(this.element.style, rect);
          this.state = 'snapped';
          this.element.classList.add('is-snapped');
      }
  }
}

Window.idCounter = 0;
Window.MIN_WIDTH = 300;
Window.MIN_HEIGHT = 200;
Window.RESIZE_BORDER_WIDTH = 10;
