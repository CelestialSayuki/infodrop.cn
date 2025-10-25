import { webpMachine } from '../macui.js';

export async function renderComparisonTable(jsonUrl, targetElement, baseUrl) {
  try {
    const response = await fetch(jsonUrl);
    if (!response.ok) throw new Error(`无法加载对比数据: ${response.statusText}`);
    const data = await response.json();

    targetElement.innerHTML = '';
    targetElement.classList.add('comparison-container');

    const featuresColumn = document.createElement('div');
    featuresColumn.className = 'features-column';
    featuresColumn.innerHTML = `<div class="top-info">特征对比</div>`;
    const featuresList = document.createElement('ul');
    featuresList.className = 'features-list';
    data.featureGroups.forEach(group => {
      featuresList.innerHTML += `<li class="feature-group-header">${group.groupName}</li>`;
      group.features.forEach(feature => {
        featuresList.innerHTML += `<li>${feature.name}</li>`;
      });
    });
    featuresColumn.appendChild(featuresList);
    targetElement.appendChild(featuresColumn);

    const productsContainer = document.createElement('div');
    productsContainer.className = 'products-grid-container';
    targetElement.appendChild(productsContainer);

    data.products.forEach(product => {
      const productColumn = document.createElement('div');
      productColumn.className = 'product-column';

      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'product-content-wrapper';

      const imageUrl = new URL(product.image, new URL(baseUrl, window.location.origin)).href;
      const generationText = product.generation || '&nbsp;';

      contentWrapper.innerHTML = `
        <div class="top-info">
          <div class="product-image-container">
            <img class="product-image" src="${imageUrl}" alt="${product.name}">
          </div>
          <h3 class="product-title">${product.name}<br><span>${generationText}</span></h3>
        </div>
        `;

      const overlay = document.createElement('div');
      overlay.className = 'product-color-overlay';
      contentWrapper.appendChild(overlay);

      if (product.data) {
        const dataList = document.createElement('ul');
        dataList.className = 'data-list';
        data.featureGroups.forEach(group => {
          dataList.innerHTML += `<li class="feature-group-header"></li>`;
          group.features.forEach(feature => {
            let cellHTML;
            const value = product.data[feature.id];

            if (feature.id === 'displayType' && product.images && Array.isArray(value)) {
              cellHTML = value.map(text => {
                let imgSrc = product.images[text] || '';
                if (text === 'Die' && typeof imgSrc === 'object' && imgSrc !== null) {
                  const firstViewName = Object.keys(imgSrc)[0];
                  imgSrc = imgSrc[firstViewName] || '';
                }
                return `<a href="#" class="image-swap-link" data-img-src="${imgSrc}" data-image-type="${text}">${text}</a>`;
              }).join(' / ');

            } else if (feature.id === 'colors' && Array.isArray(value)) {
              cellHTML = `<div class="color-swatches">${value.map(c =>
                `<div class="swatch" style="background-color: ${c.hex};" title="${c.name}"></div>`
              ).join('')}</div>`;

            } else if (feature.id === 'arLink' && value) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(value, 'text/html');
              const links = Array.from(doc.querySelectorAll('a'));
              const arLinksHTML = links.map(link => {
                const href = link.href;
                const name = link.textContent.trim();
                let colorHex = '#ffffff';
                if (product.data.colors && product.data.colors.length > 0) {
                  const matchingColor = product.data.colors.find(c => c.name === name);
                  colorHex = matchingColor ? matchingColor.hex : product.data.colors[0].hex;
                }
                return `<a href="${href}" target="_blank" class="ar-swatch-link swatch" title="${name}" style="background-color: ${colorHex};"></a>`;
              }).join('');
              cellHTML = `<div class="ar-links-container color-swatches">${arLinksHTML}</div>`;

            } else {
              cellHTML = (value !== undefined && value !== null) ? value : '—';
            }

            const li = document.createElement('li');
            li.dataset.productId = product.name;
            li.dataset.featureId = feature.id;

            if (typeof cellHTML === 'string' && cellHTML.includes('info-square')) {
              li.classList.add('multi-div-row');
              const wrapper = document.createElement('div');
              wrapper.className = 'multi-div-wrapper';
              wrapper.innerHTML = cellHTML;

              const allSquares = wrapper.querySelectorAll('.info-square');
              allSquares.forEach((square, index) => {
                square.setAttribute('contenteditable', 'false');
                square.dataset.productId = product.name;
                square.dataset.featureId = feature.id;
                square.dataset.squareIndex = index;
              });
              li.appendChild(wrapper);
            } else {
              li.setAttribute('contenteditable', 'false');
              if (typeof cellHTML === 'string' && (cellHTML.includes('<div') || cellHTML.includes('<a href'))) {
                li.classList.add('is-complex');
              }
              li.innerHTML = cellHTML;
            }
            dataList.appendChild(li);
          });
        });
        contentWrapper.appendChild(dataList);
      } else if (product.cameras) {
        const cameraContainer = document.createElement('div');
        cameraContainer.className = 'camera-container';
        cameraContainer.style.display = 'flex';
        product.cameras.forEach(camera => {
          const subColumn = document.createElement('ul');
          subColumn.className = 'data-list';
          subColumn.style.flex = '1';
          data.featureGroups.forEach(group => {
            subColumn.innerHTML += `<li class="feature-group-header"></li>`;
            group.features.forEach(feature => {
              const value = camera[feature.id] !== undefined ? camera[feature.id] : '—';
              subColumn.innerHTML += `<li>${value}</li>`;
            });
          });
          cameraContainer.appendChild(subColumn);
        });
        contentWrapper.appendChild(cameraContainer);
      }

      productColumn.appendChild(contentWrapper);
      productsContainer.appendChild(productColumn);
    });

    targetElement.addEventListener('mouseover', (event) => {
      if (event.target.classList.contains('swatch')) {
        if (event.target.classList.contains('ar-swatch-link')) return;
        const swatch = event.target;
        const column = swatch.closest('.product-column');
        if (!column) return;
        const overlay = column.querySelector('.product-color-overlay');
        if (!overlay) return;

        overlay.style.transition = 'none';

        const swatchColor = swatch.style.backgroundColor;
        const rect = swatch.getBoundingClientRect();
        const columnRect = column.getBoundingClientRect();
        const x = rect.left - columnRect.left + (rect.width / 2);
        const y = rect.top - columnRect.top + (rect.height / 2);

        let transparentColor = 'rgba(128, 128, 128, 0.3)';
        if (swatchColor.startsWith('rgb')) {
          transparentColor = swatchColor.replace('rgb', 'rgba').replace(')', ', 0.3)');
        }
        overlay.style.backgroundColor = transparentColor;
        overlay.style.clipPath = `circle(0% at ${x}px ${y}px)`;

        setTimeout(() => {
          overlay.style.transition = 'clip-path 2s cubic-bezier(0.33, 0.66, 0.66, 1)';
          overlay.style.clipPath = `circle(250% at ${x}px ${y}px)`;
        }, 16);

      } else if (event.target.classList.contains('image-swap-link')) {
        const link = event.target;
        const imgSrc = link.dataset.imgSrc;
        if (imgSrc) {
          const newSrc = new URL(imgSrc, new URL(baseUrl, window.location.origin)).href;
          const productColumn = link.closest('.product-column');
          if (productColumn) {
            const image = productColumn.querySelector('.product-image');
            if (image && image.src !== newSrc) {
              image.src = newSrc;
              const imageType = link.dataset.imageType;
              image.dataset.currentImageType = imageType;
              webpMachine.polyfillDocument();
            }
          }
        }
      }
    });

    targetElement.addEventListener('mouseout', (event) => {
      if (event.target.classList.contains('swatch')) {
        if (event.target.classList.contains('ar-swatch-link')) return;
        const swatch = event.target;
        const column = swatch.closest('.product-column');
        if (column) {
          const overlay = column.querySelector('.product-color-overlay');
          if (overlay) {
            const rect = swatch.getBoundingClientRect();
            const columnRect = column.getBoundingClientRect();
            const x = rect.left - columnRect.left + (rect.width / 2);
            const y = rect.top - columnRect.top + (rect.height / 2);
            overlay.style.clipPath = `circle(0% at ${x}px ${y}px)`;
          }
        }
      }
    });

    targetElement.addEventListener('click', async (event) => {

      if (event.target.classList.contains('product-image')) {
        event.preventDefault();

        const imageElementToOpen = event.target;
        const imageSrc = imageElementToOpen.src;
        const imageAlt = imageElementToOpen.alt;

        const productTitleElement = imageElementToOpen.closest('.top-info').querySelector('.product-title');
        const productName = productTitleElement.innerHTML.split('<br>')[0].trim();
        const product = data.products.find(p => p.name === productName);

        const isDieObjectType = product && typeof product.images?.Die === 'object' && product.images.Die !== null;
        const isToggleableDie = isDieObjectType && Object.keys(product.images.Die).length > 1;

        let isCurrentlyShowingDie = imageElementToOpen.dataset.currentImageType === 'Die';

        if (!isCurrentlyShowingDie && isDieObjectType) {
          const dieUrls = Object.values(product.images.Die).map(url => new URL(url, new URL(baseUrl, window.location.origin)).href);
          if (dieUrls.includes(imageElementToOpen.src)) {
            isCurrentlyShowingDie = true;
          }
        }

        const shouldShowToggleButton = isToggleableDie && isCurrentlyShowingDie;

        const styleId = 'viewer-glass-styles';
        const filterId = 'viewer-glass-distortion';
        if (!document.getElementById(styleId)) {
          const svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgFilter.style.display = 'none';
          svgFilter.innerHTML = `<filter id="${filterId}" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="2" result="turbulence"/><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="R"/><feDisplacementMap in="R" in2="turbulence" scale="30" xChannelSelector="R" yChannelSelector="G" result="R_displaced"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="G"/><feDisplacementMap in="G" in2="turbulence" scale="15" xChannelSelector="R" yChannelSelector="G" result="G_displaced"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="B"/><feDisplacementMap in="B" in2="turbulence" scale="5" xChannelSelector="R" yChannelSelector="G" result="B_displaced"/><feComposite in="R_displaced" in2="G_displaced" operator="lighter" result="RG_combined"/><feComposite in="RG_combined" in2="B_displaced" operator="lighter"/></filter>`;
          document.body.appendChild(svgFilter);
          const styleElement = document.createElement('style');
          styleElement.id = styleId;
          styleElement.innerHTML = `.glass-button::before { content: ''; position: absolute; z-index: 2; inset: 0; border-radius: inherit; background: radial-gradient(circle 60px at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.35) 0%, transparent 85%); opacity: 0; transition: opacity 0.3s; } .glass-button:hover::before { opacity: 1; } .glass-button::after { content: ''; position: absolute; z-index: 3; inset: 0; border-radius: inherit; background-color: rgba(255, 255, 255, 0.7); opacity: 0; transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s; } .glass-button.mouse-down::after { transform: scale(1); opacity: 1; }`;
          document.head.appendChild(styleElement);
        }
        const viewerOverlay = document.createElement('div');
        Object.assign(viewerOverlay.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          webkitBackdropFilter: 'blur(10px)',
          zIndex: '10000',
          cursor: 'grab',
          opacity: '0',
          transition: 'opacity 0.3s ease',
          touchAction: 'none'
        });

        let imageElement = document.createElement('img');
        imageElement.src = imageSrc;
        imageElement.alt = imageAlt;
        Object.assign(imageElement.style, {
          maxWidth: '90vw',
          maxHeight: '90vh',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          cursor: 'grab',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          transformOrigin: 'center center',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        });

        const controlsContainer = document.createElement('div');
        Object.assign(controlsContainer.style, {
          position: 'absolute',
          bottom: '60px',
          display: 'flex',
          gap: '15px',
          zIndex: '10001',
          left: '50%',
          transform: 'translateX(-50%)'
        });
        const createGlassButton = (svgIcon, title) => {
          const btn = document.createElement('button');
          btn.title = title;
          Object.assign(btn.style, {
            position: 'relative',
            width: '60px',
            height: '60px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '50%',
            cursor: 'pointer',
            background: 'transparent',
            padding: '0',
            overflow: 'hidden',
            transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          });
          const effect = document.createElement('div');
          Object.assign(effect.style, {
            position: 'absolute',
            inset: '0',
            zIndex: '0',
            backdropFilter: 'blur(1px)',
            filter: `url(#${filterId})`
          });
          const tint = document.createElement('div');
          Object.assign(tint.style, {
            position: 'absolute',
            inset: '0',
            zIndex: '1',
            background: 'rgba(252, 253, 254, 0.05)',
            borderRadius: '50%'
          });
          const shine = document.createElement('div');
          Object.assign(shine.style, {
            position: 'absolute',
            inset: '0',
            zIndex: '2',
            boxShadow: 'inset 1px 1px 1px 0 rgba(255, 255, 255, 0.3)',
            borderRadius: '50%'
          });
          const iconContainer = document.createElement('div');
          iconContainer.innerHTML = svgIcon;
          Object.assign(iconContainer.style, {
            position: 'relative',
            zIndex: '3',
            color: 'white',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          });
          btn.append(effect, tint, shine, iconContainer);
          btn.addEventListener('mousemove', e => {
            const rect = btn.getBoundingClientRect();
            btn.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
            btn.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
          });
          btn.onmouseenter = () => btn.style.transform = 'scale(1.01)';
          btn.onmouseleave = () => {
            btn.style.transform = 'scale(1)';
            btn.classList.remove('mouse-down');
          };
          btn.onmousedown = () => {
            btn.style.transform = 'scale(0.96)';
            btn.classList.add('mouse-down');
          };
          btn.onmouseup = () => {
            btn.style.transform = 'scale(1.01)';
            btn.classList.remove('mouse-down');
          };
          btn.classList.add('glass-button');
          return btn;
        };
        const iconZoomIn = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 8V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const iconZoomOut = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const iconReset = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 5V12L17 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 7V2H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const iconClose = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const btnZoomIn = createGlassButton(iconZoomIn, 'Zoom In');
        const btnZoomOut = createGlassButton(iconZoomOut, 'Zoom Out');
        const btnReset = createGlassButton(iconReset, 'Reset');
        const btnClose = createGlassButton(iconClose, 'Close');

        let btnToggleDie = null;
        if (shouldShowToggleButton) {
          const iconToggle = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.25 10.33C20.4731 10.4578 20.6121 10.693 20.6121 10.95C20.6121 11.207 20.4731 11.4422 20.25 11.57L13.5 15.72C13.2769 15.8478 13.0121 15.8478 12.789 15.72L6 11.57C5.77694 11.4422 5.63788 11.207 5.63788 10.95C5.63788 10.693 5.77694 10.4578 6 10.33L12.75 6.28C12.9731 6.15219 13.2379 6.15219 13.461 6.28L20.25 10.33Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11.57V15.75C6 15.9489 6.1567 16.1056 6.35558 16.1056H12.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.25 11.57V15.11C20.25 15.3089 20.0933 15.4656 19.8944 15.4656H13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          btnToggleDie = createGlassButton(iconToggle, '切换视图');
        }

        if (btnToggleDie) {
          controlsContainer.append(btnZoomIn, btnZoomOut, btnToggleDie, btnReset, btnClose);
        } else {
          controlsContainer.append(btnZoomIn, btnZoomOut, btnReset, btnClose);
        }
        const closeViewer = () => {
          viewerOverlay.style.opacity = '0';
          cancelAnimationFrame(animationFrameId);
          window.removeEventListener('keydown', handleEscKey);
          viewerOverlay.addEventListener('transitionend', () => {
            const style = document.getElementById(styleId);
            const filter = document.getElementById(filterId)?.parentElement;
            if(style) style.remove();
            if(filter) filter.remove();
            viewerOverlay.remove();
          }, { once: true });
        };
        const handleEscKey = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeViewer();
          }
        };
        viewerOverlay.append(imageElement, controlsContainer);
        document.body.appendChild(viewerOverlay);
        window.addEventListener('keydown', handleEscKey);
        let scale = 1, offsetX = 0, offsetY = 0;
        let targetScale = 1, targetOffsetX = 0, targetOffsetY = 0;
        let isDragging = false, startPos = { x: 0, y: 0 };
        let animationFrameId = null;
        imageElement.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        const activePointers = new Map();
        let prevPinchDistance = null;

        const getDistance = (p1, p2) => {
          return Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        };
        
        const getMidpoint = (p1, p2) => {
          return {
            x: (p1.clientX + p2.clientX) / 2,
            y: (p1.clientY + p2.clientY) / 2,
          };
        };

        function tick() {
          const lerpFactor = 0.2;
          offsetX += (targetOffsetX - offsetX) * lerpFactor;
          offsetY += (targetOffsetY - offsetY) * lerpFactor;
          scale += (targetScale - scale) * lerpFactor;
          imageElement.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
          const isAnimationDone = Math.abs(targetOffsetX - offsetX) < 0.1 &&
                                  Math.abs(targetOffsetY - offsetY) < 0.1 &&
                                  Math.abs(targetScale - scale) < 0.001;

          if (isAnimationDone) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          } else {
            animationFrameId = requestAnimationFrame(tick);
          }
        }
        
        function updateTransform() {
            offsetX = targetOffsetX;
            offsetY = targetOffsetY;
            scale = targetScale;
            imageElement.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        }
        
        function applyZoom(delta, anchorX, anchorY) {
            const oldTargetScale = targetScale;
            targetScale = Math.max(1, Math.min(targetScale * delta, 10));
            if (targetScale === oldTargetScale) return;

            const scaleRatio = targetScale / oldTargetScale;

            targetOffsetX = anchorX - (anchorX - targetOffsetX) * scaleRatio;
            targetOffsetY = anchorY - (anchorY - targetOffsetY) * scaleRatio;
        }

        viewerOverlay.addEventListener('wheel', (e) => {
          e.preventDefault();
          const rect = viewerOverlay.getBoundingClientRect();
          const anchorX = e.clientX - rect.left - (rect.width / 2);
          const anchorY = e.clientY - rect.top - (rect.height / 2);
          applyZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, anchorX, anchorY);
          if (!animationFrameId) tick();
        });

        const onPointerDown = (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
            
            if (activePointers.size === 1) {
                isDragging = true;
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
                startPos = { x: e.clientX - targetOffsetX, y: e.clientY - targetOffsetY };
                viewerOverlay.style.cursor = 'grabbing';
            } else if (activePointers.size === 2) {
                isDragging = false;
                const pointers = Array.from(activePointers.values());
                prevPinchDistance = getDistance(pointers[0], pointers[1]);
            }
        };

        const onPointerMove = (e) => {
            if (!activePointers.has(e.pointerId)) return;
            activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

            if (activePointers.size === 1 && isDragging) {
                targetOffsetX = e.clientX - startPos.x;
                targetOffsetY = e.clientY - startPos.y;
                updateTransform();
            } else if (activePointers.size === 2 && prevPinchDistance) {
                const pointers = Array.from(activePointers.values());
                const currentDist = getDistance(pointers[0], pointers[1]);
                const zoomDelta = currentDist / prevPinchDistance;
                
                const midpoint = getMidpoint(pointers[0], pointers[1]);
                const rect = viewerOverlay.getBoundingClientRect();
                const anchorX = midpoint.x - rect.left - (rect.width / 2);
                const anchorY = midpoint.y - rect.top - (rect.height / 2);
                
                applyZoom(zoomDelta, anchorX, anchorY);
                updateTransform();

                prevPinchDistance = currentDist;
            }
        };

        const onPointerUp = (e) => {
            activePointers.delete(e.pointerId);
            
            if (activePointers.size < 2) {
                prevPinchDistance = null;
                isDragging = false;
                viewerOverlay.style.cursor = 'grab';
            }
            if (activePointers.size === 1) {
                const remainingPointer = Array.from(activePointers.values())[0];
                isDragging = true;
                startPos = { x: remainingPointer.clientX - targetOffsetX, y: remainingPointer.clientY - targetOffsetY };
            }
        };
        viewerOverlay.addEventListener('pointerdown', onPointerDown);
        viewerOverlay.addEventListener('pointermove', onPointerMove);
        viewerOverlay.addEventListener('pointerup', onPointerUp);
        viewerOverlay.addEventListener('pointercancel', onPointerUp);
        viewerOverlay.addEventListener('pointerleave', onPointerUp);
        viewerOverlay.addEventListener('click', (e) => {
          if (e.target === viewerOverlay) {
             closeViewer();
          }
        });

        const applyButtonZoom = (delta) => {
          applyZoom(delta, 0, 0);
          if (!animationFrameId) tick();
        };

        btnZoomIn.addEventListener('click', (e) => { e.stopPropagation(); applyButtonZoom(1.4); });
        btnZoomOut.addEventListener('click', (e) => { e.stopPropagation(); applyButtonZoom(1 / 1.4); });
        btnReset.addEventListener('click', (e) => {
          e.stopPropagation();
          targetScale = 1; targetOffsetX = 0; targetOffsetY = 0;
          if (!animationFrameId) tick();
        });
        btnClose.addEventListener('click', (e) => { e.stopPropagation(); closeViewer(); });
 
        if (btnToggleDie) {
          let dieViewData = null;
          let currentViewIndex = -1;
          const getDimensions = url => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({
              width: img.naturalWidth,
              height: img.naturalHeight
            });
            img.onerror = err => reject(err);
            img.src = url;
          });
          try {
            const resolvedBaseUrl = new URL(baseUrl, window.location.origin);
            const viewPromises = Object.entries(product.images.Die).map(([name, url]) => getDimensions(new URL(url, resolvedBaseUrl).href).then(dims => ({
              name,
              url: new URL(url, resolvedBaseUrl).href,
              ...dims
            })));
            dieViewData = await Promise.all(viewPromises);
            currentViewIndex = dieViewData.findIndex(view => view.url === imageSrc);
            if (currentViewIndex === -1) {
              currentViewIndex = 0;
            }
          } catch (err) {
            console.error("无法加载 Die 视图尺寸，切换功能已禁用。", err);
            btnToggleDie.remove();
          }
          if (dieViewData && dieViewData.length > 0) {
            const updateToggleButton = () => {
              const next = (currentViewIndex + 1) % dieViewData.length;
              btnToggleDie.title = `切换到 ${dieViewData[next].name}`;
            };

            btnToggleDie.addEventListener('click', e => {
              e.stopPropagation();
              
              if (viewerOverlay.dataset.isFading) return;
              viewerOverlay.dataset.isFading = 'true';

              const oldView = dieViewData[currentViewIndex];
              currentViewIndex = (currentViewIndex + 1) % dieViewData.length;
              const newView = dieViewData[currentViewIndex];
              
              const oldImageElement = imageElement;
              const newImageElement = oldImageElement.cloneNode(false);
              const baseAbsoluteTransform = 'translate(-50%, -50%) ';
              const currentRelativeTransform = `translate(${targetOffsetX}px, ${targetOffsetY}px) scale(${targetScale})`;
              
              Object.assign(oldImageElement.style, {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: baseAbsoluteTransform + currentRelativeTransform,
                  transition: 'opacity 0.4s ease-in-out'
              });
              
              Object.assign(newImageElement.style, {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  opacity: '0',
                  transition: 'opacity 0.4s ease-in-out'
              });

              newImageElement.onload = () => {
                newImageElement.onload = null;
                newImageElement.onerror = null;
                
                const oldRect = oldImageElement.getBoundingClientRect();
                const oldBaseWidth = oldRect.width / targetScale;
                const oldBaseHeight = oldRect.height / targetScale;
                
                newImageElement.style.width = `${oldBaseWidth}px`;
                newImageElement.style.height = `${oldBaseHeight}px`;
                newImageElement.style.transform = baseAbsoluteTransform + currentRelativeTransform;

                requestAnimationFrame(() => {
                    newImageElement.style.opacity = 1;
                    oldImageElement.style.opacity = 0;
                });
              };
              
              newImageElement.onerror = () => {
                console.error(`Failed to load image: ${newView.url}`);
                newImageElement.onerror = null;
                Object.assign(oldImageElement.style, {
                    position: '', top: '', left: '', transition: '', opacity: 1
                });
                oldImageElement.style.transform = baseAbsoluteTransform + currentRelativeTransform;
                newImageElement.remove();
                delete viewerOverlay.dataset.isFading;
              };
              oldImageElement.addEventListener('transitionend', function onFadeEnd(e) {
                if (e.propertyName !== 'opacity' || oldImageElement.style.opacity !== '0') return;
                
                oldImageElement.removeEventListener('transitionend', onFadeEnd);
                
                oldImageElement.remove();
                
                imageElement = newImageElement;
                delete viewerOverlay.dataset.isFading;
              }, { once: true });

              viewerOverlay.prepend(newImageElement);
              newImageElement.src = newView.url;
              
              updateToggleButton();
            });
            updateToggleButton();
          }
        }
        requestAnimationFrame(() => {
          viewerOverlay.style.opacity = '1';
        });
      }
    });
    return targetElement;

  } catch (error) {
    targetElement.innerHTML = `<div style="color:red; text-align:center; padding: 50px;">加载对比数据失败。<br>${error.message}</div>`;
  }
}

export function syncRowHeights(gridContainer) {
  if (!gridContainer) return;
  const featureRows = Array.from(gridContainer.querySelectorAll('.features-column .features-list li'));
  const productColumns = Array.from(gridContainer.querySelectorAll('.products-grid-container .product-column'));
  if (!featureRows.length) return;

  requestAnimationFrame(() => {
    featureRows.forEach((featureRow, i) => {
      const currentRowCells = [featureRow];
      productColumns.forEach(column => {
        const cellsInColumn = column.querySelectorAll(`.data-list li:nth-child(${i + 1})`);
        if (cellsInColumn.length > 0) {
          cellsInColumn.forEach(cell => currentRowCells.push(cell));
        }
      });

      currentRowCells.forEach(cell => {
        cell.style.height = 'auto';
        const infoSquares = cell.querySelectorAll('.info-square');
        if (infoSquares.length > 4) {
          cell.classList.add('two-column-layout');
        } else {
          cell.classList.remove('two-column-layout');
        }
      });

      let maxInnerBlockHeight = 0;
      currentRowCells.forEach(cell => {
        const innerBlocks = cell.querySelectorAll('.info-square');
        innerBlocks.forEach(block => {
          block.style.height = 'auto';
          maxInnerBlockHeight = Math.max(maxInnerBlockHeight, block.offsetHeight);
        });
      });

      if (maxInnerBlockHeight > 0) {
        currentRowCells.forEach(cell => {
          cell.querySelectorAll('.info-square').forEach(block => {
            block.style.height = `${maxInnerBlockHeight}px`;
          });
        });
      }

      let maxRowHeight = 0;
      currentRowCells.forEach(cell => {
        maxRowHeight = Math.max(maxRowHeight, cell.offsetHeight);
      });
      maxRowHeight = Math.max(maxRowHeight, 46);

      currentRowCells.forEach(cell => {
        cell.style.height = `${maxRowHeight}px`;
      });
    });
  });
}
