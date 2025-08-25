import { Window } from './Window.js';

export class WindowManager {
  constructor(mainContentArea, svgContainer) {
    this.mainContentArea = mainContentArea;
    this.svgContainer = svgContainer;
    this.openWindows = new Map();
    this.zIndexCounter = 100;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.isDarkMode = mediaQuery.matches;

    this.isMobileLayout = window.matchMedia('(max-width: 768px)').matches;
    
    this._setupEventListeners();
  }

  _setupEventListeners() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const themeChangeHandler = (e) => {
        this.isDarkMode = e.matches;
        this._updateAllWindowsTheme();
    };

    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', themeChangeHandler);
    } else {
        mediaQuery.addListener(themeChangeHandler);
    }

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const wasMobile = this.isMobileLayout;
            const isNowMobile = window.matchMedia('(max-width: 768px)').matches;

            if (!wasMobile && isNowMobile) {
                this._maximizeTopWindowOnMobileTransition();
            }

            this.isMobileLayout = isNowMobile;
        }, 150);
    });
  }

  _maximizeTopWindowOnMobileTransition() {
    if (this.openWindows.size === 0) {
      return;
    }

    let topWindow = null;

    for (const win of this.openWindows.values()) {
      if (!topWindow || parseInt(win.element.style.zIndex) > parseInt(topWindow.element.style.zIndex)) {
        topWindow = win;
      }
    }

    if (topWindow && !topWindow.element.classList.contains('is-maximized')) {
      topWindow.toggleMaximize(true);
    }
  }

  get windowCount() {
    return this.openWindows.size;
  }

  getNextZIndex() {
    return ++this.zIndexCounter;
  }

  createWindow(url, title) {
    if (this.openWindows.has(url)) {
      const existingWindow = this.openWindows.get(url);
      
      if (parseInt(existingWindow.element.style.zIndex) === this.zIndexCounter) {
        existingWindow.close();
      } else {
        existingWindow.bringToFront();
      }
      return;
    }

    const maximizedWindow = this._findMaximizedWindow();
    if (maximizedWindow) {
      this.openWindows.delete(maximizedWindow.url);
      this.openWindows.set(url, maximizedWindow);
      
      maximizedWindow.updateTitle(title);
      maximizedWindow.loadContent(url);
      return;
    }

    const newWindow = new Window(url, title, this);
    this.openWindows.set(url, newWindow);
    
    if (window.matchMedia('(max-width: 768px)').matches) {
      setTimeout(() => newWindow.toggleMaximize(true), 50);
    } else if (this.windowCount === 1) {
      setTimeout(() => newWindow.toggleMaximize(true), 50);
    }
  }
  
  maximizeWindow(maximizingWindow) {
      this.mainContentArea.scrollTop = 0;
      this.openWindows.forEach(win => {
          if(win.id !== maximizingWindow.id && win.state === 'open') {
              win.close();
          }
      });
  }

  destroyWindow(url) {
    const windowInstance = this.openWindows.get(url);
    if (!windowInstance) return;

    document.querySelectorAll(`[data-dynamic-style-for="${windowInstance.id}"]`).forEach(s => s.remove());
    
    windowInstance.element.remove();
    
    this.openWindows.delete(url);

    this.updateScrollLock();
  }
    
  closeAll() {
    const urlsToClose = Array.from(this.openWindows.keys());
    urlsToClose.forEach(url => this.destroyWindow(url));
  }

  _updateAllWindowsTheme() {
    this.openWindows.forEach(win => {
        win.element.classList.toggle('theme-dark', this.isDarkMode);
    });
  }

  updateScrollLock() {
    const shouldLock = !!this._findMaximizedWindow();
    this.mainContentArea.classList.toggle('main-content-locked', shouldLock);
  }

  _findMaximizedWindow() {
    for (const window of this.openWindows.values()) {
      if (window.state === 'maximized') {
        return window;
      }
    }
    return null;
  }
}
