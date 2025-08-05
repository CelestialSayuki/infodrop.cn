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
            if (feature.id === 'displayType' && product.images && Array.isArray(product.data.displayType)) {
              cellHTML = product.data.displayType.map(text =>
                `<a href="#" class="image-swap-link" data-img-src="${product.images[text] || ''}">${text}</a>`
              ).join(' / ');
            } else {
              const value = product.data[feature.id];
              cellHTML = (value !== undefined && value !== null) ? value : '—';
              if (feature.id === 'colors' && Array.isArray(value)) {
                cellHTML = `<div class="color-swatches">${value.map(c => `<div class="swatch" style="background-color: ${c.hex};" title="${c.name}"></div>`).join('')}</div>`;
              }
            }
            dataList.innerHTML += `<li>${cellHTML}</li>`;
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
            }
          }
        }
      }
    });

    targetElement.addEventListener('mouseout', (event) => {
      if (event.target.classList.contains('swatch')) {
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
  const featureRows = gridContainer.querySelectorAll('.features-column .features-list li');
  const productColumns = gridContainer.querySelectorAll('.products-grid-container .product-column');
  if (!featureRows.length || !productColumns.length) return;

  requestAnimationFrame(() => {
    for (let i = 0; i < featureRows.length; i++) {
      let maxRowHeight = 0;
      const currentRowCells = [featureRows[i]];
      productColumns.forEach(column => {
        const cells = column.querySelectorAll(`.data-list li:nth-child(${i + 1})`);
        if (cells.length > 0) cells.forEach(cell => currentRowCells.push(cell));
      });

      let maxInnerBlockHeight = 0;
      currentRowCells.forEach(cell => {
        const innerBlocks = cell.querySelectorAll('.li-div-score, .li-div-gpu, .li-div-cpu, .li-div-npu');
        if (innerBlocks.length > 0) {
          innerBlocks.forEach(block => {
            block.style.height = 'auto';
            maxInnerBlockHeight = Math.max(maxInnerBlockHeight, block.offsetHeight);
          });
        }
      });

      if (maxInnerBlockHeight > 0) {
        currentRowCells.forEach(cell => {
          const innerBlocks = cell.querySelectorAll('.li-div-score, .li-div-gpu, .li-div-cpu, .li-div-npu');
          innerBlocks.forEach(block => {
            block.style.height = `${maxInnerBlockHeight}px`;
          });
        });
      }

      currentRowCells.forEach(cell => {
        cell.style.height = 'auto';
        maxRowHeight = Math.max(maxRowHeight, cell.offsetHeight);
      });
      maxRowHeight = Math.max(maxRowHeight, 46);

      currentRowCells.forEach(cell => {
        cell.style.height = `${maxRowHeight}px`;
      });
    }
  });
}
