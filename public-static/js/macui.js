import { WindowManager } from './lib/WindowManager.js';

document.addEventListener('DOMContentLoaded', () => {
  const mainContentArea = document.querySelector('.main-content');
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    setupMobileNavigation();
  } else {
    const svgContainer = document.getElementById('animation-svg-container');
    const windowManager = new WindowManager(mainContentArea, svgContainer);

    document.querySelectorAll('.sidebar-menu a[href]:not(.no-mac-window)').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href !== '#' && !href.startsWith('http') && !href.startsWith('javascript:')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          windowManager.createWindow(href, link.textContent.trim());
        });
      }
    });
  }
  
  setupSidebarMenu();
  setupUpdateHistory();
  setupCountdownTimer();
});

function setupMobileNavigation() {
  const sidebar = document.querySelector('.sidebar');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const overlay = document.getElementById('overlay');
  const mainContentArea = document.querySelector('.main-content');

  const toggleSidebar = () => {
    sidebar.classList.toggle('is-visible');
    overlay.classList.toggle('is-visible');
  };
  
  hamburgerBtn.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', toggleSidebar);

  document.querySelectorAll('.sidebar-menu a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('http') && !href.startsWith('javascript:')) {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        
        if (sidebar.classList.contains('is-visible')) {
          toggleSidebar();
        }
        
        loadContentIntoMainArea(href, mainContentArea);
      });
    }
  });
}

async function loadContentIntoMainArea(url, container) {
  container.innerHTML = '<div class="loading-spinner">加载中...</div>';
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`网络请求失败: ${response.status}`);
    }
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    const newContent = doc.body.innerHTML;
    
    container.innerHTML = newContent;

    const baseUrl = new URL(url, window.location.href);
    container.querySelectorAll('a[href], img[src]').forEach(el => {
        if (el.hasAttribute('href')) {
            let path = el.getAttribute('href');
            if (path && !path.startsWith('http')) {
                el.href = new URL(path, baseUrl).href;
            }
        }
        if (el.hasAttribute('src')) {
            let path = el.getAttribute('src');
            if (path && !path.startsWith('http')) {
                el.src = new URL(path, baseUrl).href;
            }
        }
    });

  } catch (error) {
    container.innerHTML = `<div style="color:red; text-align:center; padding: 50px;">内容加载失败。<br>${error.message}</div>`;
    console.error('加载内容时出错:', error);
  }
}

function setupSidebarMenu() {
  document.querySelectorAll('.sidebar-menu li').forEach(li => {
    if (li.querySelector('ul')) li.classList.add('has-submenu');
  });

  document.querySelectorAll('.sidebar-menu li.has-submenu > a').forEach(menuItem => {
    menuItem.addEventListener('click', (e) => {
      e.preventDefault();
      const parentLi = menuItem.parentElement;
      const submenu = parentLi.querySelector('ul');
      if (!submenu) return;

      function adjustAncestorHeight(element, heightChange) {
        const ancestorLi = element.parentElement.closest('li.has-submenu.open');
        if (ancestorLi) {
          const ancestorUl = ancestorLi.querySelector('ul');
          if (ancestorUl) {
            const currentMaxHeight = parseFloat(ancestorUl.style.maxHeight || 0);
            const newMaxHeight = currentMaxHeight + heightChange;
            ancestorUl.style.maxHeight = newMaxHeight + 'px';
            adjustAncestorHeight(ancestorLi, heightChange);
          }
        }
      }

      const wasOpen = parentLi.classList.contains('open');
      if (wasOpen) {
        const heightToSubtract = submenu.scrollHeight;
        parentLi.classList.remove('open');
        menuItem.classList.remove('active');
        submenu.style.maxHeight = null;
        adjustAncestorHeight(parentLi, -heightToSubtract);
        return;
      }

      [...parentLi.parentElement.children].forEach(sibling => {
        if (sibling !== parentLi && sibling.classList.contains('open')) {
          const siblingSubmenu = sibling.querySelector('ul');
          if (siblingSubmenu) {
            const heightToSubtract = siblingSubmenu.scrollHeight;
            sibling.classList.remove('open');
            const siblingLink = sibling.querySelector('a');
            if (siblingLink) {
                siblingLink.classList.remove('active');
            }
            siblingSubmenu.style.maxHeight = null;
            adjustAncestorHeight(sibling, -heightToSubtract);
          }
        }
      });

      parentLi.classList.add('open');
      menuItem.classList.add('active');
      void submenu.offsetHeight;
      let heightToAdd = submenu.scrollHeight + 4;
      submenu.style.maxHeight = heightToAdd + "px";
      adjustAncestorHeight(parentLi, heightToAdd);
    });
  });
}

function setupUpdateHistory() {
  const updatesList = document.getElementById('update-history-list');
  const showMoreBtn = document.getElementById('show-more-updates');
  const moreButtonListItem = document.querySelector('.more-btn-li');
  const template = document.getElementById('more-updates-template');

  if (updatesList && showMoreBtn && moreButtonListItem && template) {
    if (!template.content.firstElementChild) {
      moreButtonListItem.style.display = 'none';
    } else {
      showMoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isExpanded = updatesList.classList.contains('expanded');
        if (isExpanded) {
          const addedContent = updatesList.querySelector('.more-updates-content');
          if (addedContent) {
            addedContent.style.height = addedContent.scrollHeight + 'px';
            requestAnimationFrame(() => {
              addedContent.style.height = '0px';
              addedContent.style.opacity = '0';
            });
            addedContent.addEventListener('transitionend', () => addedContent.remove(), { once: true });
          }
          showMoreBtn.textContent = '点击加载更多';
          updatesList.classList.remove('expanded');
        } else {
          const wrapper = document.createElement('div');
          wrapper.className = 'more-updates-content';
          wrapper.style.overflow = 'hidden';
          wrapper.style.transition = 'height 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)';
          wrapper.appendChild(template.content.cloneNode(true));
          updatesList.insertBefore(wrapper, moreButtonListItem);
          wrapper.style.height = '0px';
          wrapper.style.opacity = '0';
          requestAnimationFrame(() => {
            wrapper.style.height = wrapper.scrollHeight + 'px';
            wrapper.style.opacity = '1';
          });
          wrapper.addEventListener('transitionend', () => { wrapper.style.height = null; }, { once: true });
          showMoreBtn.textContent = '收起';
          updatesList.classList.add('expanded');
        }
      });
    }
  }
}

function setupCountdownTimer() {
  const interval = 1000;
  function ShowCountDown(year, month, day, hh, mm, ss, divname) {
    const now = new Date();
    const endDate = new Date(year, month - 1, day, hh, mm, ss);
    const leftTime = endDate.getTime() - now.getTime();
    const div1 = document.getElementById("divdown1");
    const div2 = document.getElementById(divname);
    if (leftTime > 0 && div1 && div2) {
      div1.style.display = 'block';
      div2.style.display = 'block';
      const leftsecond = parseInt(leftTime / 1000);
      const day1 = Math.floor(leftsecond / (60 * 60 * 24));
      const hour = Math.floor((leftsecond - day1 * 24 * 60 * 60) / 3600);
      const minute = Math.floor((leftsecond - day1 * 24 * 60 * 60 - hour * 3600) / 60);
      const second = Math.floor(leftsecond - day1 * 24 * 60 * 60 - hour * 3600 - minute * 60);
      div2.innerHTML = "倒计时：" + day1 + " 天 " + hour + " 小时 " + minute + " 分 " + second + " 秒";
    } else if (div1 && div2) {
      div1.style.display = 'none';
      div2.style.display = 'none';
    }
  }
  window.setInterval(() => ShowCountDown(2025, 6, 10, 1, 0, 0, 'divdown2'), interval);
}
