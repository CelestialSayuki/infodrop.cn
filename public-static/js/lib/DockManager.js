export class DockManager {
  constructor(dockSelector, previewSelector, mainContentArea) {
    this.container = document.querySelector(dockSelector);
    this.preview = document.querySelector(previewSelector);
    this.mainContentArea = mainContentArea;
    this.dockItems = new Map();

    this._setupEventListeners();
  }

  add(windowInstance) {
    const dockItem = document.createElement('div');
    dockItem.className = 'dock-item';
    dockItem.title = windowInstance.title;
    dockItem.style.backgroundImage = `url('./public-static/img/apple-touch-icon.jpg?2556')`;
    
    dockItem.onclick = () => windowInstance.restore();

    this.container.appendChild(dockItem);
    this.dockItems.set(windowInstance.id, dockItem);
    this.updateVisibility();
    return dockItem;
  }

  remove(windowInstance) {
    const dockItem = this.dockItems.get(windowInstance.id);
    if (dockItem) {
      dockItem.remove();
      this.dockItems.delete(windowInstance.id);
      this.updateVisibility();
    }
  }

  updateVisibility() {
    this.container.classList.toggle('visible', this.dockItems.size > 0);
  }

  _setupEventListeners() {
    this.container.addEventListener('mouseover', (e) => {
      const hoveredItem = e.target.closest('.dock-item');
      if (!hoveredItem || !this.preview || !hoveredItem.title) return;
      
      this.preview.textContent = hoveredItem.title;
      const itemRect = hoveredItem.getBoundingClientRect();
      const parentRect = this.mainContentArea.getBoundingClientRect();
      
      this.preview.style.opacity = '1';
      const top = (itemRect.top - parentRect.top) - this.preview.offsetHeight - 10;
      const left = (itemRect.left - parentRect.left) + (itemRect.width / 2) - (this.preview.offsetWidth / 2);
      this.preview.style.top = `${top}px`;
      this.preview.style.left = `${left}px`;
      this.preview.style.transform = 'translateY(0)';
    });

    this.container.addEventListener('mouseout', (e) => {
      const hoveredItem = e.target.closest('.dock-item');
      if (!hoveredItem || !this.preview) return;
      this.preview.style.opacity = '0';
      this.preview.style.transform = 'translateY(10px)';
    });
  }
}
