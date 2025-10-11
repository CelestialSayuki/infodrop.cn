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
              cellHTML = value.map(text =>
                `<a href="#" class="image-swap-link" data-img-src="${product.images[text] || ''}">${text}</a>`
              ).join(' / ');

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

    targetElement.addEventListener('click', (event) => {
      if (event.target.classList.contains('product-image')) {
        event.preventDefault();

        const imageSrc = event.target.src;
        const imageAlt = event.target.alt;

        const styleId = 'viewer-glass-styles';
        const filterId = 'viewer-glass-distortion';

        if (!document.getElementById(styleId)) {
          const svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgFilter.style.display = 'none';
          svgFilter.innerHTML = `
              <filter id="${filterId}" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
                  <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="1" seed="2" result="turbulence"/>
                  <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="20" xChannelSelector="R" yChannelSelector="G"/>
              </filter>
            `;
          document.body.appendChild(svgFilter);

          const styleElement = document.createElement('style');
          styleElement.id = styleId;
          styleElement.innerHTML = `
              .glass-button::before {
                  content: '';
                  position: absolute;
                  z-index: 2;
                  inset: 0;
                  border-radius: inherit;
                  background: radial-gradient(circle 60px at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.35) 0%, transparent 85%);
                  opacity: 0;
                  transition: opacity 0.3s ease-in-out;
              }
              .glass-button:hover::before {
                  opacity: 1;
              }
            `;
          document.head.appendChild(styleElement);
        }

        const viewerOverlay = document.createElement('div');
        Object.assign(viewerOverlay.style, {
          position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)', webkitBackdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: '10000', cursor: 'grab', opacity: '0',
          transition: 'opacity 0.3s ease'
        });

        const imageElement = document.createElement('img');
        imageElement.src = imageSrc;
        imageElement.alt = imageAlt;

        Object.assign(imageElement.style, {
          maxWidth: '90vw',
          maxHeight: '90vh',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          cursor: 'grab',
          willChange: 'transform',
          backfaceVisibility: 'hidden'
        });

        const controlsContainer = document.createElement('div');
        Object.assign(controlsContainer.style, {
          position: 'absolute', bottom: '30px', left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', gap: '15px', zIndex: '10001'
        });

        const createGlassButton = (svgIcon, title) => {
          const btn = document.createElement('button');
          btn.title = title;
          const originalShadow = '0 8px 32px 0 rgba(169, 206, 236, 0.2)';
          const hoverShadow = '0 10px 32px 0 rgba(169, 206, 236, 0.4)';
          const activeShadow = '0 4px 16px 0 rgba(169, 206, 236, 0.2)';

          Object.assign(btn.style, {
            position: 'relative', width: '60px', height: '60px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '50%', cursor: 'pointer',
            boxShadow: originalShadow,
            background: 'transparent',
            padding: '0',
            overflow: 'hidden',
            transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          });

          const effect = document.createElement('div');
          Object.assign(effect.style, {
            position: 'absolute', inset: '0', zIndex: '0',
            backdropFilter: 'blur(5px)',
            filter: `url(#${filterId})`
          });

          const tint = document.createElement('div');
          Object.assign(tint.style, {
            position: 'absolute', inset: '0', zIndex: '1',
            background: 'rgba(252, 253, 254, 0.15)',
            borderRadius: '50%'
          });

          const shine = document.createElement('div');
          Object.assign(shine.style, {
            position: 'absolute', inset: '0', zIndex: '2',
            boxShadow: 'inset 1px 1px 1px 0 rgba(255, 255, 255, 0.4)',
            borderRadius: '50%'
          });

          const iconContainer = document.createElement('div');
          iconContainer.innerHTML = svgIcon;
          Object.assign(iconContainer.style, {
            position: 'relative', zIndex: '3', color: 'white',
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          });

          btn.append(effect, tint, shine, iconContainer);

          btn.addEventListener('mousemove', e => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            btn.style.setProperty('--mouse-x', `${x}px`);
            btn.style.setProperty('--mouse-y', `${y}px`);
          });

          btn.onmouseenter = () => {
            btn.style.transform = 'scale(1.01)';
            btn.style.boxShadow = hoverShadow;
          };
          btn.onmouseleave = () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = originalShadow;
          };
          btn.onmousedown = () => {
            btn.style.transform = 'scale(0.96)';
            btn.style.boxShadow = activeShadow;
          };
          btn.onmouseup = () => {
            btn.style.transform = 'scale(1.01)';
            btn.style.boxShadow = hoverShadow;
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

        controlsContainer.append(btnZoomIn, btnZoomOut, btnReset, btnClose);
        viewerOverlay.append(imageElement, controlsContainer);
        document.body.appendChild(viewerOverlay);

        let scale = 1, offsetX = 0, offsetY = 0;
        let targetScale = 1, targetOffsetX = 0, targetOffsetY = 0;
        let isDragging = false, startPos = { x: 0, y: 0 };
        let animationFrameId = null;

        function tick() {
          const lerpFactor = 0.2;
          offsetX += (targetOffsetX - offsetX) * lerpFactor;
          offsetY += (targetOffsetY - offsetY) * lerpFactor;
          scale += (targetScale - scale) * lerpFactor;

          imageElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

          const isAnimationDone = Math.abs(targetOffsetX - offsetX) < 0.1 &&
                                  Math.abs(targetOffsetY - offsetY) < 0.1 &&
                                  Math.abs(targetScale - scale) < 0.001;

          if (isAnimationDone) {
            offsetX = targetOffsetX;
            offsetY = targetOffsetY;
            scale = targetScale;
            imageElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          } else {
            animationFrameId = requestAnimationFrame(tick);
          }
        }

        function updateZoom(delta, anchorX, anchorY) {
          const oldTargetScale = targetScale;
          targetScale = Math.max(1, Math.min(targetScale * delta, 10));
          if (targetScale === oldTargetScale) return;

          const scaleRatio = targetScale / oldTargetScale;

          targetOffsetX = anchorX - (anchorX - targetOffsetX) * scaleRatio;
          targetOffsetY = anchorY - (anchorY - targetOffsetY) * scaleRatio;

          if (!animationFrameId) {
            tick();
          }
        }

        const onPointerMove = (e) => {
          if (isDragging) {
            doPan(e);
          }
        };

        viewerOverlay.addEventListener('wheel', (e) => {
          e.preventDefault();
          const rect = viewerOverlay.getBoundingClientRect();
          const anchorX = e.clientX - rect.left - (rect.width / 2);
          const anchorY = e.clientY - rect.top - (rect.height / 2);
          updateZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, anchorX, anchorY);
        });

        const startPan = (e) => {
          if (e.target.closest('button')) return;
          e.preventDefault();
          isDragging = true;
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
          startPos = { x: e.clientX - targetOffsetX, y: e.clientY - targetOffsetY };
          viewerOverlay.style.cursor = 'grabbing';
        };

        const doPan = (e) => {
          e.preventDefault();
          targetOffsetX = e.clientX - startPos.x;
          targetOffsetY = e.clientY - startPos.y;
          offsetX = targetOffsetX;
          offsetY = targetOffsetY;
          scale = targetScale;
          imageElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        };

        const endPan = () => {
          if (!isDragging) return;
          isDragging = false;
          viewerOverlay.style.cursor = 'grab';
        };

        viewerOverlay.addEventListener('pointerdown', startPan);
        viewerOverlay.addEventListener('pointermove', onPointerMove);
        viewerOverlay.addEventListener('pointerup', endPan);
        viewerOverlay.addEventListener('pointerleave', endPan);

        const closeViewer = () => {
          viewerOverlay.style.opacity = '0';
          cancelAnimationFrame(animationFrameId);
          viewerOverlay.removeEventListener('pointermove', onPointerMove);
          viewerOverlay.addEventListener('transitionend', () => {
            const style = document.getElementById(styleId);
            const filter = document.getElementById(filterId)?.parentElement;
            if(style) style.remove();
            if(filter) filter.remove();
            viewerOverlay.remove();
          }, { once: true });
        };

        viewerOverlay.addEventListener('click', (e) => {
          if (e.target === viewerOverlay) {
             closeViewer();
          }
        });

        const applyButtonZoom = (delta) => {
          const oldTargetScale = targetScale;
          targetScale = Math.max(1, Math.min(targetScale * delta, 10));
          if(targetScale === oldTargetScale) return;

          const scaleRatio = targetScale / oldTargetScale;

          targetOffsetX *= scaleRatio;
          targetOffsetY *= scaleRatio;

          if (!animationFrameId) {
            tick();
          }
        };

        btnZoomIn.addEventListener('click', (e) => { e.stopPropagation(); applyButtonZoom(1.4); });
        btnZoomOut.addEventListener('click', (e) => { e.stopPropagation(); applyButtonZoom(1 / 1.4); });
        btnReset.addEventListener('click', (e) => {
          e.stopPropagation();
          targetScale = 1; targetOffsetX = 0; targetOffsetY = 0;
          if (!animationFrameId) tick();
        });
        btnClose.addEventListener('click', (e) => { e.stopPropagation(); closeViewer(); });

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
