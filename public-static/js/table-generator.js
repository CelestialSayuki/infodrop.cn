async function renderComparisonTable(jsonUrl, targetElement, baseUrl) {
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
            li.innerHTML = cellHTML;

            if (typeof cellHTML === 'string' && (
                cellHTML.includes('info-square')
            )) {
                li.classList.add('multi-div-row');
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

      // Image swap link
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

    return targetElement;

  } catch (error) {
    console.error('渲染对比表格时出错:', error);
    targetElement.innerHTML = `<div style="color:red; text-align:center; padding: 50px;">加载对比数据失败。<br>${error.message}</div>`;
  }
}

function syncRowHeights(gridContainer) {
  if (!gridContainer) return;
  const featureRows = Array.from(gridContainer.querySelectorAll('.features-column .features-list li'));
  const productColumns = Array.from(gridContainer.querySelectorAll('.products-grid-container .product-column'));
  if (!featureRows.length) return;

  requestAnimationFrame(() => {
    featureRows.forEach((featureRow, i) => {
      const currentRowCells = [featureRow];
      productColumns.forEach(column => {
        const cell = column.querySelector(`.data-list li:nth-child(${i + 1})`);
        if (cell) currentRowCells.push(cell);
      });

      currentRowCells.forEach(cell => {
        cell.style.height = 'auto';
        const infoSquares = cell.querySelectorAll('.info-square');
        if (infoSquares.length > 3) {
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
